import type { Page } from '@pdf-analyzer/shared';

/** Prisma's skip/take for a 1-based page. */
export const pageArgs = ({ page, pageSize }: { page: number; pageSize: number }) => ({
  skip: (page - 1) * pageSize,
  take: pageSize
});

export function toPage<T>(items: T[], total: number, { page, pageSize }: { page: number; pageSize: number }): Page<T> {
  return { items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

/**
 * Case-insensitive "contains" filter. % and _ are escaped so a search for "100%" means the literal text,
 * not a LIKE wildcard that matches everything.
 */
export const containsText = (q: string) => ({
  contains: q.replace(/[\\%_]/g, (c) => `\\${c}`),
  mode: 'insensitive' as const
});
