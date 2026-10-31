import { FileText } from 'lucide-react';
import { memo, useMemo } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Citation } from '@pdf-analyzer/shared';
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
      content.replace(/\[(\d{1,2})\](?!\()/g, (m, n) => (byIndex.has(Number(n)) ? `[${n}](${CITE_PREFIX}${n})` : m)),
    [content, byIndex]
  );

  const components = useMemo<Components>(
    () => ({
      a({ href, children }) {
        if (href?.startsWith(CITE_PREFIX)) {
          const c = byIndex.get(Number(href.slice(CITE_PREFIX.length)));
          if (c) return <CitationChip citation={c} onClick={() => onCite(c)} />;
        }
        return (
          <a href={href} target="_blank" rel="noreferrer noopener" className="underline underline-offset-2">
            {children}
          </a>
        );
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

/** The list of sources under an answer. */
export function SourceList({
  citations,
  onCite,
  showDocument
}: {
  citations: Citation[];
  onCite: (c: Citation) => void;
  showDocument: boolean;
}) {
  if (citations.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {citations.map((c) => (
        <button
          key={c.index}
          type="button"
          onClick={() => onCite(c)}
          title={c.snippet}
          className={cn(
            'inline-flex max-w-full items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-xs',
            'hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
          )}
        >
          <span className="font-semibold tabular-nums text-muted-foreground">[{c.index}]</span>
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
