import { createApp } from './app';
import { failInterruptedIngestions } from './jobs/ingestDocument';
import { prisma } from './lib/db';
import { env } from './lib/env';

await failInterruptedIngestions();

const server = createApp().listen(env.PORT, () => {
  console.log(`API listening on http://localhost:${env.PORT} (AI: ${env.AI_PROVIDER}, storage: ${env.STORAGE_DRIVER})`);
});

async function shutdown() {
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
