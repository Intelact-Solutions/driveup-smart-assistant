import { randomUUID } from 'node:crypto';
import { config } from './config.js';

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface Conversation {
  id: string;
  messages: ConversationMessage[];
  lastAccess: number;
}

const store = new Map<string, Conversation>();

function now(): number {
  return Date.now();
}

export function getOrCreateConversation(id?: string): Conversation {
  const provided = id?.trim();
  if (provided && provided.length <= 128) {
    const existing = store.get(provided);
    if (existing) {
      existing.lastAccess = now();
      return existing;
    }
  }

  const conversation: Conversation = {
    id: randomUUID(),
    messages: [],
    lastAccess: now(),
  };
  store.set(conversation.id, conversation);
  return conversation;
}

export function appendTurn(
  conversation: Conversation,
  userMessage: string,
  assistantMessage: string,
): void {
  conversation.messages.push(
    { role: 'user', content: userMessage },
    { role: 'assistant', content: assistantMessage },
  );
  conversation.lastAccess = now();
  if (conversation.messages.length > config.conversationMaxMessages) {
    conversation.messages.splice(
      0,
      conversation.messages.length - config.conversationMaxMessages,
    );
  }
}

export function recentUserMessages(
  conversation: Conversation,
  limit = config.conversationContextQueries,
): string[] {
  return conversation.messages
    .filter((m) => m.role === 'user')
    .slice(-limit)
    .map((m) => m.content);
}

export function conversationHistory(conversation: Conversation): ConversationMessage[] {
  return conversation.messages;
}

function evictStaleConversations(): void {
  const ttlMs = config.conversationTtlMinutes * 60 * 1000;
  const cutoff = now() - ttlMs;
  for (const [id, conversation] of store) {
    if (conversation.lastAccess < cutoff) {
      store.delete(id);
    }
  }
}

setInterval(evictStaleConversations, 5 * 60 * 1000).unref();
