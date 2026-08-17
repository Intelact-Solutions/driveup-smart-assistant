import 'dotenv/config';
import path from 'node:path';

export const projectRoot = process.cwd();

export const config = {
  port: Number(process.env.PORT ?? 3001),
  kbPath: path.resolve(projectRoot, process.env.KB_PATH ?? '../docs/kb'),
  kbIndexPath: path.resolve(projectRoot, process.env.KB_INDEX_PATH ?? 'data/kb-index.json'),
  labelsPath: path.resolve(projectRoot, process.env.LABELS_PATH ?? 'data/labels.json'),
  topK: Number(process.env.TOP_K ?? 8),
  maxTokens: Number(process.env.MAX_TOKENS ?? 1024),
  conversationMaxMessages: Number(process.env.CONVERSATION_MAX_MESSAGES ?? 12),
  conversationTtlMinutes: Number(process.env.CONVERSATION_TTL_MINUTES ?? 60),
  conversationContextQueries: Number(
    process.env.CONVERSATION_CONTEXT_QUERIES ?? 3,
  ),
  deepSeek: {
    apiKey: process.env.DEEPSEEK_API_KEY ?? '',
    baseUrl: (process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com').replace(/\/$/, ''),
    model: process.env.DEEPSEEK_MODEL ?? 'deepseek-chat',
  },
};