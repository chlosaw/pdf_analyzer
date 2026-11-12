import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { resetDb, signedInAgent } from './helpers';

const user = { name: 'Ada', email: 'ada@example.com', password: 'correct horse' };

describe('security', () => {
  beforeEach(resetDb);

  describe('CSRF', () => {
    it('blocks state-changing requests from other sites', async () => {
      const agent = await signedInAgent();
      const res = await agent.post('/api/chats').set('Sec-Fetch-Site', 'cross-site').send({ documentIds: [] });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('CSRF');
      await agent.delete('/api/documents/x').set('Sec-Fetch-Site', 'same-site').expect(403);
    });

    it('falls back to the Origin header for browsers without Sec-Fetch-Site', async () => {
      const app = createApp();
      await request(app).post('/api/auth/login').set('Origin', 'https://evil.example').send(user).expect(403);
      await request(app).post('/api/auth/login').set('Origin', 'null').send(user).expect(403);
      // Our own origin is fine (here the wrong password is what fails)
      const own = await request(app)
        .post('/api/auth/login')
        .set('Host', 'app.example')
        .set('Origin', 'https://app.example')
        .send(user);
      expect(own.status).toBe(401);
      // ...also behind a proxy that rewrites Host
      const proxied = await request(app)
        .post('/api/auth/login')
        .set('X-Forwarded-Host', 'app.example')
        .set('Origin', 'https://app.example')
        .send(user);
      expect(proxied.status).toBe(401);
    });

    it('lets same-origin requests and reads through', async () => {
      const agent = await signedInAgent();
      await agent.get('/api/documents').set('Sec-Fetch-Site', 'cross-site').expect(200);
      await agent.post('/api/auth/logout').set('Sec-Fetch-Site', 'same-origin').expect(204);
    });
  });

  describe('CORS', () => {
    it('gives other origins no access by default', async () => {
      const res = await request(createApp()).get('/api/health').set('Origin', 'https://evil.example').expect(200);
      expect(res.headers).not.toHaveProperty('access-control-allow-origin');
      const preflight = await request(createApp())
        .options('/api/documents')
        .set('Origin', 'https://evil.example')
        .set('Access-Control-Request-Method', 'DELETE');
      expect(preflight.headers).not.toHaveProperty('access-control-allow-origin');
    });

    it('allows only the configured origins, with credentials', async () => {
      const app = createApp({ corsOrigins: ['https://app.example.com'] });
      const res = await request(app).get('/api/health').set('Origin', 'https://app.example.com').expect(200);
      expect(res.headers['access-control-allow-origin']).toBe('https://app.example.com');
      expect(res.headers['access-control-allow-credentials']).toBe('true');
      // ...and trusts them for writes despite Sec-Fetch-Site: same-site
      const login = await request(app)
        .post('/api/auth/login')
        .set('Origin', 'https://app.example.com')
        .set('Sec-Fetch-Site', 'same-site')
        .send(user);
      expect(login.status).toBe(401); // got past the origin check; the password is what's wrong
      const other = await request(app).get('/api/health').set('Origin', 'https://other.example.com');
      expect(other.headers).not.toHaveProperty('access-control-allow-origin');
    });
  });

  it('locks an account after repeated wrong passwords, from any IP', async () => {
    const app = createApp({ rateLimits: { accountLockout: 3, auth: 100 } });
    await request(app).post('/api/auth/register').send(user).expect(201);
    for (let i = 0; i < 3; i++) {
      await request(app)
        .post('/api/auth/login')
        .set('X-Forwarded-For', `10.0.0.${i}`)
        .send({ email: user.email, password: 'wrong guess' })
        .expect(401);
    }
    // Even the right password is refused for now, and case/whitespace tricks don't get around it
    const locked = await request(app)
      .post('/api/auth/login')
      .send({ email: ' ADA@example.com ', password: user.password })
      .expect(429);
    expect(locked.body.code).toBe('ACCOUNT_LOCKED');
    // Other accounts are unaffected
    await request(app).post('/api/auth/login').send({ email: 'other@example.com', password: 'whatever1' }).expect(401);
  });

  it('sends security headers and keeps API responses out of caches', async () => {
    const agent = await signedInAgent();
    const res = await agent.get('/api/documents').expect(200);
    expect(res.headers['content-security-policy']).toBe("default-src 'none';frame-ancestors 'none'");
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['strict-transport-security']).toMatch(/max-age=\d+/);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers).not.toHaveProperty('x-powered-by');
  });

  it('does not leak internals in error responses', async () => {
    const res = await request(createApp())
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": ')
      .expect(400);
    expect(res.body).toEqual({ error: 'Malformed JSON body', code: 'BAD_JSON' });
  });

  it('treats SQL in inputs as plain text', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: "a@b.co' OR '1'='1", password: "' OR 1=1 --" })
      .expect(400); // not even a valid email
    expect(res.body.code).toBe('VALIDATION');
    const agent = await signedInAgent();
    await agent.get(`/api/documents/${encodeURIComponent("x' OR '1'='1")}`).expect(404);
  });
});
