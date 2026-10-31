import type { Request, Response } from 'express';
import { loginSchema, registerSchema } from '@pdf-analyzer/shared';
import { HttpError } from '../../lib/errors';
import { clearAuthCookie, setAuthCookie, userId } from '../../middleware/auth';
import * as auth from './auth.service';

export async function register(req: Request, res: Response) {
  const user = await auth.register(registerSchema.parse(req.body));
  setAuthCookie(res, user.id);
  res.status(201).json(auth.toUserDTO(user));
}

export async function login(req: Request, res: Response) {
  const user = await auth.login(loginSchema.parse(req.body));
  setAuthCookie(res, user.id);
  res.json(auth.toUserDTO(user));
}

export function logout(_req: Request, res: Response) {
  clearAuthCookie(res);
  res.status(204).end();
}

export async function me(req: Request, res: Response) {
  const user = await auth.findUser(userId(req));
  if (!user) {
    clearAuthCookie(res);
    throw new HttpError(401, 'Account no longer exists', 'UNAUTHENTICATED');
  }
  res.json(auth.toUserDTO(user));
}
