import { Router } from 'express';
import multer from 'multer';
import { MAX_FILE_SIZE_BYTES } from '@pdf-analyzer/shared';
import { HttpError } from '../../lib/errors';
import type { Limiters } from '../../middleware/rateLimit';
import * as controller from './documents.controller';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new HttpError(415, 'Only PDF files are supported', 'UNSUPPORTED_TYPE'));
  }
});

/** Mounted behind requireAuth. */
export function documentsRouter(limiters: Limiters) {
  const router = Router();
  router.get('/', controller.list);
  router.post('/', limiters.upload, upload.single('file'), controller.upload);
  router.get('/:id', controller.get);
  router.get('/:id/file', controller.file);
  router.post('/:id/chat', controller.openChat); // get-or-create the document's own chat
  router.delete('/:id', controller.remove);
  return router;
}
