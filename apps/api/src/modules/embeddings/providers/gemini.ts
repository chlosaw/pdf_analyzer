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

/** Limits for one attempt. Mutable only so tests can shrink them. */
export const timeouts = {
  /** Until the API responds (embeddings) or the stream opens (answers) */
  requestMs: 30_000,
  /** Longest silence allowed between streamed chunks, including before the first one */
  stallMs: 30_000,
  /** First retry delay; doubles each time */
  backoffMs: 1000
};

/** Gemini didn't respond in time. Status 504 so it is retried like other 5xx errors and reported as a timeout. */
export class AiTimeoutError extends Error {
  readonly status = 504;
  constructor() {
    super('The AI service did not respond in time');
    this.name = 'AiTimeoutError';
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * An abort signal for one attempt: fires when the user stops (parent) or when the deadline passes.
 * Without it, a request Gemini never answers would hang forever.
 */
function deadline(parent: AbortSignal | undefined, ms: number) {
  const controller = new AbortController();
  const onParentAbort = () => controller.abort(parent?.reason);
  parent?.addEventListener('abort', onParentAbort, { once: true });
  let timer: ReturnType<typeof setTimeout>;
  const arm = (delay: number) => {
    clearTimeout(timer);
    timer = setTimeout(() => controller.abort(new AiTimeoutError()), delay);
  };
  arm(ms);
  return {
    signal: controller.signal,
    /** Restart the countdown, e.g. after each streamed chunk */
    arm,
    done() {
      clearTimeout(timer);
      parent?.removeEventListener('abort', onParentAbort);
    },
    /** The SDK reports aborts as a generic AbortError; surface our timeout instead when that was the cause. */
    explain(err: unknown) {
      return controller.signal.reason instanceof AiTimeoutError ? controller.signal.reason : err;
    }
  };
}

/** Rejects as soon as the signal aborts, even if the wrapped promise never settles. */
function raceAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}

/** Retries rate-limit (429), overload (5xx) and timeout errors with exponential backoff, common on the free tier. */
async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  { attempts = 3, signal }: { attempts?: number; signal?: AbortSignal } = {}
) {
  for (let i = 0; ; i++) {
    try {
      return await fn(i);
    } catch (err) {
      const status = (err as { status?: number }).status;
      const retryable = status === 429 || (status !== undefined && status >= 500);
      if (!retryable || i >= attempts - 1 || signal?.aborted) throw err;
      await sleep(timeouts.backoffMs * 2 ** i);
    }
  }
}

export const geminiAi: AiProvider = {
  async embed(texts, task) {
    const vectors: number[][] = [];
    for (let i = 0; i < texts.length; i += EMBED_BATCH) {
      const batch = texts.slice(i, i + EMBED_BATCH);
      const res = await withRetry(async () => {
        const limit = deadline(undefined, timeouts.requestMs);
        try {
          return await raceAbort(
            gemini().models.embedContent({
              model: env.GEMINI_EMBEDDING_MODEL,
              contents: batch,
              config: { taskType: task, outputDimensionality: EMBEDDING_DIMENSIONS, abortSignal: limit.signal }
            }),
            limit.signal
          );
        } catch (err) {
          throw limit.explain(err);
        } finally {
          limit.done();
        }
      });
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
    const contents = [
      ...history.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
      { role: 'user', parts: [{ text: prompt }] }
    ];

    // Only opening the stream is retried; once text has reached the user, a failure is reported instead.
    // Retries alternate to the lighter fallback model, which is often still available when the main one is busy.
    const { stream, limit } = await withRetry(
      async (attempt) => {
        const limit = deadline(signal, timeouts.requestMs);
        try {
          const stream = await raceAbort(
            gemini().models.generateContentStream({
              model: attempt % 2 === 1 ? env.GEMINI_FALLBACK_CHAT_MODEL : env.GEMINI_CHAT_MODEL,
              contents,
              config: { systemInstruction: system, temperature: 0.2, abortSignal: limit.signal }
            }),
            limit.signal
          );
          return { stream, limit };
        } catch (err) {
          limit.done();
          throw limit.explain(err);
        }
      },
      { signal }
    );

    const chunks = stream[Symbol.asyncIterator]();
    try {
      limit.arm(timeouts.stallMs);
      while (true) {
        const { value: chunk, done } = await raceAbort(chunks.next(), limit.signal);
        if (done) break;
        limit.arm(timeouts.stallMs);
        if (chunk.text) yield chunk.text;
      }
    } catch (err) {
      void chunks.return?.(undefined); // stop reading the abandoned stream
      throw limit.explain(err);
    } finally {
      limit.done();
    }
  }
};
