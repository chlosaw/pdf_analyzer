import { randomUUID } from 'node:crypto';
import type { Document } from '@prisma/client';
import { MAX_DOCUMENTS_PER_USER, type DocumentDTO } from '@pdf-analyzer/shared';
import { enqueueIngestion } from '../../jobs/ingestDocument';
import { prisma } from '../../lib/db';
import { HttpError, notFound } from '../../lib/errors';
import { storage } from '../../lib/storage';
import { extractPages, hasExtractableText, looksLikePdf } from './pdf';

export const toDocumentDTO = (d: Document): DocumentDTO => ({
  id: d.id,
  name: d.name,
  sizeBytes: d.sizeBytes,
  pageCount: d.pageCount,
  status: d.status,
  error: d.error,
  createdAt: d.createdAt.toISOString()
});

export function listDocuments(userId: string) {
  return prisma.document.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
}

/** Every lookup is scoped to the owner; someone else's document is simply "not found". */
export async function getOwnedDocument(userId: string, id: string) {
  const doc = await prisma.document.findFirst({ where: { id, userId } });
  if (!doc) throw notFound('Document');
  return doc;
}

export interface UploadedFile {
  originalName: string;
  buffer: Buffer;
  size: number;
}

/**
 * Validates and stores an upload, then queues indexing. Text is extracted synchronously so problems
 * (scanned, encrypted, corrupt) are reported in the upload response rather than later.
 */
export async function createDocument(userId: string, file: UploadedFile): Promise<Document> {
  // The browser-provided MIME type is just a claim; check the file signature too.
  if (!looksLikePdf(file.buffer)) throw new HttpError(415, 'This file is not a valid PDF', 'UNSUPPORTED_TYPE');

  const count = await prisma.document.count({ where: { userId } });
  if (count >= MAX_DOCUMENTS_PER_USER) {
    throw new HttpError(
      409,
      `You can keep up to ${MAX_DOCUMENTS_PER_USER} documents. Delete one to upload another.`,
      'DOCUMENT_LIMIT'
    );
  }

  const extracted = await extractPages(file.buffer);
  if (!hasExtractableText(extracted)) {
    throw new HttpError(
      422,
      'No text found in this PDF. It looks like a scanned document; text recognition (OCR) is not supported yet.',
      'NO_TEXT'
    );
  }

  const id = randomUUID();
  const storageKey = `${userId}/${id}.pdf`;
  await storage.put(storageKey, file.buffer, 'application/pdf');

  const doc = await prisma.document.create({
    data: {
      id,
      userId,
      name: safeFileName(file.originalName),
      storageKey,
      sizeBytes: file.size,
      pageCount: extracted.pageCount
    }
  });
  enqueueIngestion(doc.id, extracted.pages);
  return doc;
}

/**
 * The name is only ever displayed and sent back in Content-Disposition (the storage key is our own UUID),
 * but strip anything that could confuse a terminal, log or download dialog: control and bidi-override
 * characters (which can make "exe.pdf" look like "fdp.exe"), path separators, and silly lengths.
 */
export function safeFileName(name: string): string {
  const cleaned = name
    .normalize('NFC')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '')
    .replace(/[/\\]/g, '_')
    .trim()
    .slice(0, 200);
  return cleaned || 'document.pdf';
}

export async function readDocumentFile(userId: string, id: string) {
  const doc = await getOwnedDocument(userId, id);
  return { doc, data: await storage.get(doc.storageKey) };
}

export async function deleteDocument(userId: string, id: string) {
  const doc = await getOwnedDocument(userId, id);
  await prisma.$transaction([
    // The document's own chat goes with it.
    prisma.chat.deleteMany({ where: { isDocumentChat: true, documents: { some: { id: doc.id } } } }),
    prisma.document.delete({ where: { id: doc.id } }), // chunks cascade
    // Multi-document chats with no documents left are useless.
    prisma.chat.deleteMany({ where: { userId, documents: { none: {} } } })
  ]);
  await storage.delete(doc.storageKey).catch((err) => console.error('Failed to delete stored file', err));
}
