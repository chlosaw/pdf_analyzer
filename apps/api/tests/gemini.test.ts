import { beforeEach, describe, expect, it, vi } from 'vitest';

// The provider reads the key when called; set it before the env module is imported.
vi.hoisted(() => {
  process.env.GEMINI_API_KEY = 'test-key';
});

// Each test decides how the fake Gemini behaves.
const sdk = vi.hoisted(() => ({
  generateContentStream: vi.fn(),
  embedContent: vi.fn()
}));
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = sdk;
  }
}));

import { AiTimeoutError, geminiAi, timeouts } from '../src/modules/embeddings/providers/gemini';

const never = () => new Promise<never>(() => {});
const overloaded = () => Object.assign(new Error('high demand'), { status: 503 });

async function* chunks(...texts: string[]) {
  for (const text of texts) yield { text };
}

/** A stream that sends some text, then goes silent forever. */
async function* stallsAfter(text: string) {
  yield { text };
  await never();
}

async function collect(stream: AsyncIterable<string>) {
  let out = '';
  for await (const t of stream) out += t;
  return out;
}

const ask = (signal = new AbortController().signal) =>
  collect(geminiAi.streamAnswer({ system: 's', history: [], prompt: 'p', signal }));

describe('Gemini provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(timeouts, { requestMs: 50, stallMs: 50, backoffMs: 1 });
  });

  it('streams the answer', async () => {
    sdk.generateContentStream.mockResolvedValue(chunks('Hello ', 'there'));
    expect(await ask()).toBe('Hello there');
  });

  it('retries when the model is overloaded (503) and then succeeds', async () => {
    sdk.generateContentStream.mockRejectedValueOnce(overloaded()).mockResolvedValueOnce(chunks('ok'));
    expect(await ask()).toBe('ok');
    expect(sdk.generateContentStream).toHaveBeenCalledTimes(2);
    // The retry went to the lighter fallback model
    const models = sdk.generateContentStream.mock.calls.map(([req]) => req.model);
    expect(models).toEqual(['gemini-3.8-flash', 'gemini-3.5-flash-lite']);
  });

  it('gives up after 3 overloaded attempts with the 503', async () => {
    sdk.generateContentStream.mockRejectedValue(overloaded());
    await expect(ask()).rejects.toMatchObject({ status: 503 });
    expect(sdk.generateContentStream).toHaveBeenCalledTimes(3);
  });

  it('times out a request that never responds instead of hanging', async () => {
    sdk.generateContentStream.mockImplementation(never);
    await expect(ask()).rejects.toBeInstanceOf(AiTimeoutError);
    expect(sdk.generateContentStream).toHaveBeenCalledTimes(3); // each attempt timed out, then retried
  });

  it('times out a stream that stalls part-way, without retrying', async () => {
    sdk.generateContentStream.mockResolvedValue(stallsAfter('partial '));
    const received: string[] = [];
    const run = async () => {
      for await (const t of geminiAi.streamAnswer({ system: 's', history: [], prompt: 'p' })) received.push(t);
    };
    await expect(run()).rejects.toBeInstanceOf(AiTimeoutError);
    expect(received).toEqual(['partial ']);
    expect(sdk.generateContentStream).toHaveBeenCalledTimes(1);
  });

  it('stops immediately when the user aborts, and does not retry', async () => {
    sdk.generateContentStream.mockImplementation(never);
    Object.assign(timeouts, { requestMs: 10_000 });
    const user = new AbortController();
    setTimeout(() => user.abort(), 20);
    await expect(ask(user.signal)).rejects.not.toBeInstanceOf(AiTimeoutError);
    expect(sdk.generateContentStream).toHaveBeenCalledTimes(1);
  });

  it('times out embedding requests too', async () => {
    sdk.embedContent.mockImplementation(never);
    await expect(geminiAi.embed(['text'], 'RETRIEVAL_QUERY')).rejects.toBeInstanceOf(AiTimeoutError);
  });
});
