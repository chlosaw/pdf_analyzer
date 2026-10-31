import type { RetrievedChunk } from '../embeddings/embeddings.service';

export const SYSTEM_PROMPT = `You answer questions about the user's PDF documents.

Rules:
- Use ONLY the numbered sources provided with the question. Do not use outside knowledge.
- Cite the source for every claim with its number in square brackets, e.g. [1] or [2][4]. Put the citation right after the claim.
- If the sources don't contain the answer, say you couldn't find it in the documents. Never invent facts, numbers or page references.
- If sources disagree, say so and cite both.
- Be concise. Use short paragraphs or markdown bullet lists.`;

export function buildPrompt(question: string, chunks: RetrievedChunk[]): string {
  const sources = chunks
    .map((c, i) => `[${i + 1}] (${c.documentName}, page ${c.page})\n${c.content}`)
    .join('\n\n---\n\n');
  return `Sources:\n\n${sources}\n\n---\n\nQuestion: ${question}`;
}
