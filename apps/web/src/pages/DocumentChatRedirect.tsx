import { Loader2 } from 'lucide-react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useDocumentChat } from '@/api/queries';

/** /documents/:id opens (or creates) that document's own chat. */
export function DocumentChatRedirect() {
  const { id = '' } = useParams();
  const chat = useDocumentChat(id);

  if (chat.isSuccess) return <Navigate to={`/chats/${chat.data.id}`} replace />;
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
  return (
    <div className="grid h-full place-items-center text-muted-foreground">
      <Loader2 className="size-6 animate-spin" />
    </div>
  );
}
