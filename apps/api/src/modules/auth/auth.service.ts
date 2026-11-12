import bcrypt from 'bcryptjs';
import type { User } from '@prisma/client';
import type { LoginInput, RegisterInput, UserDTO } from '@pdf-analyzer/shared';
import { prisma } from '../../lib/db';
import { storage } from '../../lib/storage';
import { isTest } from '../../lib/env';
import { HttpError } from '../../lib/errors';

const BCRYPT_ROUNDS = isTest ? 4 : 12;
// Compared against when the email doesn't exist, so both paths take the same time.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_ROUNDS);

export const toUserDTO = (u: User): UserDTO => ({
  id: u.id,
  email: u.email,
  name: u.name,
  isDemo: u.isDemo,
  role: u.role
});

export const hashPassword = (password: string) => bcrypt.hash(password, BCRYPT_ROUNDS);

export async function register(input: RegisterInput) {
  const exists = await prisma.user.findUnique({ where: { email: input.email } });
  if (exists) throw new HttpError(409, 'An account with this email already exists', 'EMAIL_TAKEN');
  return prisma.user.create({
    data: { email: input.email, name: input.name, passwordHash: await hashPassword(input.password) }
  });
}

export async function login(input: LoginInput) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  const ok = await bcrypt.compare(input.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) throw new HttpError(401, 'Invalid email or password', 'BAD_CREDENTIALS');
  return user;
}

/**
 * Deletes users with everything they own: stored PDFs first, then the rows (documents, chunks, chats,
 * messages and sessions cascade). A file that fails to delete is only orphaned storage, so it never
 * keeps an account alive.
 */
export async function deleteUsers(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const docs = await prisma.document.findMany({ where: { userId: { in: ids } }, select: { storageKey: true } });
  await Promise.allSettled(docs.map((d) => storage.delete(d.storageKey)));
  const { count } = await prisma.user.deleteMany({ where: { id: { in: ids } } });
  return count;
}

export function findUser(id: string) {
  return prisma.user.findUnique({ where: { id } });
}
