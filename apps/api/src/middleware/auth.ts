import type { CookieOptions, NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env, secureCookies } from '../lib/env';
import { HttpError } from '../lib/errors';

export const AUTH_COOKIE = 'token';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const cookieOptions: CookieOptions = {
  httpOnly: true, // not readable from JS, so XSS can't steal it
  secure: secureCookies, // HTTPS only in production
  sameSite: 'lax', // not sent on cross-site POSTs, which blocks CSRF
  path: '/'
};

export function setAuthCookie(res: Response, userId: string) {
  const token = jwt.sign({ sub: userId }, env.JWT_SECRET, { expiresIn: '7d' });
  res.cookie(AUTH_COOKIE, token, { ...cookieOptions, maxAge: MAX_AGE_MS });
}

export function clearAuthCookie(res: Response) {
  res.clearCookie(AUTH_COOKIE, cookieOptions);
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token: unknown = req.cookies?.[AUTH_COOKIE];
  if (typeof token !== 'string') return next(new HttpError(401, 'Not signed in', 'UNAUTHENTICATED'));

  try {
    const payload = jwt.verify(token, env.JWT_SECRET);
    if (typeof payload === 'string' || typeof payload.sub !== 'string') throw new Error('bad payload');
    req.userId = payload.sub;
    next();
  } catch {
    next(new HttpError(401, 'Session expired, please sign in again', 'UNAUTHENTICATED'));
  }
}

/** Use after requireAuth. */
export function userId(req: Request): string {
  if (!req.userId) throw new HttpError(401, 'Not signed in', 'UNAUTHENTICATED');
  return req.userId;
}
