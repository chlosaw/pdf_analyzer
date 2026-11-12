import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/db';
import { makePdf, resetDb, SAMPLE_PAGES, signedInAgent, uploadPdf } from './helpers';

type Agent = Awaited<ReturnType<typeof signedInAgent>>;

/** Inserts documents directly (no upload/indexing needed to test listing). */
async function seedDocuments(agent: Agent, docs: { name: string; status?: 'READY' | 'FAILED'; size?: number }[]) {
  const { body: me } = await agent.get('/api/auth/me').expect(200);
  const base = Date.now();
  await prisma.document.createMany({
    data: docs.map((d, i) => ({
      userId: me.id,
      name: d.name,
      storageKey: `none/${i}`,
      sizeBytes: d.size ?? 1000,
      pageCount: 1,
      status: d.status ?? 'READY',
      createdAt: new Date(base + i * 1000) // later in the list = newer
    }))
  });
  return me.id as string;
}

const names = (body: { items: { name: string }[] }) => body.items.map((d) => d.name);

describe('list endpoints', () => {
  beforeEach(resetDb);

  describe('GET /api/documents', () => {
    it('paginates, newest first', async () => {
      const agent = await signedInAgent();
      await seedDocuments(
        agent,
        Array.from({ length: 5 }, (_, i) => ({ name: `doc${i}.pdf` }))
      );

      const first = await agent.get('/api/documents?pageSize=2').expect(200);
      expect(first.body).toMatchObject({ total: 5, page: 1, pageSize: 2, totalPages: 3 });
      expect(names(first.body)).toEqual(['doc4.pdf', 'doc3.pdf']);

      const last = await agent.get('/api/documents?pageSize=2&page=3').expect(200);
      expect(names(last.body)).toEqual(['doc0.pdf']);
    });

    it('searches by name (case-insensitive), filters by status and sorts', async () => {
      const agent = await signedInAgent();
      await seedDocuments(agent, [
        { name: 'Annual Report 2024.pdf', size: 300 },
        { name: 'annual budget.pdf', status: 'FAILED', size: 100 },
        { name: 'Handbook.pdf', size: 200 }
      ]);

      expect(names((await agent.get('/api/documents?q=ANNUAL').expect(200)).body)).toEqual([
        'annual budget.pdf',
        'Annual Report 2024.pdf'
      ]);
      expect(names((await agent.get('/api/documents?q=annual&status=READY').expect(200)).body)).toEqual([
        'Annual Report 2024.pdf'
      ]);
      expect(names((await agent.get('/api/documents?sort=name').expect(200)).body)).toEqual([
        'annual budget.pdf',
        'Annual Report 2024.pdf',
        'Handbook.pdf'
      ]);
      expect(names((await agent.get('/api/documents?sort=size').expect(200)).body)[0]).toBe('Annual Report 2024.pdf');
    });

    it('treats % and _ in a search as literal text', async () => {
      const agent = await signedInAgent();
      await seedDocuments(agent, [{ name: 'growth 100%.pdf' }, { name: 'plain.pdf' }, { name: 'a_b.pdf' }]);
      expect(names((await agent.get('/api/documents?q=%25').expect(200)).body)).toEqual(['growth 100%.pdf']);
      expect(names((await agent.get('/api/documents?q=_').expect(200)).body)).toEqual(['a_b.pdf']);
    });

    it("only ever lists the user's own documents", async () => {
      const alice = await signedInAgent();
      const bob = await signedInAgent();
      await seedDocuments(alice, [{ name: 'secret.pdf' }]);
      expect((await bob.get('/api/documents?q=secret').expect(200)).body.total).toBe(0);
    });

    it('rejects invalid query parameters', async () => {
      const agent = await signedInAgent();
      for (const qs of ['page=0', 'pageSize=500', 'status=DONE', 'sort=random', 'page=abc']) {
        const res = await agent.get(`/api/documents?${qs}`).expect(400);
        expect(res.body.code).toBe('VALIDATION');
      }
    });
  });

  describe('renaming', () => {
    it('renames a document and its chat', async () => {
      const agent = await signedInAgent();
      const { body: doc } = await uploadPdf(agent, await makePdf(SAMPLE_PAGES));
      const { body: chat } = await agent.post(`/api/documents/${doc.id}/chat`);

      const res = await agent.patch(`/api/documents/${doc.id}`).send({ name: '  Rail report 2024.pdf ' }).expect(200);
      expect(res.body.name).toBe('Rail report 2024.pdf');
      expect((await agent.get(`/api/chats/${chat.id}`).expect(200)).body.title).toBe('Rail report 2024.pdf');
    });

    it('renames a chat', async () => {
      const agent = await signedInAgent();
      const { body: a } = await uploadPdf(agent, await makePdf(SAMPLE_PAGES), 'a.pdf');
      const { body: b } = await uploadPdf(agent, await makePdf(SAMPLE_PAGES), 'b.pdf');
      const { body: chat } = await agent
        .post('/api/chats')
        .send({ documentIds: [a.id, b.id] })
        .expect(201);
      const res = await agent.patch(`/api/chats/${chat.id}`).send({ name: 'Comparison' }).expect(200);
      expect(res.body.title).toBe('Comparison');
    });

    it("validates names and can't rename someone else's things", async () => {
      const alice = await signedInAgent();
      const bob = await signedInAgent();
      const { body: doc } = await uploadPdf(alice, await makePdf(SAMPLE_PAGES));
      await alice.patch(`/api/documents/${doc.id}`).send({ name: '   ' }).expect(400);
      await bob.patch(`/api/documents/${doc.id}`).send({ name: 'mine now' }).expect(404);
    });
  });

  describe('GET /api/chats', () => {
    it('filters by kind and searches titles and document names', async () => {
      const agent = await signedInAgent();
      const { body: rail } = await uploadPdf(agent, await makePdf(SAMPLE_PAGES), 'rail.pdf');
      const { body: soup } = await uploadPdf(agent, await makePdf(SAMPLE_PAGES), 'soup.pdf');
      await agent.post(`/api/documents/${rail.id}/chat`).expect(201);
      await agent
        .post('/api/chats')
        .send({ documentIds: [rail.id, soup.id], title: 'Compare' })
        .expect(201);

      expect((await agent.get('/api/chats').expect(200)).body.total).toBe(2);
      const multi = (await agent.get('/api/chats?kind=multi').expect(200)).body;
      expect(multi.items.map((c: { title: string }) => c.title)).toEqual(['Compare']);
      // "soup" is only a document name, not a title
      expect((await agent.get('/api/chats?q=soup').expect(200)).body.items).toHaveLength(1);
    });
  });
});
