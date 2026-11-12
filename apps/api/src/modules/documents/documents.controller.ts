import type { Request, Response } from 'express';
import { documentListQuerySchema, renameSchema } from '@pdf-analyzer/shared';
import { HttpError } from '../../lib/errors';
import { logSecurityEvent } from '../../lib/securityLog';
import { userId } from '../../middleware/auth';
import { getOrCreateDocumentChat, toChatDTO } from '../chat/chat.service';
import * as documents from './documents.service';

/** Rejections worth a security log line (a scanned or password-protected PDF is just a user mistake). */
const SUSPICIOUS_UPLOAD = new Set(['UNSUPPORTED_TYPE', 'PDF_INVALID', 'TOO_MANY_PAGES', 'DOCUMENT_LIMIT']);

const idParam = (req: Request) => String(req.params.id);

export async function list(req: Request, res: Response) {
  res.json(await documents.listDocuments(userId(req), documentListQuerySchema.parse(req.query)));
}

export async function rename(req: Request, res: Response) {
  const { name } = renameSchema.parse(req.body);
  res.json(documents.toDocumentDTO(await documents.renameDocument(userId(req), idParam(req), name)));
}

export async function upload(req: Request, res: Response) {
  const file = req.file;
  if (!file) throw new HttpError(400, 'Attach a PDF in the "file" field', 'NO_FILE');
  const doc = await documents
    .createDocument(userId(req), {
      // multer decodes file names as latin1
      originalName: Buffer.from(file.originalname, 'latin1').toString('utf8'),
      buffer: file.buffer,
      size: file.size
    })
    .catch((err: unknown) => {
      if (err instanceof HttpError && SUSPICIOUS_UPLOAD.has(err.code ?? ''))
        logSecurityEvent('upload_rejected', req, { code: err.code, size: file.size });
      throw err;
    });
  res.status(201).json(documents.toDocumentDTO(doc));
}

export async function get(req: Request, res: Response) {
  res.json(documents.toDocumentDTO(await documents.getOwnedDocument(userId(req), idParam(req))));
}

/** Files are proxied through the API so the storage bucket can stay private. Not cached (see app.ts): they may be sensitive. */
export async function file(req: Request, res: Response) {
  const { doc, data } = await documents.readDocumentFile(userId(req), idParam(req));
  res
    .set({
      'Content-Type': 'application/pdf',
      'Content-Length': String(data.length),
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(doc.name)}`
    })
    .send(data);
}

export async function openChat(req: Request, res: Response) {
  const doc = await documents.getOwnedDocument(userId(req), idParam(req));
  const { chat, created } = await getOrCreateDocumentChat(doc);
  res.status(created ? 201 : 200).json(toChatDTO(chat));
}

export async function remove(req: Request, res: Response) {
  await documents.deleteDocument(userId(req), idParam(req));
  res.status(204).end();
}
