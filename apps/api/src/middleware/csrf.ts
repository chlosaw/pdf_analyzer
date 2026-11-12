import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../lib/errors';
import { logSecurityEvent } from '../lib/securityLog';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defence in depth, on top of the SameSite=Lax cookie: state-changing requests must come from our own
 * pages. Browsers set Sec-Fetch-Site themselves and page scripts can't forge it; older browsers that don't
 * send it are checked by Origin instead. Requests with neither header aren't from a browser page (curl, tests),
 * so there is no victim's cookie to abuse.
 */
export function verifyOrigin(req: Request, _res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method)) return next();

  const site = req.get('sec-fetch-site');
  if (site) {
    // "none" = typed into the address bar / bookmark, which can't carry a POST body from another site
    if (site === 'same-origin' || site === 'none') return next();
    return reject(req, next, `sec-fetch-site=${site}`);
  }

  const origin = req.get('origin');
  if (!origin) return next();
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return reject(req, next, 'malformed origin');
  }
  // Behind nginx / the Vite proxy the Host header is the API's own; the browser-facing host is forwarded.
  const allowed = [req.get('x-forwarded-host'), req.get('host')].filter(Boolean);
  if (allowed.includes(originHost)) return next();
  return reject(req, next, `origin=${origin}`);
}

function reject(req: Request, next: NextFunction, reason: string) {
  logSecurityEvent('csrf_blocked', req, { reason });
  next(new HttpError(403, 'Cross-site request blocked', 'CSRF'));
}
