import { FileText } from 'lucide-react';
import { memo, useMemo } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CITATION_GROUP_RE, parseCitationGroup, type Citation } from '@pdf-analyzer/shared';
import { cn } from '@/lib/utils';

const CITE_PREFIX = '#cite-';

/**
 * Renders a markdown answer, turning "[2]" markers into buttons that jump to the cited page.
 * Markers are rewritten to markdown links first so they survive markdown parsing.
 */
export const AnswerContent = memo(function AnswerContent({
  content,
  citations,
  onCite
}: {
  content: string;
  citations: Citation[];
  onCite: (c: Citation) => void;
}) {
  const byIndex = useMemo(() => new Map(citations.map((c) => [c.index, c])), [citations]);

  const markdown = useMemo(
    () =>
      // "[1, 3]" or "[2-4]" become one chip per source; groups citing no known source stay as text.
      content.replace(CITATION_GROUP_RE, (match, inner: string) => {
        const known = parseCitationGroup(inner).filter((n) => byIndex.has(n));
        return known.length ? known.map((n) => `[${n}](${CITE_PREFIX}${n})`).join('') : match;
      }),
    [content, byIndex]
  );

  const components = useMemo<Components>(
    () => ({
      a({ href, children }) {
        if (href?.startsWith(CITE_PREFIX)) {
          const c = byIndex.get(Number(href.slice(CITE_PREFIX.length)));
          if (c) return <CitationChip citation={c} onClick={() => onCite(c)} />;
        }
        // Answers can echo text from an uploaded PDF, which may be hostile (prompt injection).
        // Only plain web links, shown with their real destination on hover.
        if (!href || !/^https?:\/\//i.test(href)) return <>{children}</>;
        return (
          <a
            href={href}
            title={href}
            target="_blank"
            rel="noreferrer noopener nofollow"
            className="underline underline-offset-2"
          >
            {children}
          </a>
        );
      },
      // Never load images the model wrote: their URL could smuggle chat contents out to another server.
      img({ alt }) {
        return alt ? <>{alt}</> : null;
      }
    }),
    [byIndex, onCite]
  );

  return (
    <div className="prose-answer text-sm">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {markdown}
      </ReactMarkdown>
    </div>
  );
});

function CitationChip({ citation, onClick }: { citation: Citation; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${citation.documentName}, page ${citation.page}`}
      className="mx-0.5 inline-flex h-5 -translate-y-px items-center rounded bg-primary/10 px-1.5 align-middle text-[11px] font-semibold tabular-nums text-foreground hover:bg-primary hover:text-primary-foreground"
    >
      p.{citation.page}
    </button>
  );
}

/** The pages an answer drew on, one chip per page (several sources often come from the same page). */
export function SourceList({
  citations,
  onCite,
  showDocument
}: {
  citations: Citation[];
  onCite: (c: Citation) => void;
  showDocument: boolean;
}) {
  const pages = new Map<string, Citation>();
  for (const c of [...citations].sort((a, b) => a.documentName.localeCompare(b.documentName) || a.page - b.page)) {
    const key = `${c.documentId}:${c.page}`;
    if (!pages.has(key)) pages.set(key, c);
  }
  if (pages.size === 0) return null;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-muted-foreground">Sources</span>
      {[...pages.values()].map((c) => (
        <button
          key={`${c.documentId}:${c.page}`}
          type="button"
          onClick={() => onCite(c)}
          title={c.snippet}
          className={cn(
            'inline-flex max-w-full items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-xs',
            'hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
          )}
        >
          <FileText className="size-3 shrink-0 text-muted-foreground" />
          <span className="truncate">
            {showDocument && <>{c.documentName.replace(/\.pdf$/i, '')} · </>}
            Page {c.page}
          </span>
        </button>
      ))}
    </div>
  );
}
