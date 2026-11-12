/**
 * Demo data: a demo account with two indexed PDFs, so the live demo works without uploading anything,
 * plus an administrator when ADMIN_EMAIL and ADMIN_PASSWORD are set.
 * Idempotent: creates the users and any missing demo document, leaves everything else alone.
 *
 *   npm run db:seed -w apps/api      (also runs on container start when SEED_DEMO=true)
 */
import { prisma } from '../src/lib/db';
import { hashPassword } from '../src/modules/auth/auth.service';
import { createSampleDocument, DEMO_DOCUMENTS } from '../src/modules/demo/demo.fixtures';

const DEMO_EMAIL = 'demo@pdf-analyzer.dev';
const DEMO_PASSWORD = 'demo1234';

async function seedDemo() {
  const user =
    (await prisma.user.findUnique({ where: { email: DEMO_EMAIL } })) ??
    (await prisma.user.create({
      data: { email: DEMO_EMAIL, name: 'Demo User', passwordHash: await hashPassword(DEMO_PASSWORD) }
    }));

  for (const demo of DEMO_DOCUMENTS) {
    const existing = await prisma.document.findFirst({ where: { userId: user.id, name: demo.name, status: 'READY' } });
    if (existing) continue;
    // Clear out a copy whose indexing failed or was interrupted before trying again.
    await prisma.document.deleteMany({ where: { userId: user.id, name: demo.name } });

    await createSampleDocument(user.id, demo);
    console.log(`Seeded "${demo.name}"`);
  }
  console.log(`Demo account ready: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
}

/** There is deliberately no default admin password: this also runs on the live deployment. */
async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) return;
  if (password.length < 12) throw new Error('ADMIN_PASSWORD must be at least 12 characters');

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    // Never overwrite an existing password from an environment variable; just make sure of the role.
    await prisma.user.update({ where: { id: existing.id }, data: { role: 'ADMIN' } });
  } else {
    await prisma.user.create({
      data: { email, name: 'Administrator', role: 'ADMIN', passwordHash: await hashPassword(password) }
    });
  }
  console.log(`Admin account ready: ${email}`);
}

seedDemo()
  .then(seedAdmin)
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
