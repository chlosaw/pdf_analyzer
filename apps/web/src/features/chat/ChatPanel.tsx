import { useQueryClient } from '@tanstack/react-query';
import { ArrowUp, Bot, Eraser, Loader2, Square, User } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { toast } from 'sonner';
import { MAX_QUESTION_LENGTH, type ChatDetailDTO, type Citation, type MessageDTO } from '@pdf-analyzer/shared';
import { QuestionBackdrop } from '@/components/QuestionBackdrop';
import { AnswerContent, SourceList } from '@/features/chat/AnswerContent';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { askQuestion } from '@/api/stream';
import { keys, useClearHistory } from '@/api/queries';
import { QUESTION_SUGGESTIONS } from '@/lib/constants';
import { cn } from '@/lib/utils';

interface Pending {
  question: string;
  answer: string;
  sources: Citation[];
  error?: string;
}

export function ChatPanel({ chat, onCite }: { chat: ChatDetailDTO; onCite: (c: Citation) => void }) {
  const qc = useQueryClient();
  const clearHistory = useClearHistory(chat.id);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState<Pending | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const streaming = !!pending && !pending.error;
  const ready = chat.documents.some((d) => d.status === 'READY');
  const multi = chat.documents.length > 1;

  // Block body on purpose: newer browsers return a Promise from scroll methods, and an effect must not return one.
  // Scroll only the message list. scrollIntoView would also scroll the page and push the header off screen.
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [chat.messages.length, pending?.answer, pending?.error]);
  useEffect(() => () => abortRef.current?.abort(), []);

  async function send(question: string) {
    question = question.trim();
    if (!question || streaming) return;
    setInput('');
    setPending({ question, answer: '', sources: [] });

    const controller = new AbortController();
    abortRef.current = controller;
    let userMessage: MessageDTO | undefined;
    try {
      for await (const event of askQuestion(chat.id, question, controller.signal)) {
        if (event.type === 'sources') {
          userMessage = event.userMessage;
          setPending((p) => p && { ...p, sources: event.sources });
        } else if (event.type === 'token') {
          setPending((p) => p && { ...p, answer: p.answer + event.text });
        } else if (event.type === 'error') {
          setPending((p) => p && { ...p, error: event.message });
        } else if (event.type === 'done') {
          const finished = event.message;
          // Move the streamed exchange into the cached history.
          qc.setQueryData<ChatDetailDTO>(
            keys.chat(chat.id),
            (old) => old && { ...old, messages: [...old.messages, ...(userMessage ? [userMessage] : []), finished] }
          );
          setPending(null);
        }
      }
    } catch (err) {
      if (controller.signal.aborted) {
        setPending(null);
        // The server keeps a partial answer when the client stops it; re-sync.
        qc.invalidateQueries({ queryKey: keys.chat(chat.id) });
      } else {
        setPending((p) => p && { ...p, error: (err as Error).message });
      }
    } finally {
      abortRef.current = null;
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send(input);
    }
  }

  const empty = chat.messages.length === 0 && !pending;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b px-3">
        <h2 className="font-serif text-base font-semibold">Chat</h2>
        <Button
          variant="ghost"
          size="sm"
          disabled={chat.messages.length === 0 || streaming || clearHistory.isPending}
          onClick={() =>
            confirm('Clear the chat history?') &&
            clearHistory.mutate(undefined, { onError: (e) => toast.error(e.message) })
          }
        >
          <Eraser /> Clear
        </Button>
      </div>

      <div ref={listRef} className="relative min-h-0 flex-1 space-y-5 overflow-y-auto p-4" aria-live="polite">
        {empty && <QuestionBackdrop />}
        {empty && (
          <div className="relative flex h-full flex-col items-center justify-center gap-4 text-center">
            <div className="space-y-1">
              <p className="font-serif text-2xl font-semibold">
                Ask anything about {multi ? 'these documents' : 'this document'}
              </p>
              <p className="text-sm text-muted-foreground">
                Answers cite the pages they come from. Click a citation to jump there.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {QUESTION_SUGGESTIONS.map((s) => (
                <Button key={s} variant="outline" size="sm" disabled={!ready} onClick={() => send(s)}>
                  {s}
                </Button>
              ))}
            </div>
          </div>
        )}

        {chat.messages.map((m) =>
          m.role === 'user' ? (
            <UserBubble key={m.id} text={m.content} />
          ) : (
            <AssistantBubble key={m.id}>
              <AnswerContent content={m.content} citations={m.citations} onCite={onCite} />
              <SourceList citations={m.citations} onCite={onCite} showDocument={multi} />
            </AssistantBubble>
          )
        )}

        {pending && (
          <>
            <UserBubble text={pending.question} />
            <AssistantBubble>
              {pending.answer ? (
                <AnswerContent content={pending.answer} citations={pending.sources} onCite={onCite} />
              ) : (
                !pending.error && (
                  <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    {pending.sources.length ? 'Writing answer…' : 'Searching the documents…'}
                  </span>
                )
              )}
              {pending.error && (
                <p role="alert" className="mt-1 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {pending.error}
                </p>
              )}
            </AssistantBubble>
          </>
        )}
      </div>

      <form
        className="shrink-0 border-t p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <div className="relative">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            maxLength={MAX_QUESTION_LENGTH}
            rows={2}
            disabled={!ready}
            placeholder={
              ready ? 'Ask a question…  (Enter to send, Shift+Enter for a new line)' : 'Waiting for indexing to finish…'
            }
            className="resize-none pr-12"
            aria-label="Question"
          />
          {streaming ? (
            <Button
              type="button"
              size="icon"
              variant="secondary"
              className="absolute bottom-2 right-2 size-8"
              aria-label="Stop generating"
              onClick={() => abortRef.current?.abort()}
            >
              <Square className="fill-current" />
            </Button>
          ) : (
            <Button
              type="submit"
              size="icon"
              className="absolute bottom-2 right-2 size-8"
              aria-label="Send"
              disabled={!input.trim() || !ready}
            >
              <ArrowUp />
            </Button>
          )}
        </div>
        {input.length > MAX_QUESTION_LENGTH * 0.8 && (
          <p className="mt-1 text-right text-xs text-muted-foreground">
            {input.length}/{MAX_QUESTION_LENGTH}
          </p>
        )}
      </form>
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end gap-2">
      <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-primary-foreground shadow-sm">
        {text}
      </div>
      <Avatar>
        <User />
      </Avatar>
    </div>
  );
}

function AssistantBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2" data-testid="assistant-message">
      <Avatar>
        <Bot />
      </Avatar>
      <div className="min-w-0 max-w-[90%] rounded-2xl rounded-bl-md border bg-card px-4 py-3 shadow-sm">{children}</div>
    </div>
  );
}

function Avatar({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'grid size-7 shrink-0 place-items-center rounded-full border bg-background [&_svg]:size-4',
        className
      )}
    >
      {children}
    </div>
  );
}
