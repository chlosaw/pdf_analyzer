import { AlertCircle, CheckCircle2, FileText, Loader2, MessagesSquare, Pencil, Search, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import type { DocumentDTO, DocumentListQuery } from '@pdf-analyzer/shared';
import { useDeleteDocument, useDocuments, useRenameDocument } from '@/api/queries';
import { InlineRename } from '@/components/InlineRename';
import { Pagination } from '@/components/Pagination';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useDebouncedValue } from '@/lib/hooks';
import { cn, formatBytes, formatDate } from '@/lib/utils';

const PAGE_SIZE = 10;
type Status = NonNullable<DocumentListQuery['status']>;
type Sort = NonNullable<DocumentListQuery['sort']>;

const selectClass =
  'h-9 rounded-md border border-input bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

function StatusBadge({ doc, compact = false }: { doc: DocumentDTO; compact?: boolean }) {
  if (compact) {
    // A plain word in the details line, coloured like the badge
    const [label, color] =
      doc.status === 'READY'
        ? ['Ready', 'text-emerald-700 dark:text-emerald-400']
        : doc.status === 'FAILED'
          ? ['Failed', 'text-destructive']
          : ['Indexing…', 'text-foreground'];
    return <span className={cn('font-medium', color)}>{label} ·</span>;
  }
  if (doc.status === 'PROCESSING')
    return (
      <Badge variant="secondary">
        <Loader2 className="animate-spin" /> Indexing
      </Badge>
    );
  if (doc.status === 'FAILED')
    return (
      <Badge variant="destructive" title={doc.error ?? undefined}>
        <AlertCircle /> Failed
      </Badge>
    );
  return (
    <Badge variant="success">
      <CheckCircle2 /> Ready
    </Badge>
  );
}

/** The user's documents: searchable (debounced), filterable, sortable and paged, with checkboxes for picking
 * several for a multi-document chat. Rename and delete update the list at once (optimistically). */
export function DocumentList({
  selected,
  onToggle,
  onDeleted
}: {
  selected: Set<string>;
  onToggle: (id: string) => void;
  onDeleted: (id: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<Status | ''>('');
  const [sort, setSort] = useState<Sort>('newest');
  const [page, setPage] = useState(1);
  const [renaming, setRenaming] = useState<string | null>(null);
  const q = useDebouncedValue(search.trim(), 300);

  const documents = useDocuments({ q, status: status || undefined, sort, page, pageSize: PAGE_SIZE });
  const deleteDoc = useDeleteDocument();
  const renameDoc = useRenameDocument();
  const filtering = Boolean(q || status);

  function rename(doc: DocumentDTO, name: string) {
    renameDoc.mutate({ id: doc.id, name }, { onError: (err) => toast.error(`Couldn't rename: ${err.message}`) });
  }

  function remove(doc: DocumentDTO) {
    if (!confirm(`Delete "${doc.name}" and its chat history?`)) return;
    onDeleted(doc.id);
    deleteDoc.mutate(doc.id, {
      onSuccess: () => toast.success('Document deleted'),
      onError: (err) => toast.error(`Couldn't delete: ${err.message}`)
    });
  }

  const toolbar = (
    <div className="flex flex-col gap-2 sm:flex-row" role="search">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          aria-label="Search documents by name"
          placeholder="Search documents"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="bg-background pl-8"
        />
      </div>
      <div className="flex gap-2">
        <select
          aria-label="Filter by status"
          className={cn(selectClass, 'flex-1')}
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as Status | '');
            setPage(1);
          }}
        >
          <option value="">All statuses</option>
          <option value="READY">Ready</option>
          <option value="PROCESSING">Indexing</option>
          <option value="FAILED">Failed</option>
        </select>
        <select
          aria-label="Sort documents"
          className={cn(selectClass, 'flex-1')}
          value={sort}
          onChange={(e) => {
            setSort(e.target.value as Sort);
            setPage(1);
          }}
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="name">Name A–Z</option>
          <option value="size">Largest first</option>
        </select>
      </div>
    </div>
  );

  if (documents.isPending) {
    return (
      <div className="space-y-2" aria-busy="true" aria-label="Loading documents">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    );
  }
  if (documents.isError) {
    return (
      <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-destructive/40 p-3">
        <p className="text-sm text-destructive">Couldn't load documents: {documents.error.message}</p>
        <Button variant="outline" size="sm" onClick={() => documents.refetch()}>
          Try again
        </Button>
      </div>
    );
  }
  const { items, total, totalPages } = documents.data;
  // Deleting the last document on the last page: step back instead of showing an empty page.
  if (page > totalPages) setPage(totalPages);
  if (total === 0 && !filtering) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">No documents yet. Upload your first PDF above.</p>
    );
  }

  return (
    <div className="space-y-3">
      {toolbar}
      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No documents match{q && <> “{q}”</>}.{' '}
          <button
            type="button"
            className="underline underline-offset-2"
            onClick={() => {
              setSearch('');
              setStatus('');
              setPage(1);
            }}
          >
            Clear filters
          </button>
        </p>
      ) : (
        <ul className={cn('space-y-2', documents.isPlaceholderData && 'opacity-60')} aria-label="Documents">
          {items.map((doc) => {
            const ready = doc.status === 'READY';
            return (
              <li key={doc.id}>
                <Card className={cn('flex items-center gap-3 p-3', selected.has(doc.id) && 'ring-1 ring-ring')}>
                  <input
                    type="checkbox"
                    aria-label={`Select ${doc.name}`}
                    className="size-4 accent-primary disabled:opacity-30"
                    disabled={!ready}
                    checked={selected.has(doc.id)}
                    onChange={() => onToggle(doc.id)}
                  />
                  <FileText className="size-8 shrink-0 text-muted-foreground" strokeWidth={1.5} />
                  <div className="min-w-0 flex-1">
                    {renaming === doc.id ? (
                      <InlineRename
                        value={doc.name}
                        label={`New name for ${doc.name}`}
                        onSave={(name) => rename(doc, name)}
                        onDone={() => setRenaming(null)}
                      />
                    ) : ready ? (
                      <Link to={`/documents/${doc.id}`} className="block truncate font-medium hover:underline">
                        {doc.name}
                      </Link>
                    ) : (
                      <span className="block truncate font-medium">{doc.name}</span>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {/* On phones the badge would squeeze the name, so the status moves in here */}
                      <span className="sm:hidden">
                        <StatusBadge doc={doc} compact />{' '}
                      </span>
                      {doc.pageCount} {doc.pageCount === 1 ? 'page' : 'pages'} · {formatBytes(doc.sizeBytes)} ·{' '}
                      {formatDate(doc.createdAt)}
                      {doc.status === 'FAILED' && doc.error && <span className="text-destructive"> · {doc.error}</span>}
                    </p>
                  </div>
                  <span className="hidden sm:contents">
                    <StatusBadge doc={doc} />
                  </span>
                  {ready && (
                    <Button asChild variant="outline" size="sm" className="hidden sm:inline-flex">
                      <Link to={`/documents/${doc.id}`}>
                        <MessagesSquare /> Chat
                      </Link>
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Rename ${doc.name}`}
                    onClick={() => setRenaming(doc.id)}
                  >
                    <Pencil />
                  </Button>
                  <Button variant="ghost" size="icon" aria-label={`Delete ${doc.name}`} onClick={() => remove(doc)}>
                    <Trash2 />
                  </Button>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} label="Documents" />
    </div>
  );
}
