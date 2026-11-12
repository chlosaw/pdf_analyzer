import type { Request } from 'express';
import { isTest } from './env';

export type SecurityEvent =
  'login_failed' | 'account_locked' | 'rate_limited' | 'csrf_blocked' | 'invalid_session' | 'upload_rejected';

/**
 * Security-relevant events as one JSON line each, so a log platform (Render, Datadog, ...) can alert on them.
 * Never pass passwords, tokens or document contents in `details`.
 */
export function logSecurityEvent(event: SecurityEvent, req: Request, details: Record<string, unknown> = {}) {
  if (isTest) return;
  console.warn(
    JSON.stringify({
      type: 'security',
      event,
      at: new Date().toISOString(),
      ip: req.ip,
      method: req.method,
      path: req.originalUrl.split('?')[0],
      userId: req.userId,
      userAgent: req.get('user-agent')?.slice(0, 200),
      ...details
    })
  );
}
