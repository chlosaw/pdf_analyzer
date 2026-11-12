import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { MAX_PAGES } from '@pdf-analyzer/shared';
import { HttpError } from '../../lib/errors';
import { normalizeText, type PageText } from '../embeddings/chunk';

export interface ExtractedPdf {
  pageCount: number;
  pages: PageText[];
}

/** Below this many characters per page on average we treat the PDF as scanned images. */
const MIN_CHARS_PER_PAGE = 25;

export const looksLikePdf = (buf: Buffer) => buf.subarray(0, 1024).includes('%PDF-');

export async function extractPages(buffer: Buffer): Promise<ExtractedPdf> {
  // pdf.js wants a plain Uint8Array (not a Buffer) and may detach it, so pass a copy.
  const task = getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
    verbosity: 0
  });

  let pdf;
  try {
    pdf = await task.promise;
  } catch (err) {
    if ((err as Error).name === 'PasswordException') {
      throw new HttpError(422, 'This PDF is password-protected. Remove the password and try again.', 'PDF_ENCRYPTED');
    }
    throw new HttpError(422, 'This file could not be read as a PDF. It may be corrupted.', 'PDF_INVALID');
  }

  try {
    if (pdf.numPages > MAX_PAGES) {
      throw new HttpError(422, `This PDF has ${pdf.numPages} pages. The limit is ${MAX_PAGES}.`, 'TOO_MANY_PAGES');
    }
    const pages: PageText[] = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      const text = content.items.map((item) => ('str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : '')).join('');
      pages.push({ page: n, text: normalizeText(text) });
      page.cleanup();
    }
    return { pageCount: pdf.numPages, pages };
  } finally {
    await pdf.destroy();
  }
}

/** A PDF made of scanned images has pages but (almost) no extractable text. */
export function hasExtractableText({ pageCount, pages }: ExtractedPdf): boolean {
  const chars = pages.reduce((sum, p) => sum + p.text.replace(/\s/g, '').length, 0);
  return chars > 0 && chars / Math.max(pageCount, 1) >= MIN_CHARS_PER_PAGE;
}
