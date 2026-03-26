import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-sonnet-4-20250514';
const MAX_TOKENS = 4096;
const TIMEOUT_MS = 30000;

export async function callClaude(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number = MAX_TOKENS
): Promise<string> {
  const client = new Anthropic({ apiKey });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await client.messages.create(
      {
        model: MODEL,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      },
      { signal: controller.signal }
    );

    const textBlock = response.content.find((b) => b.type === 'text');
    return textBlock?.text ?? '';
  } finally {
    clearTimeout(timeout);
  }
}

export async function callClaudeJSON<T>(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string
): Promise<T> {
  const text = await callClaude(apiKey, systemPrompt, userPrompt);

  // Extract JSON from potential markdown code blocks
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, text];
  const jsonStr = jsonMatch[1]?.trim() ?? text.trim();

  return JSON.parse(jsonStr) as T;
}
