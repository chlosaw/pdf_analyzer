import { z } from 'zod';

// ---------------------------------------------------------------------------
// Limits (shared so the client can validate before uploading)
// ---------------------------------------------------------------------------

export const MAX_FILE_SIZE_MB = 15;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
export const MAX_QUESTION_LENGTH = 2000;
export const MAX_DOCS_PER_CHAT = 10;
/** "Try the demo" sandboxes are deleted, with everything in them, after this long. */
export const DEMO_SANDBOX_HOURS = 24;

// ---------------------------------------------------------------------------
// Request schemas
// ---------------------------------------------------------------------------

const email = z.string().trim().toLowerCase().email('Enter a valid email');

export const registerSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80),
  email,
  // bcrypt only uses the first 72 bytes of a password
  password: z.string().min(8, 'Password must be at least 8 characters').max(72)
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Password is required')
});
export type LoginInput = z.infer<typeof loginSchema>;

export const createChatSchema = z.object({
  documentIds: z
    .array(z.string().uuid())
    .min(1, 'Pick at least one document')
    .max(MAX_DOCS_PER_CHAT, `You can chat with up to ${MAX_DOCS_PER_CHAT} documents at once`),
  title: z.string().trim().min(1).max(120).optional()
});
export type CreateChatInput = z.infer<typeof createChatSchema>;

export const askSchema = z.object({
  question: z
    .string()
    .trim()
    .min(1, 'Ask a question')
    .max(MAX_QUESTION_LENGTH, `Questions are limited to ${MAX_QUESTION_LENGTH} characters`)
});
export type AskInput = z.infer<typeof askSchema>;

// ---------------------------------------------------------------------------
// API response shapes
// ---------------------------------------------------------------------------

export interface UserDTO {
  id: string;
  email: string;
  name: string;
  /** A temporary "Try the demo" visitor */
  isDemo: boolean;
}

export type DocumentStatus = 'PROCESSING' | 'READY' | 'FAILED';

export interface DocumentDTO {
  id: string;
  name: string;
  sizeBytes: number;
  pageCount: number;
  status: DocumentStatus;
  error: string | null;
  createdAt: string;
}

export interface Citation {
  /** The number the model uses in the answer text, e.g. 2 for "[2]" */
  index: number;
  documentId: string;
  documentName: string;
  page: number;
  snippet: string;
  score: number;
}

export interface MessageDTO {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations: Citation[];
  createdAt: string;
}

export type ChatKind = 'document' | 'multi';

export interface ChatDTO {
  id: string;
  title: string;
  kind: ChatKind;
  documents: Pick<DocumentDTO, 'id' | 'name' | 'status' | 'pageCount'>[];
  createdAt: string;
  updatedAt: string;
}

export interface ChatDetailDTO extends ChatDTO {
  messages: MessageDTO[];
}

export interface ApiErrorBody {
  error: string;
  code?: string;
  details?: Record<string, string[] | undefined>;
}

/** Events sent over Server-Sent Events while an answer is generated. */
export type StreamEvent =
  | { type: 'sources'; userMessage: MessageDTO; sources: Citation[] }
  | { type: 'token'; text: string }
  | { type: 'done'; message: MessageDTO }
  | { type: 'error'; message: string };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CITATION_RE = /\[(\d{1,2})\]/g;

/** Returns the source numbers referenced in an answer, e.g. "a [1] b [3][1]" -> [1, 3]. */
export function extractCitationIndices(text: string): number[] {
  const found = new Set<number>();
  for (const match of text.matchAll(CITATION_RE)) found.add(Number(match[1]));
  return [...found].sort((a, b) => a - b);
}
