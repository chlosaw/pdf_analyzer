import { AlertCircle, CheckCircle2, FileText, Loader2, MessagesSquare, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import type { DocumentDTO } from '@pdf-analyzer/shared';
import { useDeleteDocument, useDocuments } from '@/api/queries';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn, formatBytes, formatDate } from '@/lib/utils';

function StatusBadge({ doc }: { doc: DocumentDTO }) {
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

/** The user's documents, with checkboxes for picking several for a multi-document chat. */
export function DocumentList({
  selected,
  onToggle,
  onDeleted
}: {
  selected: Set<string>;
  onToggle: (id: string) => void;
  onDeleted: (id: string) => void;
}) {
  const documents = useDocuments();
  const deleteDoc = useDeleteDocument();

  function remove(doc: DocumentDTO) {
    if (!confirm(`Delete "${doc.name}" and its chat history?`)) return;
    onDeleted(doc.id);
    deleteDoc.mutate(doc.id, {
      onSuccess: () => toast.success('Document deleted'),
      onError: (err) => toast.error(err.message)
    });
  }

  if (documents.isPending) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    );
  }
  if (documents.isError) {
    return <p className="text-sm text-destructive">Couldn't load documents: {documents.error.message}</p>;
  }
  if (documents.data.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">No documents yet. Upload your first PDF above.</p>
    );
  }

  return (
    <ul className="space-y-2" aria-label="Documents">
      {documents.data.map((doc) => {
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
                {ready ? (
                  <Link to={`/documents/${doc.id}`} className="block truncate font-medium hover:underline">
                    {doc.name}
                  </Link>
                ) : (
                  <span className="block truncate font-medium">{doc.name}</span>
                )}
                <p className="text-xs text-muted-foreground">
                  {doc.pageCount} {doc.pageCount === 1 ? 'page' : 'pages'} · {formatBytes(doc.sizeBytes)} ·{' '}
                  {formatDate(doc.createdAt)}
                  {doc.status === 'FAILED' && doc.error && <span className="text-destructive"> · {doc.error}</span>}
                </p>
              </div>
              <StatusBadge doc={doc} />
              {ready && (
                <Button asChild variant="outline" size="sm" className="hidden sm:inline-flex">
                  <Link to={`/documents/${doc.id}`}>
                    <MessagesSquare /> Chat
                  </Link>
                </Button>
              )}
              <Button variant="ghost" size="icon" aria-label={`Delete ${doc.name}`} onClick={() => remove(doc)}>
                <Trash2 />
              </Button>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
