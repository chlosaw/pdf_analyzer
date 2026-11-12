import type { Role } from '@prisma/client';
import type { CookieOptions, NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/db';
import { env, secureCookies } from '../lib/env';
import { HttpError } from '../lib/errors';
import { logSecurityEvent } from '../lib/securityLog';

export const AUTH_COOKIE = 'token';
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Pinning these means a token signed with another algorithm ("none", RS256 with our secret as a public key)
// or minted for another app that happens to share the secret is rejected.
const JWT_OPTIONS = { algorithm: 'HS256', issuer: 'pdf-analyzer', audience: 'pdf-analyzer-web' } as const;

const cookieOptions: CookieOptions = {
  httpOnly: true, // not readable from JS, so XSS can't steal it
  secure: secureCookies, // HTTPS only in production
  sameSite: 'lax', // not sent on cross-site POSTs, which blocks CSRF (see also verifyOrigin)
  path: '/'
};

/** Starts a server-side session and puts a token for it in the cookie. */
export async function startSession(res: Response, userId: string) {
  const session = await prisma.session.create({
    data: { userId, expiresAt: new Date(Date.now() + SESSION_TTL_MS) }
  });
  const token = jwt.sign({ sid: session.id }, env.JWT_SECRET, {
    ...JWT_OPTIONS,
    subject: userId,
    expiresIn: Math.floor(SESSION_TTL_MS / 1000)
  });
  res.cookie(AUTH_COOKIE, token, { ...cookieOptions, maxAge: SESSION_TTL_MS });
}

/** Revokes the current session, so the token is useless even if it was copied. */
export async function endSession(req: Request, res: Response) {
  const claims = readToken(req);
  if (claims) await prisma.session.deleteMany({ where: { id: claims.sid, userId: claims.sub } });
  res.clearCookie(AUTH_COOKIE, cookieOptions);
}

function readToken(req: Request): { sub: string; sid: string } | null {
  const token: unknown = req.cookies?.[AUTH_COOKIE];
  if (typeof token !== 'string') return null;
  try {
    const payload = jwt.verify(token, env.JWT_SECRET, {
      algorithms: [JWT_OPTIONS.algorithm],
      issuer: JWT_OPTIONS.issuer,
      audience: JWT_OPTIONS.audience
    });
    if (typeof payload === 'string' || typeof payload.sub !== 'string' || typeof payload.sid !== 'string') return null;
    return { sub: payload.sub, sid: payload.sid };
  } catch {
    return null;
  }
}

/** A valid signature is not enough: the session must still exist (not signed out, not expired, user not deleted). */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (typeof req.cookies?.[AUTH_COOKIE] !== 'string') {
    return next(new HttpError(401, 'Not signed in', 'UNAUTHENTICATED'));
  }
  const claims = readToken(req);
  const session =
    claims &&
    (await prisma.session.findUnique({ where: { id: claims.sid }, include: { user: { select: { role: true } } } }));
  if (!claims || !session || session.userId !== claims.sub || session.expiresAt <= new Date()) {
    logSecurityEvent('invalid_session', req, { reason: claims ? 'revoked_or_expired' : 'bad_token' });
    res.clearCookie(AUTH_COOKIE, cookieOptions);
    return next(new HttpError(401, 'Session expired, please sign in again', 'UNAUTHENTICATED'));
  }
  req.userId = session.userId;
  req.userRole = session.user.role;
  next();
}

/** Role-based access control. Use after requireAuth; anyone without the role gets 403. */
export const requireRole = (role: Role) => (req: Request, _res: Response, next: NextFunction) => {
  if (req.userRole === role) return next();
  logSecurityEvent('forbidden', req, { required: role });
  next(new HttpError(403, 'You do not have permission to do that', 'FORBIDDEN'));
};

/** Use after requireAuth. */
export function userId(req: Request): string {
  if (!req.userId) throw new HttpError(401, 'Not signed in', 'UNAUTHENTICATED');
  return req.userId;
}

export function deleteExpiredSessions(now = new Date()) {
  return prisma.session.deleteMany({ where: { expiresAt: { lt: now } } });
}
