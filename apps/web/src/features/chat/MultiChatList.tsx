import { Layers, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useChats, useDeleteChat, useRenameChat } from '@/api/queries';
import { InlineRename } from '@/components/InlineRename';
import { Pagination } from '@/components/Pagination';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn, formatDate } from '@/lib/utils';

const PAGE_SIZE = 10;

/** Saved chats that span several documents. Single-document chats are reached through their document. */
export function MultiChatList() {
  const [page, setPage] = useState(1);
  const [renaming, setRenaming] = useState<string | null>(null);
  const chats = useChats({ kind: 'multi', page, pageSize: PAGE_SIZE });
  const deleteChat = useDeleteChat();
  const renameChat = useRenameChat();

  // Optional section: it stays out of the way until there is something to show.
  if (chats.isPending || chats.isError || chats.data.total === 0) return null;
  const { items, totalPages } = chats.data;
  // Deleting the last chat on the last page: step back instead of showing an empty page.
  if (page > totalPages) setPage(totalPages);

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold tracking-tight">Multi-document chats</h2>
      <ul className={cn('space-y-2', chats.isPlaceholderData && 'opacity-60')} aria-label="Multi-document chats">
        {items.map((chat) => (
          <li key={chat.id}>
            <Card className="flex items-center gap-3 p-3">
              <Layers className="size-6 shrink-0 text-muted-foreground" strokeWidth={1.5} />
              <div className="min-w-0 flex-1">
                {renaming === chat.id ? (
                  <InlineRename
                    value={chat.title}
                    label={`New name for chat ${chat.title}`}
                    onSave={(name) =>
                      renameChat.mutate(
                        { id: chat.id, name },
                        { onError: (err) => toast.error(`Couldn't rename: ${err.message}`) }
                      )
                    }
                    onDone={() => setRenaming(null)}
                  />
                ) : (
                  <Link to={`/chats/${chat.id}`} className="block truncate font-medium hover:underline">
                    {chat.title}
                  </Link>
                )}
                <p className="text-xs text-muted-foreground">
                  {chat.documents.length} documents · updated {formatDate(chat.updatedAt)}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Rename chat ${chat.title}`}
                onClick={() => setRenaming(chat.id)}
              >
                <Pencil />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Delete chat ${chat.title}`}
                onClick={() =>
                  confirm('Delete this chat?') &&
                  deleteChat.mutate(chat.id, { onError: (err) => toast.error(`Couldn't delete: ${err.message}`) })
                }
              >
                <Trash2 />
              </Button>
            </Card>
          </li>
        ))}
      </ul>
      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} label="Chats" />
    </section>
  );
}
