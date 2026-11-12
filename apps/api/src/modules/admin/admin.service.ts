import type { Prisma, Role } from '@prisma/client';
import type { AdminStatsDTO, AdminUserDTO, adminUserListQuerySchema } from '@pdf-analyzer/shared';
import type { z } from 'zod';
import { prisma } from '../../lib/db';
import { HttpError, notFound } from '../../lib/errors';
import { containsText, pageArgs, toPage } from '../../lib/pagination';
import { deleteUsers, toUserDTO } from '../auth/auth.service';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export async function getStats(now = Date.now()): Promise<AdminStatsDTO> {
  const [users, demoUsers, documents, chats, questionsLast7Days, storage] = await prisma.$transaction([
    prisma.user.count(),
    prisma.user.count({ where: { isDemo: true } }),
    prisma.document.count(),
    prisma.chat.count(),
    prisma.message.count({ where: { role: 'USER', createdAt: { gte: new Date(now - WEEK_MS) } } }),
    prisma.document.aggregate({ _sum: { sizeBytes: true } })
  ]);
  return { users, demoUsers, documents, chats, questionsLast7Days, storageBytes: storage._sum.sizeBytes ?? 0 };
}

const withCounts = { _count: { select: { documents: true, chats: true } } } as const;
type UserWithCounts = Prisma.UserGetPayload<{ include: typeof withCounts }>;

const toAdminUserDTO = (u: UserWithCounts): AdminUserDTO => ({
  ...toUserDTO(u),
  createdAt: u.createdAt.toISOString(),
  documentCount: u._count.documents,
  chatCount: u._count.chats
});

export async function listUsers(query: z.output<typeof adminUserListQuerySchema>) {
  const where: Prisma.UserWhereInput = {
    ...(!query.includeDemo && { isDemo: false }),
    ...(query.role && { role: query.role }),
    ...(query.q && { OR: [{ email: containsText(query.q) }, { name: containsText(query.q) }] })
  };
  const [items, total] = await prisma.$transaction([
    prisma.user.findMany({ where, include: withCounts, orderBy: { createdAt: 'desc' }, ...pageArgs(query) }),
    prisma.user.count({ where })
  ]);
  return toPage(items.map(toAdminUserDTO), total, query);
}

/** Admins can't change their own role, so the last admin can't lock everyone out by accident. */
export async function setRole(actingUserId: string, id: string, role: Role) {
  if (id === actingUserId) throw new HttpError(403, "You can't change your own role", 'SELF');
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw notFound('User');
  if (user.isDemo && role === 'ADMIN') {
    throw new HttpError(409, "Demo sandboxes can't be administrators", 'DEMO_USER');
  }
  return toAdminUserDTO(await prisma.user.update({ where: { id }, data: { role }, include: withCounts }));
}

export async function deleteUser(actingUserId: string, id: string) {
  if (id === actingUserId) throw new HttpError(403, "You can't delete your own account here", 'SELF');
  if (!(await prisma.user.findUnique({ where: { id }, select: { id: true } }))) throw notFound('User');
  await deleteUsers([id]);
}
