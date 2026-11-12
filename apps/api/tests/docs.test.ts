import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import SwaggerParser from '@apidevtools/swagger-parser';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { openApiDocument } from '../src/docs/openapi';
import { resetDb, signedInAgent } from './helpers';

const METHODS = ['get', 'post', 'patch', 'put', 'delete'] as const;
const paths = openApiDocument.paths as Record<string, Partial<Record<(typeof METHODS)[number], unknown>>>;

const documented = Object.entries(paths).flatMap(([p, item]) =>
  METHODS.filter((m) => item[m]).map((m) => `${m.toUpperCase()} ${p}`)
);

/** Routes declared in the code: router.get('/x', ...) in each *.routes.ts, prefixed with where app.ts mounts it. */
function declaredRoutes(): string[] {
  const appSource = readFileSync(path.join(__dirname, '../src/app.ts'), 'utf8');
  const mounts = new Map(
    [...appSource.matchAll(/api\.use\('([^']+)',[^\n]*?(\w+)Router\(/g)].map((m) => [m[2], m[1]] as const)
  );
  const routes = [...appSource.matchAll(/api\.(get|post|patch|put|delete)\('([^']+)'/g)].map(
    (m) => `${m[1].toUpperCase()} ${m[2]}`
  );
  const modules = path.join(__dirname, '../src/modules');
  for (const dir of readdirSync(modules)) {
    for (const file of readdirSync(path.join(modules, dir)).filter((f) => f.endsWith('.routes.ts'))) {
      const source = readFileSync(path.join(modules, dir, file), 'utf8');
      const factory = /export function (\w+)Router/.exec(source)?.[1];
      const prefix = factory && mounts.get(factory);
      expect(prefix, `${file} is not mounted in app.ts`).toBeDefined();
      for (const m of source.matchAll(/router\.(get|post|patch|put|delete)\('([^']+)'/g)) {
        const route = `${prefix}${m[2] === '/' ? '' : m[2]}`.replace(/:(\w+)/g, '{$1}');
        routes.push(`${m[1].toUpperCase()} ${route}`);
      }
    }
  }
  return routes;
}

describe('API documentation', () => {
  beforeAll(resetDb);

  it('is a valid OpenAPI 3.1 document', async () => {
    await expect(SwaggerParser.validate(structuredClone(openApiDocument) as never)).resolves.toBeTruthy();
  });

  it('documents every route in the code, and nothing that does not exist', () => {
    expect([...documented].sort()).toEqual([...declaredRoutes()].sort());
  });

  it('every documented operation is actually served', async () => {
    const agent = await signedInAgent();
    // Sign-out last, so the other calls are made signed in
    const ordered = [...documented].sort((a, b) => Number(a.endsWith('/logout')) - Number(b.endsWith('/logout')));
    for (const op of ordered) {
      const [method, p] = op.split(' ');
      const url = `/api${p.replace('{id}', '00000000-0000-4000-8000-000000000000')}`;
      const res = await agent[method.toLowerCase() as 'get'](url).send({});
      expect(res.body?.error, `${op} is documented but not routed`).not.toBe('Endpoint not found');
    }
  });

  it('serves the spec and the Swagger UI page with its own strict CSP', async () => {
    const app = createApp();
    const spec = await request(app).get('/api/openapi.json').expect(200);
    expect(spec.body.openapi).toBe('3.1.0');

    const page = await request(app).get('/api/docs').expect(200);
    expect(page.text).toContain('swagger-ui-bundle.js');
    expect(page.headers['content-security-policy']).toContain("script-src 'self'");
    await request(app)
      .get('/api/docs/init.js')
      .expect(200)
      .expect('Content-Type', /javascript/);
    await request(app).get('/api/docs/assets/swagger-ui-bundle.js').expect(200);
    await request(app).get('/api/docs/assets/nope.js').expect(404);
  });
});
