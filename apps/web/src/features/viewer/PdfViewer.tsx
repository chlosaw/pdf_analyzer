import { ChevronLeft, ChevronRight, Loader2, ZoomIn, ZoomOut } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

// PDFs are untrusted input: never let pdf.js compile code from one (font programs), and keep the strict CSP happy.
const PDF_OPTIONS = { isEvalSupported: false };

export interface ViewerTarget {
  page: number;
  /** Text to highlight on the page (the cited chunk) */
  highlight?: string;
  /** Changes on every citation click so clicking the same one again still flashes */
  nonce?: number;
}

const squash = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function PdfViewer({
  documentId,
  target,
  onPageChange
}: {
  documentId: string;
  target: ViewerTarget;
  onPageChange: (page: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [numPages, setNumPages] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [pageInput, setPageInput] = useState(String(target.page));
  const page = Math.min(Math.max(target.page, 1), numPages || target.page);

  // Keep the page box in sync when the page changes from outside (citation click, arrows).
  const [shownPage, setShownPage] = useState(page);
  if (shownPage !== page) {
    setShownPage(page);
    setPageInput(String(page));
  }

  // Fit the page to the panel width.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(entry.contentRect.width - 32, 200)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    containerRef.current?.scrollTo({ top: 0 });
  }, [page, target.nonce]);

  const file = `/api/documents/${documentId}/file`;
  const highlight = useMemo(() => (target.highlight ? squash(target.highlight) : ''), [target.highlight]);

  // Wrap text-layer items that appear in the cited chunk in <mark>.
  const textRenderer = useCallback(
    ({ str }: { str: string }) => {
      const s = squash(str);
      return highlight && s.length > 3 && highlight.includes(s) ? `<mark>${escapeHtml(str)}</mark>` : escapeHtml(str);
    },
    [highlight]
  );

  const go = (p: number) => numPages && onPageChange(Math.min(Math.max(p, 1), numPages));

  return (
    <div className="flex h-full min-h-0 flex-col bg-muted/40">
      <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b bg-background px-2">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Previous page"
            disabled={page <= 1}
            onClick={() => go(page - 1)}
          >
            <ChevronLeft />
          </Button>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              go(Number(pageInput) || page);
            }}
            className="flex items-center gap-1 text-sm"
          >
            <input
              aria-label="Page number"
              data-testid="page-number"
              className="h-7 w-12 rounded border bg-background text-center tabular-nums"
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value.replace(/\D/g, ''))}
              onBlur={() => setPageInput(String(page))}
            />
            <span className="text-muted-foreground">/ {numPages || '–'}</span>
          </form>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Next page"
            disabled={!numPages || page >= numPages}
            onClick={() => go(page + 1)}
          >
            <ChevronRight />
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Zoom out"
            disabled={zoom <= 0.5}
            onClick={() => setZoom((z) => z - 0.25)}
          >
            <ZoomOut />
          </Button>
          <span className="w-10 text-center text-xs tabular-nums text-muted-foreground">{Math.round(zoom * 100)}%</span>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Zoom in"
            disabled={zoom >= 3}
            onClick={() => setZoom((z) => z + 0.25)}
          >
            <ZoomIn />
          </Button>
        </div>
      </div>

      {/* Focusable so keyboard users can scroll the page with the arrow keys */}
      <div
        ref={containerRef}
        tabIndex={0}
        role="region"
        aria-label={`PDF page ${page}`}
        className="min-h-0 flex-1 overflow-auto p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <Document
          file={file}
          options={PDF_OPTIONS}
          onLoadSuccess={({ numPages }) => setNumPages(numPages)}
          loading={<Spinner />}
          error={<p className="p-6 text-center text-sm text-destructive">Couldn't load this PDF.</p>}
        >
          <div
            key={`${page}-${target.nonce ?? 0}`}
            className={cn('mx-auto w-fit bg-white shadow-md', target.nonce && 'animate-flash')}
          >
            <Page
              pageNumber={page}
              width={width * zoom}
              customTextRenderer={textRenderer}
              loading={<div style={{ width: width * zoom, height: width * zoom * 1.3 }} />}
            />
          </div>
        </Document>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <div className="grid h-64 place-items-center text-muted-foreground">
      <Loader2 className="size-6 animate-spin" />
    </div>
  );
}
