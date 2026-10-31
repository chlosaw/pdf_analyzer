import { describe, expect, it } from 'vitest';
import { readSse } from './stream';

function streamOf(...parts: string[]) {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const p of parts) controller.enqueue(encoder.encode(p));
      controller.close();
    }
  });
}

async function collect(stream: ReadableStream<Uint8Array>) {
  const out = [];
  for await (const e of readSse(stream)) out.push(e);
  return out;
}

describe('readSse', () => {
  it('reassembles frames split across chunks and skips heartbeats', async () => {
    const events = await collect(
      streamOf('data: {"type":"tok', 'en","text":"Hel"}\n', '\n: ping\n\n', 'data: {"type":"token","text":"lo"}\n\n')
    );
    expect(events).toEqual([
      { type: 'token', text: 'Hel' },
      { type: 'token', text: 'lo' }
    ]);
  });

  it('handles CRLF line endings', async () => {
    const events = await collect(streamOf('data: {"type":"error","message":"x"}\r\n\r\n'));
    expect(events).toEqual([{ type: 'error', message: 'x' }]);
  });
});
