import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/db';
import type { TextChunk } from './chunk';
import { ai } from './providers';
import { toVectorLiteral } from './vector';

const INSERT_BATCH = 50;

export interface RetrievedChunk {
  id: string;
  documentId: string;
  documentName: string;
  page: number;
  content: string;
  score: number; // cosine similarity, 1 = identical
}

/** Embeds chunks and stores them with their vectors. Prisma has no vector type, so this is raw SQL. */
export async function embedAndStoreChunks(
  documentId: string,
  chunks: TextChunk[],
  tx: Prisma.TransactionClient = prisma
): Promise<void> {
  const embeddings = await ai.embed(
    chunks.map((c) => c.content),
    'RETRIEVAL_DOCUMENT'
  );

  for (let i = 0; i < chunks.length; i += INSERT_BATCH) {
    const rows = chunks
      .slice(i, i + INSERT_BATCH)
      .map(
        (c, j) =>
          Prisma.sql`(${randomUUID()}, ${documentId}, ${c.page}, ${c.chunkIndex}, ${c.content}, ${toVectorLiteral(embeddings[i + j])}::vector)`
      );
    await tx.$executeRaw`
      INSERT INTO "Chunk" (id, "documentId", page, "chunkIndex", content, embedding)
      VALUES ${Prisma.join(rows)}
    `;
  }
}

/**
 * Embeds the question and returns the k most similar chunks from the given documents.
 *
 * `<=>` is pgvector's cosine-distance operator. Filtering by documentId first (B-tree index)
 * and then ranking exactly is correct and fast for a user's handful of PDFs. An HNSW index
 * would only pay off at millions of rows, and combined with a WHERE filter it can return
 * fewer than k rows.
 */
export async function searchSimilarChunks(question: string, documentIds: string[], k = 6): Promise<RetrievedChunk[]> {
  if (documentIds.length === 0) return [];
  const [queryVector] = await ai.embed([question], 'RETRIEVAL_QUERY');
  const vector = toVectorLiteral(queryVector);

  const rows = await prisma.$queryRaw<RetrievedChunk[]>`
    SELECT c.id, c."documentId", d.name AS "documentName", c.page, c.content,
           1 - (c.embedding <=> ${vector}::vector) AS score
    FROM "Chunk" c
    JOIN "Document" d ON d.id = c."documentId"
    WHERE c."documentId" = ANY(${documentIds}::text[]) AND c.embedding IS NOT NULL
    ORDER BY c.embedding <=> ${vector}::vector
    LIMIT ${k}
  `;
  return rows.map((r) => ({ ...r, score: Number(r.score) }));
}
