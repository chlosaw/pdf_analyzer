import type { Request } from 'express';
import rateLimit from 'express-rate-limit';

export interface RateLimitConfig {
  /** Login/register attempts per IP per 15 minutes */
  auth: number;
  /** Demo sandboxes created per IP per hour (each one embeds two PDFs) */
  demo: number;
  /** Uploads per user per hour */
  upload: number;
  /** Questions per user per minute */
  ask: number;
  /** All API requests per IP per minute */
  api: number;
}

export const defaultRateLimits: RateLimitConfig = { auth: 20, demo: 5, upload: 20, ask: 15, api: 300 };

const common = {
  standardHeaders: 'draft-7' as const,
  legacyHeaders: false
};

const tooMany = (what: string) => ({
  error: `Too many ${what}. Please wait a moment and try again.`,
  code: 'RATE_LIMITED'
});

// Authenticated limiters key on the user rather than the IP, so users behind
// one shared IP (office, campus) don't share a quota.
const byUser = (req: Request) => req.userId ?? 'anonymous';

export function createLimiters(config: RateLimitConfig) {
  return {
    api: rateLimit({ ...common, windowMs: 60_000, limit: config.api, message: tooMany('requests') }),
    auth: rateLimit({ ...common, windowMs: 15 * 60_000, limit: config.auth, message: tooMany('sign-in attempts') }),
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
