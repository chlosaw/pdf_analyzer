import type { Request } from 'express';
import rateLimit, { type Options } from 'express-rate-limit';
import { logSecurityEvent } from '../lib/securityLog';

export interface RateLimitConfig {
  /** Login/register attempts per IP per 15 minutes */
  auth: number;
  /** Failed sign-ins per account per 15 minutes, whatever IP they come from (stops distributed password guessing) */
  accountLockout: number;
  /** Demo sandboxes created per IP per hour (each one embeds two PDFs) */
  demo: number;
  /** Uploads per user per hour */
  upload: number;
  /** Questions per user per minute */
  ask: number;
  /** All API requests per IP per minute */
  api: number;
}

export const defaultRateLimits: RateLimitConfig = {
  auth: 20,
  accountLockout: 10,
  demo: 5,
  upload: 20,
  ask: 15,
  api: 300
};

const common: Partial<Options> = {
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler(req, res, _next, options) {
    logSecurityEvent('rate_limited', req, { limit: options.limit });
    res.status(options.statusCode).json(options.message);
  }
};

const tooMany = (what: string) => ({
  error: `Too many ${what}. Please wait a moment and try again.`,
  code: 'RATE_LIMITED'
});

// Authenticated limiters key on the user rather than the IP, so users behind
// one shared IP (office, campus) don't share a quota.
const byUser = (req: Request) => req.userId ?? 'anonymous';

const byEmail = (req: Request) => {
  const email: unknown = req.body?.email;
  return typeof email === 'string' ? email.trim().toLowerCase() : 'no-email';
};

export function createLimiters(config: RateLimitConfig) {
  return {
    api: rateLimit({ ...common, windowMs: 60_000, limit: config.api, message: tooMany('requests') }),
    auth: rateLimit({ ...common, windowMs: 15 * 60_000, limit: config.auth, message: tooMany('sign-in attempts') }),
    accountLockout: rateLimit({
      ...common,
      windowMs: 15 * 60_000,
      limit: config.accountLockout,
      keyGenerator: byEmail,
      skipSuccessfulRequests: true, // only wrong passwords count
      message: {
        error: 'Too many failed sign-in attempts for this account. Please wait 15 minutes and try again.',
        code: 'ACCOUNT_LOCKED'
      },
      handler(req, res, _next, options) {
        logSecurityEvent('account_locked', req, { email: byEmail(req) });
        res.status(options.statusCode).json(options.message);
      }
    }),
    demo: rateLimit({ ...common, windowMs: 60 * 60_000, limit: config.demo, message: tooMany('demo sandboxes') }),
    upload: rateLimit({
      ...common,
      windowMs: 60 * 60_000,
      limit: config.upload,
      keyGenerator: byUser,
      message: tooMany('uploads')
    }),
    ask: rateLimit({
      ...common,
      windowMs: 60_000,
      limit: config.ask,
      keyGenerator: byUser,
      message: tooMany('questions')
    })
  };
}

export type Limiters = ReturnType<typeof createLimiters>;
