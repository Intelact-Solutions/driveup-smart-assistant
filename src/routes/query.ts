import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { config, projectRoot } from '../config.js';
import { embedTexts } from '../knowledge/embed.js';
import { loadIndex, search } from '../knowledge/store.js';
import type { IndexEntry, SearchResult } from '../knowledge/store.js';
import { chatDeepSeek, maxTokensForLanguage } from '../llm.js';
import {
  appendTurn,
  conversationHistory,
  getOrCreateConversation,
  recentUserMessages,
} from '../memory.js';
import type { Conversation } from '../memory.js';

const SYSTEM_PROMPT = (platform: string): string =>
  (platform === 'admin'
    ? 'This chat runs inside the DriveUp Admin web platform, which driving school owners, managers and instructors use on their computers. ' +
      'Answer from the perspective of the admin user and describe how things work in the web admin (back-office). ' +
      'Only describe the mobile app if the user explicitly asks about it (for example "mobile", "app", "smartphone", "android", "iOS"). '
    : '') +
  'You are a friendly and helpful assistant for DriveUp, a driving school app. ' +
  'Talk to the user like a colleague would: warm, clear, and down to earth. ' +
  'Avoid jargon and overly technical language — explain things in plain, everyday words. ' +
  'Keep your replies conversational and concise. ' +
  'You are continuing a conversation. Use the conversation history for context: the user may ask follow-up questions that refer to earlier messages (for example "and in that role?" or "and in German?"). Answer based only on the relevant information provided below and the conversation history — never invent facts that are not present in the information. ' +
  'Never mention a knowledge base, database, sources, or file paths. ' +
  'Never mention internal tickets, user stories, or story IDs. ' +
  'When you mention any button, menu item or screen name, use the localized label provided for it instead of the English one. ' +
  'Give a complete answer: cover every relevant point from the information, including all reasons, exceptions, restrictions and warnings. ' +
  'Do not shorten or condense the answer — keep the same level of detail in every language. ' +
  'Give the best answer you can — do not point out what is missing or express uncertainty, ' +
  'unless there is really no relevant information at all (only then say you do not have that information). ' +
  'Respond in the same language as the user question (English, German, French or Italian).';

type LabelMap = Record<string, Record<string, string>>;

let labelsCache: LabelMap | null = null;

function loadLabels(): LabelMap {
  if (!labelsCache) {
    try {
      labelsCache = JSON.parse(fs.readFileSync(config.labelsPath, 'utf8')) as LabelMap;
    } catch {
      labelsCache = {};
    }
  }
  return labelsCache;
}

const STOPWORDS: Record<string, string[]> = {
  de: ['wie', 'was', 'welche', 'welcher', 'welches', 'ich', 'kann', 'bitte', 'gibt', 'eine', 'einem', 'für', 'und', 'nicht', 'ist', 'sind', 'auf', 'von', 'mit', 'der', 'die', 'das', 'den', 'dem', 'man', 'wenn', 'wird', 'können', 'termin', 'fahrt', 'schüler'],
  fr: ['comment', 'est-ce', 'est ce', 'je', 'vous', 'nous', 'pour', 'avec', 'dans', 'pas', 'une', 'les', 'des', 'peut', 'quand', 'quoi', 'leçon', 'moniteur', 'rendez-vous'],
  it: ['come', 'posso', 'sono', 'dove', 'quando', 'quale', 'quali', 'con', 'per', 'che', 'non', 'della', 'del', 'delle', 'gli', 'alle', 'corso', 'lezione', 'studente'],
};

function detectLanguage(text: string): string {
  const lower = text.toLowerCase();
  if (/[ßäöü]/.test(lower)) return 'de';
  let best = 'en';
  let bestScore = 0;
  for (const [lang, words] of Object.entries(STOPWORDS)) {
    let score = 0;
    for (const w of words) {
      if (new RegExp(`\\b${w}\\b`).test(lower)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      best = lang;
    }
  }
  return best;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const MOBILE_INTENT =
  /\b(mobile|mobil|app|smartphone|android|ios|iphone|handy|appli)\b/i;

function hasMobileIntent(question: string, context: string[]): boolean {
  return [question, ...context].some((text) => MOBILE_INTENT.test(text));
}

function isMobileChunk(file: string): boolean {
  const normalized = file.replace(/\\/g, '/').toLowerCase();
  return normalized.startsWith('features/mobile/') || normalized.startsWith('mobile/');
}

function buildLabelHints(labels: LabelMap, language: string, text: string, max = 50): string[] {
  const dict = labels[language] ?? {};
  const hints: string[] = [];
  const used = new Set<string>();
  for (const [en, localized] of Object.entries(dict)) {
    if (used.has(en) || !localized || localized === en) continue;
    const re = new RegExp(`\\b${escapeRegExp(en)}\\b`, 'i');
    if (!re.test(text)) continue;
    hints.push(`"${en}" = "${localized}"`);
    used.add(en);
    if (hints.length >= max) break;
  }
  return hints;
}

function buildRetrievalQueries(
  question: string,
  conversation: Conversation,
  maxContext: number,
): string[] {
  const queries = [question];
  const recent = recentUserMessages(conversation, maxContext);
  if (recent.length > 0) {
    queries.push([...recent, question].join(' ').slice(0, 512));
  }
  return queries;
}

function mergeSearchResults(
  entries: IndexEntry[],
  queryVectors: number[][],
  topK: number,
): SearchResult[] {
  const byId = new Map<string, SearchResult>();
  for (const vector of queryVectors) {
    for (const result of search(entries, vector, topK * 2)) {
      const existing = byId.get(result.chunk.id);
      if (!existing || result.score > existing.score) {
        byId.set(result.chunk.id, result);
      }
    }
  }
  return [...byId.values()].sort((a, b) => b.score - a.score).slice(0, topK);
}

export const queryRouter = Router();

queryRouter.get('/', (_req, res) => {
  res.sendFile(path.join(projectRoot, 'public', 'index.html'));
});

queryRouter.post('/query', async (req, res) => {
  try {
    const question = typeof req.body?.question === 'string' ? req.body.question.trim() : '';
    if (!question) {
      return res.status(400).json({ error: 'question is required' });
    }
    const rawConversationId =
      typeof req.body?.conversationId === 'string' ? req.body.conversationId.trim() : '';
    const conversation = getOrCreateConversation(rawConversationId || undefined);
    const platform = typeof req.body?.platform === 'string' ? req.body.platform.trim() : '';

    const index = loadIndex(config.kbIndexPath);

    const retrievalQueries = buildRetrievalQueries(
      question,
      conversation,
      config.conversationContextQueries,
    );

    const recentUserTurns = recentUserMessages(conversation, config.conversationContextQueries);
    const mobileIntent = hasMobileIntent(question, recentUserTurns);
    const searchable =
      platform === 'admin' && !mobileIntent
        ? index.filter((entry) => !isMobileChunk(entry.chunk.file))
        : index;

    const queryVectors = await embedTexts(retrievalQueries);
    const results = mergeSearchResults(searchable, queryVectors, config.topK);

    const excerpts = results
      .map((r, i) => `[${i + 1}] File: ${r.chunk.file}\n${r.chunk.content}`)
      .join('\n\n---\n\n');

    const language = detectLanguage(question);
    const hints = buildLabelHints(loadLabels(), language, results.map((r) => r.chunk.content).join(' '));
    const labelsBlock =
      hints.length > 0
        ? `\n\nLocalized UI labels — use these for any buttons, menu items or screens you mention:\n${hints.join('\n')}\n`
        : '';

    const userPrompt = `Relevant information:\n\n${excerpts}${labelsBlock}\n\n---\n\nQuestion: ${question}`;

    const answer = await chatDeepSeek(
      [
        { role: 'system', content: SYSTEM_PROMPT(platform) },
        ...conversationHistory(conversation),
        { role: 'user', content: userPrompt },
      ],
      maxTokensForLanguage(language),
    );

    appendTurn(conversation, question, answer);

    res.json({
      conversationId: conversation.id,
      answer,
      sources: results.map((r) => ({
        file: r.chunk.file,
        title: r.chunk.title,
        score: Number(r.score.toFixed(4)),
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    const status = message.startsWith('Knowledge index') ? 503 : 500;
    res.status(status).json({ error: message });
  }
});