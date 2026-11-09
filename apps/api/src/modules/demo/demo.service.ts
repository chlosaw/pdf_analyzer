import { randomBytes } from 'node:crypto';
import { DEMO_SANDBOX_HOURS } from '@pdf-analyzer/shared';
import { prisma } from '../../lib/db';
import { storage } from '../../lib/storage';
import { hashPassword } from '../auth/auth.service';
import { createSampleDocument, DEMO_DOCUMENTS } from './demo.fixtures';

const DEMO_EMAIL_DOMAIN = 'demo.pdf-analyzer.dev';
const SANDBOX_LIFETIME_MS = DEMO_SANDBOX_HOURS * 60 * 60 * 1000;

/**
 * Creates a private, throwaway account with the sample PDFs already indexed, so a visitor can start
 * asking questions straight away. Nobody can sign in to it again: the password is random and never shown.
 */
export async function createSandbox() {
  const suffix = randomBytes(4).toString('hex');
  const user = await prisma.user.create({
    data: {
      email: `visitor-${suffix}@${DEMO_EMAIL_DOMAIN}`,
      name: 'Demo Visitor',
      passwordHash: await hashPassword(randomBytes(24).toString('hex')),
      isDemo: true
    }
  });
  await Promise.all(DEMO_DOCUMENTS.map((sample) => createSampleDocument(user.id, sample)));
  return user;
}

/** Deletes sandboxes older than DEMO_SANDBOX_HOURS: the visitor, their stored PDFs and (by cascade) everything else. */
export async function deleteExpiredSandboxes(now = Date.now()): Promise<number> {
  const expired = await prisma.user.findMany({
    where: { isDemo: true, createdAt: { lt: new Date(now - SANDBOX_LIFETIME_MS) } },
    select: { id: true, documents: { select: { storageKey: true } } }
  });
  if (expired.length === 0) return 0;

  // A file that fails to delete is only orphaned storage; never let it keep the account alive.
  await Promise.allSettled(expired.flatMap((u) => u.documents.map((d) => storage.delete(d.storageKey))));
  const { count } = await prisma.user.deleteMany({ where: { id: { in: expired.map((u) => u.id) } } });
  return count;
}
