import { Router } from 'express';
import type { Limiters } from '../../middleware/rateLimit';
import * as controller from './chat.controller';

/** Mounted behind requireAuth. */
export function chatRouter(limiters: Limiters) {
  const router = Router();
  router.get('/', controller.list);
  router.post('/', controller.create); // multi-document chat
  router.get('/:id', controller.get);
  router.delete('/:id', controller.remove);
  router.post('/:id/messages', limiters.ask, controller.ask);
  router.delete('/:id/messages', controller.clear);
  return router;
}
