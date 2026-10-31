export interface PageText {
  page: number; // 1-based
  text: string;
}

export interface TextChunk {
  page: number;
  chunkIndex: number;
  content: string;
}

export interface ChunkOptions {
  /** Target chunk length in characters (~250 tokens at 1000) */
  size?: number;
  /** Characters repeated between neighbouring chunks so a sentence cut at a boundary still appears whole in one chunk */
  overlap?: number;
}

export function normalizeText(text: string): string {
  return text
    .replaceAll('\0', '') // Postgres text can't store NUL
    .replace(/-\n(?=[a-z])/g, '') // re-join words hyphenated across lines
    .replace(/[ \t\f\v\u00a0]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Splits each page into overlapping chunks. Chunks never span two pages, so every
 * chunk maps to exactly one page number — that is what makes citations precise.
 * We try to cut at a paragraph/sentence end, then at a space, and only mid-word as a last resort.
 */
export function chunkPages(pages: PageText[], { size = 1000, overlap = 150 }: ChunkOptions = {}): TextChunk[] {
  if (overlap >= size) throw new Error('overlap must be smaller than size');
  const chunks: TextChunk[] = [];
  let chunkIndex = 0;

  for (const { page, text } of pages) {
    const clean = normalizeText(text);
    let start = 0;

    while (start < clean.length) {
      let end = Math.min(start + size, clean.length);

      if (end < clean.length) {
        // Look for a natural break in the last 40% of the window.
        const searchFrom = start + Math.floor(size * 0.6);
        const window = clean.slice(searchFrom, end);
        const breakAt = Math.max(
          window.lastIndexOf('\n'),
          window.lastIndexOf('. '),
          window.lastIndexOf('? '),
          window.lastIndexOf('! ')
        );
        if (breakAt !== -1) end = searchFrom + breakAt + 1;
        else {
          const space = window.lastIndexOf(' ');
          if (space !== -1) end = searchFrom + space;
        }
      }

      const content = clean.slice(start, end).trim();
      if (content) chunks.push({ page, chunkIndex: chunkIndex++, content });
      if (end >= clean.length) break;

      // Step back by `overlap`, then forward to the next word start.
      let next = Math.max(end - overlap, start + 1);
      const space = clean.indexOf(' ', next);
      if (space !== -1 && space < end) next = space + 1;
      start = next;
    }
  }

  return chunks;
}
