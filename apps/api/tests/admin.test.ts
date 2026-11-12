import { existsSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/db';
import { env } from '../src/lib/env';
import { makePdf, resetDb, SAMPLE_PAGES, signedInAgent, uploadPdf } from './helpers';

type Agent = Awaited<ReturnType<typeof signedInAgent>>;

const me = async (agent: Agent) => (await agent.get('/api/auth/me').expect(200)).body;

async function adminAgent() {
  const agent = await signedInAgent();
  await prisma.user.update({ where: { id: (await me(agent)).id }, data: { role: 'ADMIN' } });
  return agent;
}

describe('admin (role-based access)', () => {
  beforeEach(resetDb);

  it('new accounts are plain users', async () => {
    expect((await me(await signedInAgent())).role).toBe('USER');
  });

  it('refuses every admin endpoint to non-admins with 403', async () => {
    const user = await signedInAgent();
    const { id } = await me(user);
    for (const res of [
      await user.get('/api/admin/stats'),
      await user.get('/api/admin/users'),
      await user.patch(`/api/admin/users/${id}`).send({ role: 'ADMIN' }), // no self-promotion
      await user.delete(`/api/admin/users/${id}`)
    ]) {
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
    }
    expect((await me(user)).role).toBe('USER');
  });

  it('requires sign-in first (401, not 403)', async () => {
    const { default: request } = await import('supertest');
    const { createApp } = await import('../src/app');
    await request(createApp()).get('/api/admin/stats').expect(401);
  });

  it('shows usage totals', async () => {
    const admin = await adminAgent();
    const user = await signedInAgent();
    await uploadPdf(user, await makePdf(SAMPLE_PAGES));
    const { body } = await admin.get('/api/admin/stats').expect(200);
    expect(body).toMatchObject({ users: 2, demoUsers: 0, documents: 1, chats: 0, questionsLast7Days: 0 });
    expect(body.storageBytes).toBeGreaterThan(0);
  });

  it('lists, searches and filters users, hiding demo sandboxes unless asked', async () => {
    const admin = await adminAgent();
    await signedInAgent();
    await prisma.user.create({
      data: { email: 'visitor@demo.example', name: 'Demo Visitor', passwordHash: 'x', isDemo: true }
    });

    const all = (await admin.get('/api/admin/users').expect(200)).body;
    expect(all.total).toBe(2);
    expect(all.items[0]).toMatchObject({ documentCount: 0, chatCount: 0 });
    expect(all.items[0]).not.toHaveProperty('passwordHash');

    expect((await admin.get('/api/admin/users?includeDemo=true').expect(200)).body.total).toBe(3);
    expect((await admin.get('/api/admin/users?role=ADMIN').expect(200)).body.total).toBe(1);
    const search = (await admin.get('/api/admin/users?q=VISITOR&includeDemo=true').expect(200)).body;
    expect(search.items.map((u: { email: string }) => u.email)).toEqual(['visitor@demo.example']);
  });

  it('changes roles, and the change applies to the next request', async () => {
    const admin = await adminAgent();
    const user = await signedInAgent();
    const { id } = await me(user);

    const res = await admin.patch(`/api/admin/users/${id}`).send({ role: 'ADMIN' }).expect(200);
    expect(res.body.role).toBe('ADMIN');
    await user.get('/api/admin/stats').expect(200);

    await admin.patch(`/api/admin/users/${id}`).send({ role: 'USER' }).expect(200);
    await user.get('/api/admin/stats').expect(403); // no stale role in the token
  });

  it("won't let admins change or delete themselves, or promote demo sandboxes", async () => {
    const admin = await adminAgent();
    const { id } = await me(admin);
    expect((await admin.patch(`/api/admin/users/${id}`).send({ role: 'USER' }).expect(403)).body.code).toBe('SELF');
    expect((await admin.delete(`/api/admin/users/${id}`).expect(403)).body.code).toBe('SELF');

    const demo = await prisma.user.create({
      data: { email: 'v@demo.example', name: 'Demo', passwordHash: 'x', isDemo: true }
    });
    await admin.patch(`/api/admin/users/${demo.id}`).send({ role: 'ADMIN' }).expect(409);
    await admin.patch(`/api/admin/users/${demo.id}`).send({ role: 'OWNER' }).expect(400);
    await admin.delete('/api/admin/users/00000000-0000-4000-8000-000000000000').expect(404);
  });

  it('deletes a user with their documents, stored files and sessions', async () => {
    const admin = await adminAgent();
    const user = await signedInAgent();
    const { id } = await me(user);
    const { body: doc } = await uploadPdf(user, await makePdf(SAMPLE_PAGES));
    const stored = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } });
    const file = path.join(env.LOCAL_STORAGE_DIR, stored.storageKey);
    expect(existsSync(file)).toBe(true);

    await admin.delete(`/api/admin/users/${id}`).expect(204);
    expect(await prisma.user.findUnique({ where: { id } })).toBeNull();
    expect(await prisma.document.count({ where: { userId: id } })).toBe(0);
    expect(existsSync(file)).toBe(false);
    await user.get('/api/auth/me').expect(401); // their session went with them
  });
});
