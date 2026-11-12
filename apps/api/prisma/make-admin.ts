/**
 * Promotes an existing account to administrator (or back, with --demote).
 *
 *   npm run make-admin -w apps/api -- someone@example.com
 *   node dist/make-admin.js someone@example.com          (in the container)
 */
import '../src/lib/env'; // loads and validates .env (DATABASE_URL)
import { prisma } from '../src/lib/db';

async function main() {
  const args = process.argv.slice(2);
  const demote = args.includes('--demote');
  const email = args.find((a) => !a.startsWith('--'))?.trim().toLowerCase();
  if (!email) throw new Error('Usage: make-admin <email> [--demote]');

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error(`No account with the email ${email}. Register first, then run this again.`);
  if (user.isDemo) throw new Error("Demo sandboxes can't be administrators");

  await prisma.user.update({ where: { id: user.id }, data: { role: demote ? 'USER' : 'ADMIN' } });
  console.log(`${email} is now ${demote ? 'a regular user' : 'an administrator'}`);
}

main()
  .catch((err: Error) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
