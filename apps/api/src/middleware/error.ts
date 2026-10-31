import type { ErrorRequestHandler } from 'express';
import multer from 'multer';
import { ZodError } from 'zod';
import { MAX_FILE_SIZE_MB, type ApiErrorBody } from '@pdf-analyzer/shared';
import { HttpError } from '../lib/errors';
import { isTest } from '../lib/env';

export const errorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  // Streaming responses have already sent headers; let Express close the socket.
  if (res.headersSent) return next(err);

  const send = (status: number, body: ApiErrorBody) => res.status(status).json(body);

  if (err instanceof ZodError) {
    const details = err.flatten().fieldErrors as ApiErrorBody['details'];
    const first = err.issues[0]?.message ?? 'Invalid request';
    return send(400, { error: first, code: 'VALIDATION', details });
  }
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return send(413, { error: `File is too large. The limit is ${MAX_FILE_SIZE_MB} MB.`, code: 'FILE_TOO_LARGE' });
    }
    return send(400, { error: err.message, code: 'UPLOAD_ERROR' });
  }
  if (err instanceof HttpError) {
    return send(err.status, { error: err.message, code: err.code });
  }
  // Malformed JSON body from express.json()
  if (err?.type === 'entity.parse.failed') {
    return send(400, { error: 'Malformed JSON body', code: 'BAD_JSON' });
  }

  if (!isTest) console.error(err);
  return send(500, { error: 'Something went wrong on our side.', code: 'INTERNAL' });
};
