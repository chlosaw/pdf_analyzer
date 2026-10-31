import type { StreamEvent } from '@pdf-analyzer/shared';
import { toApiError } from './client';

/** Parses a Server-Sent Events byte stream into our JSON events. Frames may arrive split across chunks. */
export async function* readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<StreamEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');

      let boundary;
      while ((boundary = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const data = frame
          .split('\n')
          .filter((line) => line.startsWith('data:')) // skips ": ping" heartbeats
          .map((line) => line.slice(5).trimStart())
          .join('\n');
        if (data) yield JSON.parse(data) as StreamEvent;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/** POSTs a question and yields the streamed answer events. EventSource can't POST, so we read the fetch body. */
export async function* askQuestion(chatId: string, question: string, signal?: AbortSignal) {
  const res = await fetch(`/api/chats/${chatId}/messages`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({ question }),
    signal
  });
  if (!res.ok || !res.body) throw await toApiError(res);
  yield* readSse(res.body);
}
