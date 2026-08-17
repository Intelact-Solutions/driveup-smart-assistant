import { pipeline } from '@xenova/transformers';

type Extractor = (
  texts: string[],
  options?: { pooling?: string; normalize?: boolean },
) => Promise<{ tolist: () => number[][] }>;

let extractorPromise: Promise<Extractor> | null = null;

function getExtractor(): Promise<Extractor> {
  if (!extractorPromise) {
    extractorPromise = pipeline('feature-extraction', 'Xenova/paraphrase-multilingual-MiniLM-L12-v2') as Promise<Extractor>;
  }
  return extractorPromise;
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const extractor = await getExtractor();
  const output = await extractor(texts, { pooling: 'mean', normalize: true });
  return output.tolist();
}