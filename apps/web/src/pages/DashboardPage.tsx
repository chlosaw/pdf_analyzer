import { Layers, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { MAX_DOCS_PER_CHAT } from '@pdf-analyzer/shared';
import { useCreateChat } from '@/api/queries';
import { QuestionBackdrop } from '@/components/QuestionBackdrop';
import { Button } from '@/components/ui/button';
import { MultiChatList } from '@/features/chat/MultiChatList';
import { DocumentList } from '@/features/documents/DocumentList';
import { UploadDropzone } from '@/features/documents/UploadDropzone';

export function DashboardPage() {
  const createChat = useCreateChat();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < MAX_DOCS_PER_CHAT) next.add(id);
      else toast.error(`You can select up to ${MAX_DOCS_PER_CHAT} documents`);
      return next;
    });
  }

  function unselect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  async function startMultiChat() {
    try {
      const chat = await createChat.mutateAsync({ documentIds: [...selected] });
      navigate(`/chats/${chat.id}`);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <div className="relative h-full overflow-y-auto">
      <QuestionBackdrop className="fixed top-14" />
      <div className="relative mx-auto max-w-4xl space-y-8 px-4 py-10">
        <section className="space-y-4">
          <div>
            <h1 className="text-4xl font-semibold tracking-tight">Your documents</h1>
            <p className="mt-2 text-muted-foreground">
              Open a document to chat with it, or select several to ask questions across all of them.
            </p>
          </div>
          <UploadDropzone />
        </section>

        <section className="space-y-3">
          {selected.size > 0 && (
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 rounded-lg border bg-background/95 p-3 shadow-sm backdrop-blur">
              <span className="text-sm">
                {selected.size} selected
                {selected.size === 1 && (
                  <span className="text-muted-foreground">: select one more for a multi-document chat</span>
                )}
              </span>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
                  Clear
                </Button>
                <Button size="sm" disabled={selected.size < 2 || createChat.isPending} onClick={startMultiChat}>
                  {createChat.isPending ? <Loader2 className="animate-spin" /> : <Layers />}
                  Ask across {selected.size} documents
                </Button>
              </div>
            </div>
          )}
          <DocumentList selected={selected} onToggle={toggle} onDeleted={unselect} />
        </section>

        <MultiChatList />
      </div>
    </div>
  );
}
