import type { Response } from 'express';
import type { StreamEvent } from '@pdf-analyzer/shared';

/**
 * Minimal Server-Sent Events writer. Each event is one `data: <json>` frame.
 * We use POST + fetch streaming on the client (EventSource only supports GET).
 */
export function openSse(res: Response) {
  res.status(200).set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no' // stop reverse proxies from buffering the stream
  });
  res.flushHeaders();

  let closed = false;
  res.on('close', () => {
    closed = true;
    clearInterval(heartbeat);
  });
  // Comment frames keep idle connections from being dropped by proxies.
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 15_000);

  return {
    get closed() {
      return closed;
    },
    send(event: StreamEvent) {
      if (!closed) res.write(`data: ${JSON.stringify(event)}\n\n`);
    },
    end() {
      clearInterval(heartbeat);
      if (!closed) res.end();
    }
  };
}
