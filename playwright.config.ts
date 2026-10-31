import { defineConfig, devices } from '@playwright/test';

const API_PORT = 4100;
const WEB_PORT = 4173;

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  globalSetup: './e2e/global-setup.ts',
  use: { baseURL: `http://localhost:${WEB_PORT}`, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Production builds of both apps, with the offline AI provider. Run `npm run build` first.
  webServer: [
    {
      command: 'npm run db:deploy -w apps/api && npm start -w apps/api',
      url: `http://localhost:${API_PORT}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        NODE_ENV: 'production',
        COOKIE_SECURE: 'false',
        PORT: String(API_PORT),
        DATABASE_URL: process.env.E2E_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/pdf_analyzer_e2e',
        JWT_SECRET: 'e2e-secret-that-is-at-least-32-characters-long',
        AI_PROVIDER: 'fake',
        STORAGE_DRIVER: 'local',
        LOCAL_STORAGE_DIR: './uploads-e2e'
      }
    },
    {
      command: `npm run preview -w apps/web -- --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: !process.env.CI,
      env: { API_PROXY_TARGET: `http://localhost:${API_PORT}` }
    }
  ]
});
