import { Router, type RequestHandler } from 'express';
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

/** A broken multipart body is the client's fault: answer 400, not 500. */
const uploadOne: RequestHandler = (req, res, next) =>
  upload.single('file')(req, res, (err?: unknown) => {
    if (err && !(err instanceof HttpError) && !(err instanceof multer.MulterError)) {
      return next(new HttpError(400, 'The upload was malformed. Please try again.', 'UPLOAD_ERROR'));
    }
    next(err);
  });

/** Mounted behind requireAuth. */
export function documentsRouter(limiters: Limiters) {
  const router = Router();
  router.get('/', controller.list);
  router.post('/', limiters.upload, uploadOne, controller.upload);
  router.get('/:id', controller.get);
  router.get('/:id/file', controller.file);
  router.post('/:id/chat', controller.openChat); // get-or-create the document's own chat
  router.delete('/:id', controller.remove);
  return router;
}
