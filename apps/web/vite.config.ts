/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Same-origin in dev too, so the httpOnly auth cookie just works. (In Docker, nginx does this.)
const proxy = { '/api': process.env.API_PROXY_TARGET ?? 'http://localhost:4000' };

// The production Content-Security-Policy (see nginx/security-headers.conf; keep the two in sync).
// `vite preview`, which the e2e tests run against, serves it too, so a CSP that breaks the app fails CI.
// Not used by the dev server, whose hot reload needs inline scripts.
const csp = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'"
].join('; ');

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) }
  },
  server: { port: 5173, proxy },
  preview: { proxy, headers: { 'Content-Security-Policy': csp, 'X-Content-Type-Options': 'nosniff' } },
  test: { environment: 'node' }
});
