import { GoogleGenAI } from '@google/genai';
import { env } from '../../../lib/env';
import type { AiProvider } from './index';
import { EMBEDDING_DIMENSIONS, l2normalize } from '../vector';

let client: GoogleGenAI | undefined;
function gemini() {
  if (!env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not set');
  return (client ??= new GoogleGenAI({ apiKey: env.GEMINI_API_KEY }));
}

// The embedding API accepts up to 100 inputs per request.
const EMBED_BATCH = 100;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Retries rate-limit (429) and overload (5xx) errors with exponential backoff — common on the free tier. */
async function withRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (err) {
      const status = (err as { status?: number }).status;
      const retryable = status === 429 || (status !== undefined && status >= 500);
      if (!retryable || i >= attempts - 1) throw err;
      await sleep(1000 * 2 ** i);
    }
  }
}

export const geminiAi: AiProvider = {
  async embed(texts, task) {
    const vectors: number[][] = [];
    for (let i = 0; i < texts.length; i += EMBED_BATCH) {
      const batch = texts.slice(i, i + EMBED_BATCH);
      const res = await withRetry(() =>
        gemini().models.embedContent({
          model: env.GEMINI_EMBEDDING_MODEL,
          contents: batch,
          config: { taskType: task, outputDimensionality: EMBEDDING_DIMENSIONS }
        })
      );
      const values = res.embeddings?.map((e) => e.values ?? []) ?? [];
      if (values.length !== batch.length || values.some((v) => v.length !== EMBEDDING_DIMENSIONS)) {
        throw new Error('Embedding API returned an unexpected result');
      }
      // Truncated (768-d) Gemini embeddings aren't unit length; normalise so cosine scores are comparable.
      vectors.push(...values.map(l2normalize));
    }
    return vectors;
  },

  async *streamAnswer({ system, history, prompt, signal }) {
    const stream = await withRetry(() =>
      gemini().models.generateContentStream({
        model: env.GEMINI_CHAT_MODEL,
        contents: [
          ...history.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
          { role: 'user', parts: [{ text: prompt }] }
        ],
        config: { systemInstruction: system, temperature: 0.2, abortSignal: signal }
      })
    );
    for await (const chunk of stream) {
      if (chunk.text) yield chunk.text;
    }
  }
};
