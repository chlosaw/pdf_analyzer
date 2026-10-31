import { describe, expect, it } from 'vitest';
import { chunkPages, normalizeText } from '../src/modules/embeddings/chunk';

const sentence = (n: number) => `This is sentence number ${n} of the test page. `;

describe('chunkPages', () => {
  it('keeps short pages as one chunk and never mixes pages', () => {
    const chunks = chunkPages([
      { page: 1, text: 'Hello world.' },
      { page: 2, text: '' },
      { page: 3, text: 'Third page.' }
    ]);
    expect(chunks).toEqual([
      { page: 1, chunkIndex: 0, content: 'Hello world.' },
      { page: 3, chunkIndex: 1, content: 'Third page.' }
    ]);
  });

  it('splits long pages at sentence boundaries with overlap', () => {
    const text = Array.from({ length: 60 }, (_, i) => sentence(i)).join('');
    const chunks = chunkPages([{ page: 7, text }], { size: 500, overlap: 100 });

    expect(chunks.length).toBeGreaterThan(4);
    for (const c of chunks) {
      expect(c.page).toBe(7);
      expect(c.content.length).toBeLessThanOrEqual(500);
    }
    // Every chunk except the last ends on a full sentence.
    for (const c of chunks.slice(0, -1)) expect(c.content.endsWith('.')).toBe(true);
    // Neighbouring chunks share text.
    const tail = chunks[0].content.slice(-40);
    expect(chunks[1].content).toContain(tail.slice(tail.indexOf(' ') + 1));
    // Nothing is lost: the last sentence is in the last chunk.
    expect(chunks.at(-1)!.content).toContain('sentence number 59');
  });

  it('falls back to splitting on spaces when there is no punctuation', () => {
    const text = Array.from({ length: 400 }, (_, i) => `word${i}`).join(' ');
    const chunks = chunkPages([{ page: 1, text }], { size: 300, overlap: 50 });
    for (const c of chunks) expect(c.content).toMatch(/^word\d+.*word\d+$/);
  });

  it('rejects overlap >= size', () => {
    expect(() => chunkPages([], { size: 100, overlap: 100 })).toThrow();
  });
});

describe('normalizeText', () => {
  it('collapses whitespace and re-joins hyphenated words', () => {
    expect(normalizeText('  multi-\nline   text\n\n\n\nnext\u0000 ')).toBe('multiline text\n\nnext');
  });
});
