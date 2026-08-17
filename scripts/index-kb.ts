import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../src/config.js';
import { embedTexts } from '../src/knowledge/embed.js';
import { indexKnowledgeBase } from '../src/knowledge/indexer.js';
import type { IndexEntry } from '../src/knowledge/store.js';

const BATCH_SIZE = 64;

async function main(): Promise<void> {
  console.log(`Indexing knowledge base at ${config.kbPath} ...`);
  const chunks = await indexKnowledgeBase(config.kbPath);
  console.log(`Found ${chunks.length} chunks.`);

  const entries: IndexEntry[] = [];
  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const vectors = await embedTexts(batch.map((c) => c.content));
    for (let j = 0; j < batch.length; j++) {
      entries.push({ chunk: batch[j], vector: vectors[j] });
    }
    console.log(`Embedded ${Math.min(i + batch.length, chunks.length)}/${chunks.length}`);
  }

  await fs.mkdir(path.dirname(config.kbIndexPath), { recursive: true });
  await fs.writeFile(config.kbIndexPath, JSON.stringify({ version: 1, entries }));
  console.log(`Wrote index to ${config.kbIndexPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});