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
      {/* Mobile pane switcher */}
      <div className="flex shrink-0 gap-1 border-b p-1 lg:hidden">
        {(['document', 'chat'] as const).map((t) => (
          <Button
            key={t}
            variant={tab === t ? 'secondary' : 'ghost'}
            size="sm"
            className="flex-1 capitalize"
            onClick={() => setTab(t)}
          >
            {t}
          </Button>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(380px,42%)]">
        <section className={cn('min-h-0 flex-col border-r', tab === 'document' ? 'flex' : 'hidden lg:flex')}>
          <div className="flex h-11 shrink-0 items-center gap-1 overflow-x-auto border-b px-2">
            <Button asChild variant="ghost" size="icon" aria-label="Back to documents">
              <Link to="/">
                <ArrowLeft />
              </Link>
            </Button>
            {docs.map((d) => (
              <Button
                key={d.id}
                variant={d.id === activeDoc?.id ? 'secondary' : 'ghost'}
                size="sm"
                className="max-w-56 shrink-0"
                onClick={() => {
                  setActiveDocId(d.id);
                  setTarget({ page: 1 });
                }}
              >
                <span className="truncate">{d.name}</span>
                {d.status === 'PROCESSING' && <Loader2 className="animate-spin" />}
              </Button>
            ))}
          </div>
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

        <section className={cn('min-h-0', tab === 'chat' ? 'block' : 'hidden lg:block')}>
          <ChatPanel chat={chat.data} onCite={onCite} />
        </section>
      </div>
    </div>
  );
}
