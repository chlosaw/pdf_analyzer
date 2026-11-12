import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { resetDb } from './helpers';

const user = { name: 'Ada', email: 'ada@example.com', password: 'correct horse' };

describe('auth', () => {
  beforeEach(resetDb);

  it('registers, sets an httpOnly cookie and returns the user', async () => {
    const agent = request.agent(createApp());
    const res = await agent.post('/api/auth/register').send(user).expect(201);

    expect(res.body).toEqual({ id: expect.any(String), name: 'Ada', email: 'ada@example.com', isDemo: false });
    expect(res.body).not.toHaveProperty('passwordHash');
    const cookie = res.headers['set-cookie'][0];
    expect(cookie).toMatch(/^token=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);

    await agent.get('/api/auth/me').expect(200, res.body);
  });

  it('rejects invalid input with field errors', async () => {
    const res = await request(createApp())
      .post('/api/auth/register')
      .send({ name: '', email: 'nope', password: 'short' })
      .expect(400);
    expect(res.body.code).toBe('VALIDATION');
    expect(Object.keys(res.body.details)).toEqual(expect.arrayContaining(['name', 'email', 'password']));
  });

  it('rejects duplicate emails', async () => {
    const app = createApp();
    await request(app).post('/api/auth/register').send(user).expect(201);
    await request(app)
      .post('/api/auth/register')
      .send({ ...user, email: 'ADA@example.com' })
      .expect(409);
  });

  it('logs in with the right password only', async () => {
    const app = createApp();
    await request(app).post('/api/auth/register').send(user).expect(201);

    await request(app).post('/api/auth/login').send({ email: user.email, password: 'wrong password' }).expect(401);
    await request(app).post('/api/auth/login').send({ email: 'ghost@example.com', password: 'whatever1' }).expect(401);
    const ok = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: user.password })
      .expect(200);
    expect(ok.headers['set-cookie'][0]).toMatch(/^token=/);
  });

  it('logout clears the cookie', async () => {
    const agent = request.agent(createApp());
    await agent.post('/api/auth/register').send(user).expect(201);
    await agent.post('/api/auth/logout').expect(204);
    await agent.get('/api/auth/me').expect(401);
  });

  it('logout revokes the session on the server, so a copied token stops working', async () => {
    const app = createApp();
    const res = await request(app).post('/api/auth/register').send(user).expect(201);
    const cookie = res.headers['set-cookie'][0].split(';')[0];

    await request(app).get('/api/auth/me').set('Cookie', cookie).expect(200);
    await request(app).post('/api/auth/logout').set('Cookie', cookie).expect(204);
    await request(app).get('/api/auth/me').set('Cookie', cookie).expect(401);
  });

  it('signing out in one browser keeps the others signed in', async () => {
    const app = createApp();
    await request(app).post('/api/auth/register').send(user).expect(201);
    const laptop = request.agent(app);
    const phone = request.agent(app);
    await laptop.post('/api/auth/login').send(user).expect(200);
    await phone.post('/api/auth/login').send(user).expect(200);

    await laptop.post('/api/auth/logout').expect(204);
    await laptop.get('/api/auth/me').expect(401);
    await phone.get('/api/auth/me').expect(200);
  });

  it('rejects missing, forged and tampered tokens', async () => {
    const app = createApp();
    const res = await request(app).post('/api/auth/register').send(user).expect(201);
    const token = res.headers['set-cookie'][0].split(';')[0].slice('token='.length);
    const claims = jwt.decode(token) as jwt.JwtPayload;
    const secret = process.env.JWT_SECRET!;
    const { sid, sub } = claims;

    const forged = [
      'not-a-jwt',
      // alg "none": unsigned
      jwt.sign({ sid }, '', { algorithm: 'none', subject: sub, issuer: 'pdf-analyzer', audience: 'pdf-analyzer-web' }),
      // signed with the wrong secret
      jwt.sign({ sid }, 'x'.repeat(40), { subject: sub, issuer: 'pdf-analyzer', audience: 'pdf-analyzer-web' }),
      // right secret, but minted for another app
      jwt.sign({ sid }, secret, { subject: sub, issuer: 'pdf-analyzer', audience: 'someone-else' }),
      // right secret, but someone else's user id
      jwt.sign({ sid }, secret, { subject: 'another-user', issuer: 'pdf-analyzer', audience: 'pdf-analyzer-web' }),
      // right secret, made-up session
      jwt.sign({ sid: 'made-up' }, secret, { subject: sub, issuer: 'pdf-analyzer', audience: 'pdf-analyzer-web' })
    ];

    await request(app).get('/api/auth/me').expect(401);
    for (const t of forged) await request(app).get('/api/auth/me').set('Cookie', `token=${t}`).expect(401);
    await request(app).get('/api/auth/me').set('Cookie', `token=${token}`).expect(200);
  });

  it('rate-limits repeated sign-in attempts', async () => {
    const app = createApp({ rateLimits: { auth: 3 } });
    for (let i = 0; i < 3; i++) {
      await request(app).post('/api/auth/login').send({ email: 'x@example.com', password: 'wrongpass' }).expect(401);
    }
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'x@example.com', password: 'wrongpass' })
      .expect(429);
    expect(res.body.code).toBe('RATE_LIMITED');
  });
});
