/** Must match the vector(768) column in prisma/schema.prisma */
export const EMBEDDING_DIMENSIONS = 768;

export function l2normalize(v: number[]): number[] {
  const norm = Math.hypot(...v);
  return norm === 0 ? v : v.map((x) => x / norm);
}

/** pgvector's text format: '[0.1,0.2,...]' */
export const toVectorLiteral = (v: number[]) => `[${v.join(',')}]`;
