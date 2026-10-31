import { prisma } from '../lib/db';
import { isTest } from '../lib/env';
import { chunkPages, type PageText } from '../modules/embeddings/chunk';
import { embedAndStoreChunks } from '../modules/embeddings/embeddings.service';

/**
 * Indexing half of the RAG pipeline: chunk -> embed -> store in pgvector, then mark the document READY.
 * Never throws; failures are recorded on the document so the UI can show them.
 */
export async function ingestDocument(documentId: string, pages: PageText[]): Promise<void> {
  try {
    const chunks = chunkPages(pages);
    await prisma.$transaction(
      async (tx) => {
        await embedAndStoreChunks(documentId, chunks, tx);
        await tx.document.update({ where: { id: documentId }, data: { status: 'READY', error: null } });
      },
      { timeout: 120_000 } // embedding a long PDF on the free tier can take a while
    );
  } catch (err) {
    if (!isTest) console.error(`Ingestion failed for document ${documentId}:`, err);
    // The document may have been deleted meanwhile; ignore that case.
    await prisma.document
      .update({
        where: { id: documentId },
        data: { status: 'FAILED', error: 'We could not index this document. Please try uploading it again.' }
      })
      .catch(() => undefined);
  }
}

/** Runs ingestion in the background so the upload request can return immediately; the client polls the status. */
export function enqueueIngestion(documentId: string, pages: PageText[]) {
  void ingestDocument(documentId, pages);
}

/** In-process jobs die with the process. On boot, mark anything left half-done as failed. */
export async function failInterruptedIngestions() {
  const { count } = await prisma.document.updateMany({
    where: { status: 'PROCESSING' },
    data: { status: 'FAILED', error: 'Processing was interrupted. Please upload the document again.' }
  });
  if (count) console.warn(`Marked ${count} interrupted document(s) as failed`);
}
