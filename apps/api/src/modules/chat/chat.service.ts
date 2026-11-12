import type { Chat, Document, Message } from '@prisma/client';
import {
  extractCitationIndices,
  type ChatDTO,
  type ChatDetailDTO,
  type Citation,
  type MessageDTO,
  type StreamEvent
} from '@pdf-analyzer/shared';
import { prisma } from '../../lib/db';
import { isTest } from '../../lib/env';
import { HttpError, notFound } from '../../lib/errors';
import { searchSimilarChunks } from '../embeddings/embeddings.service';
import { ai, type ChatTurn } from '../embeddings/providers';
import { buildPrompt, SYSTEM_PROMPT } from './prompt';

/** Previous messages sent to the model so follow-up questions make sense. */
const HISTORY_MESSAGES = 6;
const SNIPPET_CHARS = 300;
const NOT_FOUND_ANSWER = "I couldn't find anything relevant to that in the selected documents.";

type ChatWithDocs = Chat & { documents: Document[] };

// ---- mapping ------------------------------------------------------------------

export const toMessageDTO = (m: Message): MessageDTO => ({
  id: m.id,
  role: m.role === 'USER' ? 'user' : 'assistant',
  content: m.content,
  citations: (m.citations ?? []) as unknown as Citation[],
  createdAt: m.createdAt.toISOString()
});

export const toChatDTO = (c: ChatWithDocs): ChatDTO => ({
  id: c.id,
  title: c.title,
  kind: c.isDocumentChat ? 'document' : 'multi',
  documents: c.documents.map((d) => ({ id: d.id, name: d.name, status: d.status, pageCount: d.pageCount })),
  createdAt: c.createdAt.toISOString(),
  updatedAt: c.updatedAt.toISOString()
});

export const toChatDetailDTO = (c: ChatWithDocs, messages: Message[]): ChatDetailDTO => ({
  ...toChatDTO(c),
  messages: messages.map(toMessageDTO)
});

// ---- chats ----------------------------------------------------------------------

export function listChats(userId: string) {
  return prisma.chat.findMany({ where: { userId }, include: { documents: true }, orderBy: { updatedAt: 'desc' } });
}

export async function getOwnedChat(userId: string, id: string): Promise<ChatWithDocs> {
  const chat = await prisma.chat.findFirst({ where: { id, userId }, include: { documents: true } });
  if (!chat) throw notFound('Chat');
  return chat;
}

export async function getChatDetail(userId: string, id: string) {
  const chat = await getOwnedChat(userId, id);
  const messages = await prisma.message.findMany({ where: { chatId: chat.id }, orderBy: { createdAt: 'asc' } });
  return toChatDetailDTO(chat, messages);
}

export async function createMultiChat(userId: string, documentIds: string[], title?: string) {
  const ids = [...new Set(documentIds)];
  const docs = await prisma.document.findMany({ where: { id: { in: ids }, userId } });
  if (docs.length !== ids.length) throw notFound('One or more documents');

  return prisma.chat.create({
    data: {
      userId,
      title:
        title ??
        docs
          .map((d) => d.name.replace(/\.pdf$/i, ''))
          .join(' + ')
          .slice(0, 120),
      documents: { connect: ids.map((id) => ({ id })) }
    },
    include: { documents: true }
  });
}

/** Each document has exactly one chat of its own: that's the "history per document". */
export async function getOrCreateDocumentChat(doc: Document) {
  const existing = await prisma.chat.findFirst({
    where: { userId: doc.userId, isDocumentChat: true, documents: { some: { id: doc.id } } },
    include: { documents: true }
  });
  if (existing) return { chat: existing, created: false };
  const chat = await prisma.chat.create({
    data: { userId: doc.userId, title: doc.name, isDocumentChat: true, documents: { connect: { id: doc.id } } },
    include: { documents: true }
  });
  return { chat, created: true };
}

export async function deleteChat(userId: string, id: string) {
  const chat = await getOwnedChat(userId, id);
  await prisma.chat.delete({ where: { id: chat.id } });
}

export async function clearMessages(userId: string, id: string) {
  const chat = await getOwnedChat(userId, id);
  await prisma.message.deleteMany({ where: { chatId: chat.id } });
}

// ---- answering ----------------------------------------------------------------

/** Checks run before the stream opens, so they become normal JSON errors. */
export async function getAnswerableChat(userId: string, id: string) {
  const chat = await getOwnedChat(userId, id);
  const ready = chat.documents.filter((d) => d.status === 'READY');
  if (ready.length === 0) {
    throw new HttpError(
      409,
      'The documents in this chat are still being processed. Try again in a moment.',
      'NOT_READY'
    );
  }
  return { chat, readyDocumentIds: ready.map((d) => d.id) };
}

/**
 * Answering half of the RAG pipeline: retrieve -> prompt -> stream -> save.
 * Yields the events the controller forwards over SSE.
 */
export async function* answerQuestion({
  chat,
  readyDocumentIds,
  question,
  signal
}: {
  chat: ChatWithDocs;
  readyDocumentIds: string[];
  question: string;
  signal: AbortSignal;
}): AsyncGenerator<StreamEvent> {
  const history: ChatTurn[] = (
    await prisma.message.findMany({
      where: { chatId: chat.id },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_MESSAGES
    })
  )
    .reverse()
    .map((m) => ({ role: m.role === 'USER' ? 'user' : 'assistant', content: m.content }));

  const userMessage = await prisma.message.create({ data: { chatId: chat.id, role: 'USER', content: question } });

  let answer = '';
  let sources: Citation[] = [];
  try {
    const chunks = await searchSimilarChunks(question, readyDocumentIds, readyDocumentIds.length > 1 ? 8 : 6);
    sources = chunks.map((c, i) => ({
      index: i + 1,
      documentId: c.documentId,
      documentName: c.documentName,
      page: c.page,
      snippet: c.content.slice(0, SNIPPET_CHARS),
      score: c.score
    }));
    yield { type: 'sources', userMessage: toMessageDTO(userMessage), sources };

    if (chunks.length === 0) {
      answer = NOT_FOUND_ANSWER;
      yield { type: 'token', text: answer };
    } else {
      const stream = ai.streamAnswer({ system: SYSTEM_PROMPT, history, prompt: buildPrompt(question, chunks), signal });
      for await (const text of stream) {
        if (signal.aborted) break;
        answer += text;
        yield { type: 'token', text };
      }
    }
  } catch (err) {
    if (!signal.aborted) {
      if (!isTest) console.error('Answer generation failed:', err);
      const status = (err as { status?: number }).status;
      yield {
        type: 'error',
        message:
          status === 429
            ? 'The AI service is rate-limited right now. Please wait a minute and try again.'
            : status === 503
              ? 'The AI service is overloaded right now. This is usually temporary; please try again in a minute.'
              : status === 504
                ? 'The AI service took too long to respond; it may be overloaded. Please try again in a minute.'
                : 'Something went wrong while generating the answer. Please try again.'
      };
    }
  }

  // Keep whatever was generated, even if the user stopped the stream early.
  if (answer.trim()) {
    const cited = new Set(extractCitationIndices(answer));
    const message = await prisma.message.create({
      data: {
        chatId: chat.id,
        role: 'ASSISTANT',
        content: answer,
        citations: sources.filter((s) => cited.has(s.index)) as object[]
      }
    });
    await prisma.chat.update({ where: { id: chat.id }, data: { updatedAt: new Date() } });
    yield { type: 'done', message: toMessageDTO(message) };
  } else {
    // Nothing to show for it: drop the orphaned question so the history stays consistent.
    await prisma.message.delete({ where: { id: userMessage.id } }).catch(() => undefined);
  }
}
