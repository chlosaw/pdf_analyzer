import { PDFDocument, StandardFonts } from 'pdf-lib';
import request from 'supertest';
import type { DocumentDTO, StreamEvent } from '@pdf-analyzer/shared';
import { createApp, type AppOptions } from '../src/app';
import { prisma } from '../src/lib/db';

/**
 * Empties every table. A previous test's background indexing may still be writing, and TRUNCATE can then
 * deadlock with it (Postgres aborts one side), so retry a few times.
 */
export async function resetDb() {
  for (let attempt = 1; ; attempt++) {
    try {
      await prisma.$executeRawUnsafe('TRUNCATE "User", "Session", "Document", "Chunk", "Chat", "Message" CASCADE');
      return;
    } catch (err) {
      if (attempt >= 5 || !/deadlock|40P01/i.test(String(err))) throw err;
      await new Promise((r) => setTimeout(r, 50 * attempt));
    }
  }
}

/** Builds a real PDF; each string becomes one page. An empty string gives a page with no text (like a scan). */
export async function makePdf(pages: string[]): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (const text of pages) {
    const page = pdf.addPage([595, 842]);
    text.split('\n').forEach((line, i) => page.drawText(line, { x: 50, y: 780 - i * 18, size: 12, font }));
  }
  return Buffer.from(await pdf.save());
}

export const SAMPLE_PAGES = [
  'Annual report of the Freedonia Railway Company.\nThis report covers trains, stations and staff for the year.',
  'The capital of Freedonia is Fredville.\nFredville station serves twelve thousand passengers every day.',
  'Ticket prices rose by four percent.\nMaintenance spending on bridges doubled compared to last year.'
];

let userCounter = 0;

export async function signedInAgent(options: AppOptions = {}) {
  const agent = request.agent(createApp(options));
  const email = `user${++userCounter}-${Date.now()}@example.com`;
  await agent.post('/api/auth/register').send({ name: 'Test User', email, password: 'password123' }).expect(201);
  return agent;
}

export async function uploadPdf(agent: ReturnType<typeof request.agent>, buffer: Buffer, name = 'report.pdf') {
  return agent.post('/api/documents').attach('file', buffer, { filename: name, contentType: 'application/pdf' });
}

/** Ingestion runs in the background after upload; poll like the client does. */
export async function waitUntilReady(agent: ReturnType<typeof request.agent>, id: string): Promise<DocumentDTO> {
  for (let i = 0; i < 50; i++) {
    const { body } = await agent.get(`/api/documents/${id}`).expect(200);
    if (body.status !== 'PROCESSING') return body;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('Document never finished processing');
}

export function parseSse(raw: string): StreamEvent[] {
  return raw
    .split('\n\n')
    .map((frame) =>
      frame
        .split('\n')
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trim())
        .join('')
    )
    .filter(Boolean)
    .map((data) => JSON.parse(data) as StreamEvent);
}

/** POSTs a question and collects the whole SSE response body. */
export async function ask(agent: ReturnType<typeof request.agent>, chatId: string, question: string) {
  return agent
    .post(`/api/chats/${chatId}/messages`)
    .send({ question })
    .buffer(true)
    .parse((res, cb) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => (data += chunk));
      res.on('end', () => cb(null, data));
    });
}
