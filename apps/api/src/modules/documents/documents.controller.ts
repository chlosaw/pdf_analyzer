import type { Request, Response } from 'express';
import { HttpError } from '../../lib/errors';
import { userId } from '../../middleware/auth';
import * as documents from './documents.service';

const idParam = (req: Request) => String(req.params.id);

export async function list(req: Request, res: Response) {
  const docs = await documents.listDocuments(userId(req));
  res.json(docs.map(documents.toDocumentDTO));
}

export async function upload(req: Request, res: Response) {
  const file = req.file;
  if (!file) throw new HttpError(400, 'Attach a PDF in the "file" field', 'NO_FILE');
  const doc = await documents.createDocument(userId(req), {
    // multer decodes file names as latin1
    originalName: Buffer.from(file.originalname, 'latin1').toString('utf8'),
    buffer: file.buffer,
    size: file.size
  });
  res.status(201).json(documents.toDocumentDTO(doc));
}

export async function get(req: Request, res: Response) {
  res.json(documents.toDocumentDTO(await documents.getOwnedDocument(userId(req), idParam(req))));
}

/** Files are proxied through the API so the storage bucket can stay private. */
export async function file(req: Request, res: Response) {
  const { doc, data } = await documents.readDocumentFile(userId(req), idParam(req));
  res
    .set({
      'Content-Type': 'application/pdf',
      'Content-Length': String(data.length),
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(doc.name)}`,
      'Cache-Control': 'private, max-age=3600'
    })
    .send(data);
}

export async function remove(req: Request, res: Response) {
  await documents.deleteDocument(userId(req), idParam(req));
  res.status(204).end();
}
