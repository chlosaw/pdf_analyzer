/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Same-origin in dev too, so the httpOnly auth cookie just works. (In Docker, nginx does this.)
const proxy = { '/api': process.env.API_PROXY_TARGET ?? 'http://localhost:4000' };

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) }
  },
  server: { port: 5173, proxy },
  preview: { proxy },
  test: { environment: 'node' }
});
