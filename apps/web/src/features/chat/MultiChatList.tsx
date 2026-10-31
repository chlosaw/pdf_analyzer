import { Layers, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useChats, useDeleteChat } from '@/api/queries';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatDate } from '@/lib/utils';

/** Saved chats that span several documents. Single-document chats are reached through their document. */
export function MultiChatList() {
  const chats = useChats();
  const deleteChat = useDeleteChat();
  const multiChats = chats.data?.filter((c) => c.kind === 'multi') ?? [];
  if (multiChats.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold tracking-tight">Multi-document chats</h2>
      <ul className="space-y-2">
        {multiChats.map((chat) => (
          <li key={chat.id}>
            <Card className="flex items-center gap-3 p-3">
              <Layers className="size-6 shrink-0 text-muted-foreground" strokeWidth={1.5} />
              <div className="min-w-0 flex-1">
                <Link to={`/chats/${chat.id}`} className="block truncate font-medium hover:underline">
                  {chat.title}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {chat.documents.length} documents · updated {formatDate(chat.updatedAt)}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Delete chat ${chat.title}`}
                onClick={() => confirm('Delete this chat?') && deleteChat.mutate(chat.id)}
              >
                <Trash2 />
              </Button>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}
