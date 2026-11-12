import type { Request, Response } from 'express';
import { loginSchema, registerSchema } from '@pdf-analyzer/shared';
import { HttpError } from '../../lib/errors';
import { logSecurityEvent } from '../../lib/securityLog';
import { endSession, startSession, userId } from '../../middleware/auth';
import { createSandbox } from '../demo/demo.service';
import * as auth from './auth.service';

export async function register(req: Request, res: Response) {
  const user = await auth.register(registerSchema.parse(req.body));
  await startSession(res, user.id);
  res.status(201).json(auth.toUserDTO(user));
}

export async function login(req: Request, res: Response) {
  const input = loginSchema.parse(req.body);
  const user = await auth.login(input).catch((err: unknown) => {
    if (err instanceof HttpError && err.code === 'BAD_CREDENTIALS')
      logSecurityEvent('login_failed', req, { email: input.email });
    throw err;
  });
  await startSession(res, user.id);
  res.json(auth.toUserDTO(user));
}

/** "Try the demo": a fresh sandbox with the sample PDFs, signed in straight away. */
export async function demo(_req: Request, res: Response) {
  const user = await createSandbox();
  await startSession(res, user.id);
  res.status(201).json(auth.toUserDTO(user));
}

export async function logout(req: Request, res: Response) {
  await endSession(req, res);
  res.status(204).end();
}

export async function me(req: Request, res: Response) {
  const user = await auth.findUser(userId(req));
  if (!user) {
    await endSession(req, res);
    throw new HttpError(401, 'Account no longer exists', 'UNAUTHENTICATED');
  }
  res.json(auth.toUserDTO(user));
}
