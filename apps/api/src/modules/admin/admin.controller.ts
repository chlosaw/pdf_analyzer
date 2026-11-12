import type { Request, Response } from 'express';
import { adminUserListQuerySchema, updateRoleSchema } from '@pdf-analyzer/shared';
import { logSecurityEvent } from '../../lib/securityLog';
import { userId } from '../../middleware/auth';
import * as admin from './admin.service';

const idParam = (req: Request) => String(req.params.id);

export async function stats(_req: Request, res: Response) {
  res.json(await admin.getStats());
}

export async function listUsers(req: Request, res: Response) {
  res.json(await admin.listUsers(adminUserListQuerySchema.parse(req.query)));
}

export async function updateUser(req: Request, res: Response) {
  const { role } = updateRoleSchema.parse(req.body);
  const user = await admin.setRole(userId(req), idParam(req), role);
  logSecurityEvent('role_changed', req, { targetUserId: user.id, role });
  res.json(user);
}

export async function deleteUser(req: Request, res: Response) {
  await admin.deleteUser(userId(req), idParam(req));
  logSecurityEvent('user_deleted', req, { targetUserId: idParam(req) });
  res.status(204).end();
}
