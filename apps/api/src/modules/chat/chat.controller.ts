import type { Request, Response } from 'express';
import { askSchema, chatListQuerySchema, createChatSchema, renameSchema } from '@pdf-analyzer/shared';
import { openSse } from '../../lib/sse';
import { userId } from '../../middleware/auth';
import * as chats from './chat.service';

const idParam = (req: Request) => String(req.params.id);

export async function list(req: Request, res: Response) {
  res.json(await chats.listChats(userId(req), chatListQuerySchema.parse(req.query)));
}

export async function rename(req: Request, res: Response) {
  const { name } = renameSchema.parse(req.body);
  res.json(chats.toChatDTO(await chats.renameChat(userId(req), idParam(req), name)));
}

export async function create(req: Request, res: Response) {
  const input = createChatSchema.parse(req.body);
  const chat = await chats.createMultiChat(userId(req), input.documentIds, input.title);
  res.status(201).json(chats.toChatDTO(chat));
}

export async function get(req: Request, res: Response) {
  res.json(await chats.getChatDetail(userId(req), idParam(req)));
}

export async function remove(req: Request, res: Response) {
  await chats.deleteChat(userId(req), idParam(req));
  res.status(204).end();
}

export async function clear(req: Request, res: Response) {
  await chats.clearMessages(userId(req), idParam(req));
  res.status(204).end();
}

/** Streams the answer as Server-Sent Events. Errors before the stream opens are normal JSON responses. */
export async function ask(req: Request, res: Response) {
  const { question } = askSchema.parse(req.body);
  const { chat, readyDocumentIds } = await chats.getAnswerableChat(userId(req), idParam(req));

  const sse = openSse(res);
  const abort = new AbortController();
  res.on('close', () => abort.abort()); // user pressed Stop or left the page

  for await (const event of chats.answerQuestion({ chat, readyDocumentIds, question, signal: abort.signal })) {
    sse.send(event);
  }
  sse.end();
}
