import { z } from 'zod';

// ---------------------------------------------------------------------------
// Limits (shared so the client can validate before uploading)
// ---------------------------------------------------------------------------

export const MAX_FILE_SIZE_MB = 15;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
export const MAX_QUESTION_LENGTH = 2000;
export const MAX_DOCS_PER_CHAT = 10;
/** Stops "PDF bombs": small files with thousands of pages that would tie up the server parsing them */
export const MAX_PAGES = 500;
/** Per account, so one user can't fill the storage bucket */
export const MAX_DOCUMENTS_PER_USER = 50;
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
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .refine((p) => new TextEncoder().encode(p).length <= 72, 'Password is too long (72 bytes at most)')
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

/** A new name for a document or chat */
export const renameSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200, 'Names are limited to 200 characters')
});
export type RenameInput = z.infer<typeof renameSchema>;

// ---- list queries (?q=&page=&pageSize=&...) -----------------------------------

export const MAX_PAGE_SIZE = 50;

const pagination = {
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(20)
};

export const documentListQuerySchema = z.object({
  ...pagination,
  status: z.enum(['PROCESSING', 'READY', 'FAILED']).optional(),
  sort: z.enum(['newest', 'oldest', 'name', 'size']).default('newest')
});
export type DocumentListQuery = Partial<z.output<typeof documentListQuerySchema>>;

export const chatListQuerySchema = z.object({
  ...pagination,
  kind: z.enum(['document', 'multi']).optional()
});
export type ChatListQuery = Partial<z.output<typeof chatListQuerySchema>>;

export const adminUserListQuerySchema = z.object({
  ...pagination,
  role: z.enum(['USER', 'ADMIN']).optional(),
  /** Demo sandboxes are hidden unless asked for */
  includeDemo: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true')
});
export type AdminUserListQuery = { q?: string; page?: number; pageSize?: number; role?: Role; includeDemo?: boolean };

export const updateRoleSchema = z.object({ role: z.enum(['USER', 'ADMIN']) });

// ---------------------------------------------------------------------------
// API response shapes
// ---------------------------------------------------------------------------

export type Role = 'USER' | 'ADMIN';

export interface UserDTO {
  id: string;
  email: string;
  name: string;
  /** A temporary "Try the demo" visitor */
  isDemo: boolean;
  role: Role;
}

export interface AdminUserDTO extends UserDTO {
  createdAt: string;
  documentCount: number;
  chatCount: number;
}

export interface AdminStatsDTO {
  users: number;
  /** Of which temporary demo sandboxes */
  demoUsers: number;
  documents: number;
  chats: number;
  questionsLast7Days: number;
  storageBytes: number;
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

/** One page of a list endpoint's results */
export interface Page<T> {
  items: T[];
  /** Matching items across all pages */
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
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

/**
 * A citation group: "[3]", "[1, 3, 4]" or "[2-4]" (any dash). Models are asked for "[1][3]" but don't
 * always comply, so every form is understood. Not followed by "(" so markdown links are left alone.
 */
export const CITATION_GROUP_RE = /\[(\d{1,2}(?:\s*[,;\-\u2013\u2014]\s*\d{1,2})*)\](?!\()/g;

/** "1, 3-5" -> [1, 3, 4, 5]. Ranges are capped so a typo like "1-99" can't explode. */
export function parseCitationGroup(inner: string): number[] {
  const out: number[] = [];
  for (const part of inner.split(/\s*[,;]\s*/)) {
    const [from, to] = part.split(/\s*[-\u2013\u2014]\s*/).map(Number);
    if (to === undefined) out.push(from);
    else for (let n = from; n <= Math.min(to, from + 20); n++) out.push(n);
  }
  return out;
}

/** Returns the source numbers referenced in an answer, e.g. "a [1] b [3][1] c [4, 6]" -> [1, 3, 4, 6]. */
export function extractCitationIndices(text: string): number[] {
  const found = new Set<number>();
  for (const match of text.matchAll(CITATION_GROUP_RE)) for (const n of parseCitationGroup(match[1])) found.add(n);
  return [...found].sort((a, b) => a - b);
}
