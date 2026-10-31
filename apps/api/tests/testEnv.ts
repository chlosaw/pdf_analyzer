import { config } from 'dotenv';
import os from 'node:os';
import path from 'node:path';

config({ path: [path.resolve(process.cwd(), '.env'), path.resolve(process.cwd(), '../../.env')] });

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/pdf_analyzer_test';

export function applyTestEnv() {
  Object.assign(process.env, {
    NODE_ENV: 'test',
    DATABASE_URL: TEST_DATABASE_URL,
    JWT_SECRET: 'test-secret-that-is-at-least-32-characters-long',
    AI_PROVIDER: 'fake',
    STORAGE_DRIVER: 'local',
    LOCAL_STORAGE_DIR: path.join(os.tmpdir(), 'pdf-analyzer-test-uploads')
  });
}
