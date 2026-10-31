import { MAX_FILE_SIZE_BYTES } from '@pdf-analyzer/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/db';
import { makePdf, resetDb, SAMPLE_PAGES, signedInAgent, uploadPdf, waitUntilReady } from './helpers';

describe('documents', () => {
  beforeEach(resetDb);

  it('requires a signed-in user', async () => {
    await request(createApp()).get('/api/documents').expect(401);
  });

  it('uploads a PDF, chunks and embeds it per page', async () => {
    const agent = await signedInAgent();
    const res = await uploadPdf(agent, await makePdf(SAMPLE_PAGES), 'Freedonia report.pdf');

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Freedonia report.pdf', pageCount: 3, status: 'PROCESSING' });

    const doc = await waitUntilReady(agent, res.body.id);
    expect(doc.status).toBe('READY');

    const chunks = await prisma.$queryRaw<{ page: number; dims: number }[]>`
      SELECT page, vector_dims(embedding) AS dims FROM "Chunk" WHERE "documentId" = ${doc.id} ORDER BY page`;
    expect(chunks.map((c) => c.page)).toEqual([1, 2, 3]);
    expect(chunks.every((c) => c.dims === 768)).toBe(true);

    const list = await agent.get('/api/documents').expect(200);
    expect(list.body).toHaveLength(1);
  });

  it('serves the original file back', async () => {
    const agent = await signedInAgent();
    const pdf = await makePdf(SAMPLE_PAGES);
    const { body } = await uploadPdf(agent, pdf);
    const file = await agent
      .get(`/api/documents/${body.id}/file`)
      .expect(200)
      .expect('Content-Type', 'application/pdf');
    expect(Buffer.compare(file.body as Buffer, pdf)).toBe(0);
  });

  it('rejects scanned PDFs with no extractable text', async () => {
    const agent = await signedInAgent();
    const res = await uploadPdf(agent, await makePdf(['', '', '']), 'scan.pdf');
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('NO_TEXT');
    expect(res.body.error).toMatch(/no text found/i);
    expect(await prisma.document.count()).toBe(0);
  });

  it('rejects files that are not PDFs, even with a PDF content type', async () => {
    const agent = await signedInAgent();
    const res = await uploadPdf(agent, Buffer.from('just some text, definitely not a pdf'), 'fake.pdf');
    expect(res.status).toBe(415);

    const png = await agent
      .post('/api/documents')
      .attach('file', Buffer.from('x'), { filename: 'a.png', contentType: 'image/png' });
    expect(png.status).toBe(415);
  });

  it(`rejects files over the size cap`, async () => {
    const agent = await signedInAgent();
    const big = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(MAX_FILE_SIZE_BYTES + 1)]);
    const res = await uploadPdf(agent, big, 'huge.pdf');
    expect(res.status).toBe(413);
    expect(res.body.code).toBe('FILE_TOO_LARGE');
  });

  it('requires a file', async () => {
    const agent = await signedInAgent();
    const res = await agent.post('/api/documents').field('nothing', 'here');
    expect(res.status).toBe(400);
  });

  it("hides other users' documents", async () => {
    const alice = await signedInAgent();
    const bob = await signedInAgent();
    const { body } = await uploadPdf(alice, await makePdf(SAMPLE_PAGES));

    await bob.get(`/api/documents/${body.id}`).expect(404);
    await bob.get(`/api/documents/${body.id}/file`).expect(404);
    await bob.delete(`/api/documents/${body.id}`).expect(404);
    expect((await bob.get('/api/documents').expect(200)).body).toEqual([]);
  });

  it('deletes a document with its chunks and its chat', async () => {
    const agent = await signedInAgent();
    const { body } = await uploadPdf(agent, await makePdf(SAMPLE_PAGES));
    await waitUntilReady(agent, body.id);
    await agent.post(`/api/documents/${body.id}/chat`).expect(201);

    await agent.delete(`/api/documents/${body.id}`).expect(204);
    expect(await prisma.chunk.count()).toBe(0);
    expect(await prisma.chat.count()).toBe(0);
    await agent.get(`/api/documents/${body.id}/file`).expect(404);
  });

  it('rate-limits uploads per user', async () => {
    const agent = await signedInAgent({ rateLimits: { upload: 1 } });
    const pdf = await makePdf(SAMPLE_PAGES);
    expect((await uploadPdf(agent, pdf)).status).toBe(201);
    expect((await uploadPdf(agent, pdf)).status).toBe(429);
  });
});
