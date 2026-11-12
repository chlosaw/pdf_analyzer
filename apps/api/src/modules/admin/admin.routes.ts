import { Router } from 'express';
import * as controller from './admin.controller';

/** Mounted behind requireAuth + requireRole('ADMIN'). */
export function adminRouter() {
  const router = Router();
  router.get('/stats', controller.stats);
  router.get('/users', controller.listUsers);
  router.patch('/users/:id', controller.updateUser);
  router.delete('/users/:id', controller.deleteUser);
  return router;
}
