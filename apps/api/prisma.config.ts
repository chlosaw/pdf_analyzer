import path from 'node:path';
import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

// The Prisma CLI only looks for .env next to the schema; load the repo-root .env like the app does.
// Variables already set (Docker, CI) win over the file.
config({ path: [path.resolve(import.meta.dirname, '.env'), path.resolve(import.meta.dirname, '../../.env')] });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { seed: 'tsx prisma/seed.ts' }
});
