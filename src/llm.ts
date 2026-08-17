import { config } from './config.js';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

const LANGUAGE_TOKEN_MULTIPLIERS: Record<string, number> = {
  en: 1,
  de: 1.3,
  fr: 1.2,
  it: 1.2,
};

export function maxTokensForLanguage(language: string): number {
  const multiplier = LANGUAGE_TOKEN_MULTIPLIERS[language] ?? 1;
  return Math.round(config.maxTokens * multiplier);
}

export async function chatDeepSeek(
  messages: ChatMessage[],
  maxTokens: number = maxTokensForLanguage('en'),
): Promise<string> {
  if (!config.deepSeek.apiKey) {
    throw new Error('DEEPSEEK_API_KEY is not set. Add it to your .env file.');
  }

  const response = await fetch(`${config.deepSeek.baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.deepSeek.apiKey}`,
    },
    body: JSON.stringify({
      model: config.deepSeek.model,
      messages,
      temperature: 0.3,
      max_tokens: maxTokens,
      thinking: { type: 'disabled' },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`DeepSeek API error ${response.status}: ${body}`);
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('DeepSeek API returned an empty response.');
  }
  return content.trim();
}