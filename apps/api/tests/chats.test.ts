import { beforeEach, describe, expect, it } from 'vitest';
import { ask, makePdf, parseSse, resetDb, SAMPLE_PAGES, signedInAgent, uploadPdf, waitUntilReady } from './helpers';

async function readyDoc(agent: Awaited<ReturnType<typeof signedInAgent>>, pages: string[], name: string) {
  const { body } = await uploadPdf(agent, await makePdf(pages), name);
  return waitUntilReady(agent, body.id);
}

describe('chats', () => {
  beforeEach(resetDb);

  it('keeps one chat per document', async () => {
    const agent = await signedInAgent();
    const doc = await readyDoc(agent, SAMPLE_PAGES, 'report.pdf');

    const first = await agent.post(`/api/documents/${doc.id}/chat`).expect(201);
    const second = await agent.post(`/api/documents/${doc.id}/chat`).expect(200);
    expect(second.body.id).toBe(first.body.id);
    expect(first.body).toMatchObject({ kind: 'document', title: 'report.pdf' });
  });

  it('streams an answer with page citations and saves the history', async () => {
    const agent = await signedInAgent();
    const doc = await readyDoc(agent, SAMPLE_PAGES, 'report.pdf');
    const { body: chat } = await agent.post(`/api/documents/${doc.id}/chat`).expect(201);

    const res = await ask(agent, chat.id, 'What is the capital of Freedonia?');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/event-stream/);

    const events = parseSse(res.body as string);
    const types = events.map((e) => e.type);
    expect(types[0]).toBe('sources');
    expect(types.filter((t) => t === 'token').length).toBeGreaterThan(1); // actually streamed in pieces
    expect(types.at(-1)).toBe('done');

    const sources = events[0].type === 'sources' ? events[0].sources : [];
    expect(sources[0]).toMatchObject({ index: 1, documentId: doc.id, page: 2 }); // the page that mentions Fredville

    const done = events.at(-1)!;
    if (done.type !== 'done') throw new Error('expected done');
    const streamed = events.map((e) => (e.type === 'token' ? e.text : '')).join('');
    expect(done.message.content).toBe(streamed);
    expect(done.message.content).toContain('Fredville');
    // Only sources the answer actually cites are kept, best match first.
    expect(done.message.citations[0]).toMatchObject({ index: 1, page: 2 });
    for (const c of done.message.citations) expect(done.message.content).toContain(`[${c.index}]`);

    const saved = await agent.get(`/api/chats/${chat.id}`).expect(200);
    expect(saved.body.messages.map((m: { role: string }) => m.role)).toEqual(['user', 'assistant']);
    expect(saved.body.messages[1].citations[0].page).toBe(2);

    await agent.delete(`/api/chats/${chat.id}/messages`).expect(204);
    expect((await agent.get(`/api/chats/${chat.id}`)).body.messages).toEqual([]);
  });

  it('answers across several documents', async () => {
    const agent = await signedInAgent();
    const rail = await readyDoc(agent, SAMPLE_PAGES, 'rail.pdf');
    const cooking = await readyDoc(
      agent,
      ['A cookbook about soup.\nTomato soup needs basil, garlic and ripe tomatoes simmered slowly.'],
      'soup.pdf'
    );

    const { body: chat } = await agent
      .post('/api/chats')
      .send({ documentIds: [rail.id, cooking.id] })
      .expect(201);
    expect(chat).toMatchObject({ kind: 'multi', title: 'rail + soup' });

    const events = parseSse((await ask(agent, chat.id, 'Which herbs go in tomato soup?')).body as string);
    const sources = events[0].type === 'sources' ? events[0].sources : [];
    expect(new Set(sources.map((s) => s.documentId))).toEqual(new Set([rail.id, cooking.id]));
    expect(sources[0].documentName).toBe('soup.pdf');

    const list = await agent.get('/api/chats').expect(200);
    expect(list.body).toHaveLength(1);
  });

  it('validates questions and document ownership', async () => {
    const alice = await signedInAgent();
    const bob = await signedInAgent();
    const doc = await readyDoc(alice, SAMPLE_PAGES, 'report.pdf');
    const { body: chat } = await alice.post(`/api/documents/${doc.id}/chat`).expect(201);

    expect((await alice.post(`/api/chats/${chat.id}/messages`).send({ question: '  ' })).status).toBe(400);
    expect((await alice.post(`/api/chats/${chat.id}/messages`).send({ question: 'x'.repeat(2001) })).status).toBe(400);
    expect((await bob.post(`/api/chats/${chat.id}/messages`).send({ question: 'hi' })).status).toBe(404);
    await bob.get(`/api/chats/${chat.id}`).expect(404);
    await bob
      .post('/api/chats')
      .send({ documentIds: [doc.id] })
      .expect(404);
  });

  it('rate-limits questions per user', async () => {
    const agent = await signedInAgent({ rateLimits: { ask: 1 } });
    const doc = await readyDoc(agent, SAMPLE_PAGES, 'report.pdf');
    const { body: chat } = await agent.post(`/api/documents/${doc.id}/chat`).expect(201);

    expect((await ask(agent, chat.id, 'capital?')).status).toBe(200);
    expect((await ask(agent, chat.id, 'capital again?')).status).toBe(429);
  });
});
