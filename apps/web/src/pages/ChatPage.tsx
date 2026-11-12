import { ArrowLeft, Loader2 } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Citation } from '@pdf-analyzer/shared';
import { ChatPanel } from '@/features/chat/ChatPanel';
import { PdfViewer, type ViewerTarget } from '@/features/viewer/PdfViewer';
import { Button } from '@/components/ui/button';
import { useChat } from '@/api/queries';
import { cn } from '@/lib/utils';

type Tab = 'document' | 'chat';

export function ChatPage() {
  const { id = '' } = useParams();
  const chat = useChat(id);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [target, setTarget] = useState<ViewerTarget>({ page: 1 });
  const [tab, setTab] = useState<Tab>('chat'); // small screens show one pane at a time

  const onCite = useCallback((c: Citation) => {
    setActiveDocId(c.documentId);
    setTarget({ page: c.page, highlight: c.snippet, nonce: Date.now() });
    setTab('document');
  }, []);

  if (chat.isPending) {
    return (
      <div className="grid h-full place-items-center text-muted-foreground">
        <Loader2 className="size-6 animate-spin" />
      </div>
    );
  }
  if (chat.isError) {
    return (
      <div className="grid h-full place-items-center p-4 text-center">
        <div className="space-y-2">
          <p className="text-sm text-destructive">{chat.error.message}</p>
          <Link to="/" className="text-sm underline">
            Back to documents
          </Link>
        </div>
      </div>
    );
  }

  const docs = chat.data.documents;
  const activeDoc = docs.find((d) => d.id === activeDocId) ?? docs[0];

  return (
    <div className="flex h-full flex-col">
      {/* One toolbar on every screen size: a clear way back, what's open, and (on narrow screens) the pane switch */}
      <div className="flex h-12 shrink-0 items-center gap-2 border-b px-2">
        <Button asChild variant="ghost" size="sm" className="shrink-0">
          <Link to="/">
            <ArrowLeft /> Documents
          </Link>
        </Button>
        <span aria-hidden className="h-5 w-px shrink-0 bg-border" />
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {docs.length === 1 ? (
            <span className="truncate font-serif text-sm font-medium" title={docs[0].name}>
              {docs[0].name}
            </span>
          ) : (
            docs.map((d) => (
              <Button
                key={d.id}
                variant={d.id === activeDoc?.id ? 'secondary' : 'ghost'}
                size="sm"
                className="max-w-56 shrink-0"
                onClick={() => {
                  setActiveDocId(d.id);
                  setTarget({ page: 1 });
                  setTab('document');
                }}
              >
                <span className="truncate">{d.name}</span>
                {d.status === 'PROCESSING' && <Loader2 className="animate-spin" />}
              </Button>
            ))
          )}
        </div>
        <div className="flex shrink-0 rounded-lg bg-muted p-0.5 md:hidden" role="tablist" aria-label="Show">
          {(['document', 'chat'] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={cn(
                'rounded-md px-3 py-1 text-xs font-medium capitalize text-muted-foreground transition-colors',
                tab === t && 'bg-background text-foreground shadow-sm'
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="grid min-h-0 flex-1 md:grid-cols-[minmax(0,1fr)_minmax(340px,44%)]">
        <section className={cn('min-h-0 flex-col border-r', tab === 'document' ? 'flex' : 'hidden md:flex')}>
          {activeDoc ? (
            <div className="min-h-0 flex-1">
              <PdfViewer
                key={activeDoc.id}
                documentId={activeDoc.id}
                target={target}
                onPageChange={(page) => setTarget({ page })}
              />
            </div>
          ) : (
            <p className="p-6 text-sm text-muted-foreground">This chat has no documents left.</p>
          )}
        </section>

        <section className={cn('min-h-0', tab === 'chat' ? 'block' : 'hidden md:block')}>
          <ChatPanel chat={chat.data} onCite={onCite} />
        </section>
      </div>
    </div>
  );
}
