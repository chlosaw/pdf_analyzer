import { createRequire } from 'node:module';
import path from 'node:path';
import express, { Router } from 'express';
import { openApiDocument } from './openapi';

// Swagger UI's files come from the npm package (no CDN), so the page works under a strict CSP.
const swaggerUiDir = path.dirname(createRequire(import.meta.url).resolve('swagger-ui-dist/package.json'));

// The API's default CSP is deny-all; this page needs its own scripts and styles (Swagger UI sets inline styles).
const DOCS_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'"
].join('; ');

const page = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>PDF Analyzer API</title>
    <link rel="stylesheet" href="/api/docs/assets/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="/api/docs/assets/swagger-ui-bundle.js"></script>
    <script src="/api/docs/init.js"></script>
  </body>
</html>`;

// External file rather than an inline <script>, which the CSP forbids.
const init = `window.ui = SwaggerUIBundle({
  url: '/api/openapi.json',
  dom_id: '#swagger-ui',
  deepLinking: true,
  tryItOutEnabled: false,
  persistAuthorization: false
});`;

/** GET /api/openapi.json and the browsable docs at /api/docs. Public: the spec holds no secrets. */
export function docsRouter() {
  const router = Router();
  router.get('/openapi.json', (_req, res) => {
    res.json(openApiDocument);
  });
  router.get(['/docs', '/docs/'], (_req, res) => {
    res.set('Content-Security-Policy', DOCS_CSP).type('html').send(page);
  });
  router.get('/docs/init.js', (_req, res) => {
    res.type('application/javascript').send(init);
  });
  router.use('/docs/assets', express.static(swaggerUiDir, { index: false, maxAge: '1d' }));
  return router;
}
