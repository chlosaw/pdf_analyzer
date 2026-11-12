import { DEMO_SANDBOX_HOURS } from '@pdf-analyzer/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/db';
import { deleteExpiredSandboxes } from '../src/modules/demo/demo.service';
import { ask, parseSse, resetDb, signedInAgent } from './helpers';

const HOUR = 60 * 60 * 1000;

describe('demo sandbox', () => {
  beforeEach(resetDb);

  it('signs a visitor into a private sandbox with indexed sample PDFs', async () => {
    const agent = request.agent(createApp());
    const res = await agent.post('/api/auth/demo').expect(201);
    expect(res.body).toMatchObject({ name: 'Demo Visitor', isDemo: true });
    expect(res.headers['set-cookie'][0]).toMatch(/^token=/);

    const docs = (await agent.get('/api/documents').expect(200)).body.items;
    expect(docs).toHaveLength(2);
    expect(docs.every((d: { status: string }) => d.status === 'READY')).toBe(true);

    // Ready to answer straight away
    const report = docs.find((d: { name: string }) => d.name.includes('Annual Report'));
    const { body: chat } = await agent.post(`/api/documents/${report.id}/chat`).expect(201);
    const events = parseSse((await ask(agent, chat.id, 'Who is the chief executive?')).body as string);
    const done = events.at(-1)!;
    expect(done.type === 'done' && done.message.content).toContain('Maria Lindqvist');
  });

  it("gives every visitor their own sandbox and doesn't mark real users as demo", async () => {
    const app = createApp();
    const a = await request(app).post('/api/auth/demo').expect(201);
    const b = await request(app).post('/api/auth/demo').expect(201);
    expect(a.body.id).not.toBe(b.body.id);

    const user = await signedInAgent();
    expect((await user.get('/api/auth/me').expect(200)).body.isDemo).toBe(false);
  });

  it(`deletes sandboxes older than ${DEMO_SANDBOX_HOURS} hours, with their documents, and nothing else`, async () => {
    const app = createApp();
    const old = (await request(app).post('/api/auth/demo').expect(201)).body;
    const fresh = (await request(app).post('/api/auth/demo').expect(201)).body;
    const realUser = await signedInAgent();
    await prisma.user.update({
      where: { id: old.id },
      data: { createdAt: new Date(Date.now() - (DEMO_SANDBOX_HOURS + 1) * HOUR) }
    });
    // Real accounts are never touched, however old.
    await prisma.user.updateMany({ where: { isDemo: false }, data: { createdAt: new Date(2000, 0, 1) } });

    expect(await deleteExpiredSandboxes()).toBe(1);
    expect(await prisma.user.findUnique({ where: { id: old.id } })).toBeNull();
    expect(await prisma.document.count({ where: { userId: old.id } })).toBe(0);
    expect(await prisma.user.findUnique({ where: { id: fresh.id } })).not.toBeNull();
    await realUser.get('/api/auth/me').expect(200);
  });

  it('rate-limits sandbox creation per IP', async () => {
    const app = createApp({ rateLimits: { demo: 1 } });
    await request(app).post('/api/auth/demo').expect(201);
    const res = await request(app).post('/api/auth/demo').expect(429);
    expect(res.body.code).toBe('RATE_LIMITED');
  });
});
