import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import type { Limiters } from '../../middleware/rateLimit';
import * as controller from './auth.controller';

export function authRouter(limiters: Limiters) {
  const router = Router();
  router.post('/register', limiters.auth, controller.register);
  router.post('/login', limiters.auth, controller.login);
  router.post('/demo', limiters.demo, controller.demo);
  router.post('/logout', controller.logout);
  router.get('/me', requireAuth, controller.me);
  return router;
}
