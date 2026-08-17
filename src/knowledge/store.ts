import fs from 'node:fs';
import type { KnowledgeChunk } from './indexer.js';

export interface IndexEntry {
  chunk: KnowledgeChunk;
  vector: number[];
}

export interface SearchResult {
  chunk: KnowledgeChunk;
  score: number;
}

export function loadIndex(indexPath: string): IndexEntry[] {
  let raw: string;
  try {
    raw = fs.readFileSync(indexPath, 'utf8');
  } catch {
    throw new Error(`Knowledge index not found at ${indexPath}. Run \`pnpm index:kb\` first.`);
  }
  const data = JSON.parse(raw) as { entries: IndexEntry[] };
  if (!Array.isArray(data.entries) || data.entries.length === 0) {
    throw new Error(`Knowledge index at ${indexPath} is empty. Run \`pnpm index:kb\` first.`);
  }
  return data.entries;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function search(entries: IndexEntry[], queryVector: number[], topK: number): SearchResult[] {
  return entries
    .map((entry) => ({ chunk: entry.chunk, score: cosineSimilarity(entry.vector, queryVector) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}