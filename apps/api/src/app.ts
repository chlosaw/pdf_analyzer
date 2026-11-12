import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { prisma } from './lib/db';
import { env } from './lib/env';
import { notFound } from './lib/errors';
import { requireAuth } from './middleware/auth';
import { verifyOrigin } from './middleware/csrf';
import { errorHandler } from './middleware/error';
import { createLimiters, defaultRateLimits, type RateLimitConfig } from './middleware/rateLimit';
import { authRouter } from './modules/auth/auth.routes';
import { chatRouter } from './modules/chat/chat.routes';
import { documentsRouter } from './modules/documents/documents.routes';

export interface AppOptions {
  rateLimits?: Partial<RateLimitConfig>;
}

export function createApp({ rateLimits }: AppOptions = {}) {
  const app = express();
  const limiters = createLimiters({ ...defaultRateLimits, ...rateLimits });

  app.set('trust proxy', env.TRUST_PROXY); // nginx/Render sit in front of us; needed for real client IPs
  app.disable('x-powered-by');
  app.use(
    helmet({
      // The API only returns JSON, SSE and PDF bytes, never pages, so nothing may run or embed.
      contentSecurityPolicy: { useDefaults: false, directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } }
    })
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  const api = express.Router();
  api.use(limiters.api);
  api.use(verifyOrigin);
  // Responses hold private documents and answers: keep them out of shared and browser caches.
  api.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  api.get('/health', async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true });
  });
  api.use('/auth', authRouter(limiters));
  api.use('/documents', requireAuth, documentsRouter(limiters));
  api.use('/chats', requireAuth, chatRouter(limiters));
  api.use((_req, _res, next) => next(notFound('Endpoint')));
  app.use('/api', api);

  app.use(errorHandler);
  return app;
}
