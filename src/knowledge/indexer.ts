import fs from 'node:fs/promises';
import path from 'node:path';

export interface KnowledgeChunk {
  id: string;
  file: string;
  title: string;
  content: string;
}

const TEXT_EXTENSIONS = new Set(['.md', '.markdown', '.feature']);

export async function indexKnowledgeBase(kbPath: string): Promise<KnowledgeChunk[]> {
  const chunks: KnowledgeChunk[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (/^user-stories$/i.test(entry.name)) continue;
        await walk(full);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (!TEXT_EXTENSIONS.has(ext)) continue;
        const rel = path.relative(kbPath, full).replace(/\\/g, '/');
        const text = await fs.readFile(full, 'utf8');
        const fileChunks = ext === '.feature' ? splitFeature(rel, text) : splitMarkdown(rel, text);
        for (const chunk of fileChunks) {
          if (chunk.content.trim().length >= 30) chunks.push(chunk);
        }
      }
    }
  }

  await walk(kbPath);
  return chunks;
}

function splitFeature(filePath: string, text: string): KnowledgeChunk[] {
  const trimmed = text.trim();
  const featureMatch = trimmed.match(/^Feature:\s*(.+)$/m);
  const featureName = featureMatch ? featureMatch[1].trim() : filePath;

  const scenarioRegex = /^\s*Scenario(?:\s*Outline)?:\s*(.+)$/gm;
  const matches = [...trimmed.matchAll(scenarioRegex)];

  if (matches.length === 0) {
    return [{ id: `${filePath}#0`, file: filePath, title: featureName, content: trimmed }];
  }

  return matches.map((match, i) => {
    const start = match.index ?? 0;
    const end = i + 1 < matches.length ? (matches[i + 1].index ?? trimmed.length) : trimmed.length;
    const block = trimmed.slice(start, end).trim();
    const scenarioTitle = match[1].trim();
    return {
      id: `${filePath}#${i}`,
      file: filePath,
      title: `${featureName} — ${scenarioTitle}`,
      content: `Feature: ${featureName}\n${block}`,
    };
  });
}

function splitMarkdown(filePath: string, text: string): KnowledgeChunk[] {
  const chunks: KnowledgeChunk[] = [];
  let heading = filePath;
  let lines: string[] = [];

  const flush = () => {
    const content = lines.join('\n').trim();
    if (content.length) {
      chunks.push({ id: `${filePath}#${chunks.length}`, file: filePath, title: heading, content });
    }
  };

  for (const line of text.split(/\r?\n/)) {
    if (/^#{1,6}\s/.test(line)) {
      flush();
      heading = line.replace(/^#+\s*/, '').trim();
      lines = [line];
    } else {
      lines.push(line);
    }
  }
  flush();
  return chunks;
}