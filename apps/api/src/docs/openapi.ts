import {
  adminUserListQuerySchema,
  askSchema,
  chatListQuerySchema,
  createChatSchema,
  DEMO_SANDBOX_HOURS,
  documentListQuerySchema,
  loginSchema,
  MAX_FILE_SIZE_MB,
  registerSchema,
  renameSchema,
  updateRoleSchema
} from '@pdf-analyzer/shared';
import { z } from 'zod';

/**
 * OpenAPI 3.1 description of the API, served at /api/openapi.json and browsable at /api/docs.
 * Request bodies and query parameters are generated from the same Zod schemas the API validates with,
 * so they can't drift apart. Response shapes mirror the DTO types in packages/shared.
 */

type Json = Record<string, unknown>;

const schemaOf = (schema: z.ZodType): Json => {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as Json;
  return rest;
};

/** Turns an object schema (e.g. ?q=&page=) into OpenAPI query parameters. */
function queryParams(schema: z.ZodType) {
  const json = schemaOf(schema) as { properties: Record<string, Json>; required?: string[] };
  return Object.entries(json.properties).map(([name, s]) => ({
    name,
    in: 'query',
    required: json.required?.includes(name) ?? false,
    schema: s
  }));
}

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema: Json) => ({ content: { 'application/json': { schema } } });
const body = (schema: z.ZodType) => ({ required: true, ...json(schemaOf(schema)) });
const ok = (description: string, schema?: Json) => (schema ? { description, ...json(schema) } : { description });
const error = (description: string) => ({ description, ...json(ref('Error')) });
const idParam = { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } };
const pageOf = (item: string) => ({
  allOf: [
    ref('PageInfo'),
    { type: 'object', required: ['items'], properties: { items: { type: 'array', items: ref(item) } } }
  ]
});

const common = {
  400: error('Invalid input (`code: VALIDATION`, with per-field `details`)'),
  401: error('Not signed in, or the session was revoked or expired'),
  403: error('Cross-site request blocked (`code: CSRF`)'),
  404: error('Not found, or it belongs to someone else (indistinguishable on purpose)'),
  429: error('Rate limited (`code: RATE_LIMITED`); see the RateLimit headers')
};

export const openApiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'PDF Analyzer API',
    version: '1.0.0',
    description: [
      'Upload PDFs, then ask questions answered from their text with page citations (RAG).',
      '',
      '**Authentication:** sign in with `POST /auth/login`, `/auth/register` or `/auth/demo`. The API sets an',
      'httpOnly `token` cookie, which the browser sends automatically, so "Try it out" works on this page once',
      'you are signed in.',
      '',
      '**Errors** are always `{ error, code?, details? }`. **Lists** are paginated with `?page=&pageSize=` and',
      'return `{ items, total, page, pageSize, totalPages }`.'
    ].join('\n')
  },
  servers: [{ url: '/api' }],
  tags: [
    { name: 'Auth' },
    { name: 'Documents', description: 'Upload, list and manage PDFs' },
    { name: 'Chats', description: 'Questions and answers over one or more documents' },
    { name: 'Admin', description: 'Administrators only (role ADMIN); everyone else gets 403' },
    { name: 'System' }
  ],
  components: {
    securitySchemes: { cookieAuth: { type: 'apiKey', in: 'cookie', name: 'token' } },
    schemas: {
      Error: {
        type: 'object',
        required: ['error'],
        properties: {
          error: { type: 'string', description: 'Human-readable message' },
          code: { type: 'string', examples: ['VALIDATION', 'NOT_FOUND', 'RATE_LIMITED'] },
          details: { type: 'object', additionalProperties: { type: 'array', items: { type: 'string' } } }
        }
      },
      PageInfo: {
        type: 'object',
        required: ['total', 'page', 'pageSize', 'totalPages'],
        properties: {
          total: { type: 'integer', description: 'Matching items across all pages' },
          page: { type: 'integer' },
          pageSize: { type: 'integer' },
          totalPages: { type: 'integer' }
        }
      },
      User: {
        type: 'object',
        required: ['id', 'email', 'name', 'isDemo', 'role'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          email: { type: 'string', format: 'email' },
          name: { type: 'string' },
          isDemo: { type: 'boolean', description: `Temporary sandbox, deleted after ${DEMO_SANDBOX_HOURS} hours` },
          role: { type: 'string', enum: ['USER', 'ADMIN'] }
        }
      },
      Document: {
        type: 'object',
        required: ['id', 'name', 'sizeBytes', 'pageCount', 'status', 'error', 'createdAt'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          sizeBytes: { type: 'integer' },
          pageCount: { type: 'integer' },
          status: {
            type: 'string',
            enum: ['PROCESSING', 'READY', 'FAILED'],
            description: 'Indexing runs in the background after upload; poll until it is no longer PROCESSING'
          },
          error: { type: ['string', 'null'] },
          createdAt: { type: 'string', format: 'date-time' }
        }
      },
      Citation: {
        type: 'object',
        required: ['index', 'documentId', 'documentName', 'page', 'snippet', 'score'],
        properties: {
          index: { type: 'integer', description: 'The number used in the answer text, e.g. 2 for "[2]"' },
          documentId: { type: 'string', format: 'uuid' },
          documentName: { type: 'string' },
          page: { type: 'integer' },
          snippet: { type: 'string' },
          score: { type: 'number', description: 'Cosine similarity, 0–1' }
        }
      },
      Message: {
        type: 'object',
        required: ['id', 'role', 'content', 'citations', 'createdAt'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          role: { type: 'string', enum: ['user', 'assistant'] },
          content: { type: 'string', description: 'Markdown, with [n] citation markers in answers' },
          citations: { type: 'array', items: ref('Citation') },
          createdAt: { type: 'string', format: 'date-time' }
        }
      },
      Chat: {
        type: 'object',
        required: ['id', 'title', 'kind', 'documents', 'createdAt', 'updatedAt'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          title: { type: 'string' },
          kind: { type: 'string', enum: ['document', 'multi'] },
          documents: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', format: 'uuid' },
                name: { type: 'string' },
                status: { type: 'string', enum: ['PROCESSING', 'READY', 'FAILED'] },
                pageCount: { type: 'integer' }
              }
            }
          },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' }
        }
      },
      ChatDetail: {
        allOf: [
          ref('Chat'),
          { type: 'object', required: ['messages'], properties: { messages: { type: 'array', items: ref('Message') } } }
        ]
      },
      AdminStats: {
        type: 'object',
        properties: {
          users: { type: 'integer' },
          demoUsers: { type: 'integer' },
          documents: { type: 'integer' },
          chats: { type: 'integer' },
          questionsLast7Days: { type: 'integer' },
          storageBytes: { type: 'integer' }
        }
      },
      AdminUser: {
        allOf: [
          ref('User'),
          {
            type: 'object',
            properties: {
              createdAt: { type: 'string', format: 'date-time' },
              documentCount: { type: 'integer' },
              chatCount: { type: 'integer' }
            }
          }
        ]
      }
    }
  },
  security: [{ cookieAuth: [] }],
  paths: {
    '/health': {
      get: {
        tags: ['System'],
        summary: 'Liveness and database check',
        security: [],
        responses: { 200: ok('Healthy', { type: 'object', properties: { ok: { const: true } } }) }
      }
    },

    // ---- auth ----
    '/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Create an account and sign in',
        security: [],
        requestBody: body(registerSchema),
        responses: {
          201: ok('Signed in; sets the `token` cookie', ref('User')),
          400: common[400],
          409: error('Email already registered (`code: EMAIL_TAKEN`)'),
          429: common[429]
        }
      }
    },
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Sign in',
        security: [],
        requestBody: body(loginSchema),
        responses: {
          200: ok('Signed in; sets the `token` cookie', ref('User')),
          400: common[400],
          401: error('Wrong email or password (`code: BAD_CREDENTIALS`)'),
          429: error('Too many attempts from this IP, or for this account (`code: ACCOUNT_LOCKED`)')
        }
      }
    },
    '/auth/demo': {
      post: {
        tags: ['Auth'],
        summary: 'Start a demo sandbox',
        description: `Creates a throwaway account with two indexed sample PDFs and signs in. Deleted after ${DEMO_SANDBOX_HOURS} hours.`,
        security: [],
        responses: { 201: ok('Signed in to the sandbox', ref('User')), 429: common[429] }
      }
    },
    '/auth/logout': {
      post: {
        tags: ['Auth'],
        summary: 'Sign out',
        description: 'Revokes the session on the server, so the token stops working even if it was copied.',
        responses: { 204: { description: 'Signed out' } }
      }
    },
    '/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'The signed-in user',
        responses: { 200: ok('The user', ref('User')), 401: common[401] }
      }
    },

    // ---- documents ----
    '/documents': {
      get: {
        tags: ['Documents'],
        summary: 'List documents',
        description: 'Search by name (`q`, case-insensitive), filter by `status`, sort, and page.',
        parameters: queryParams(documentListQuerySchema),
        responses: { 200: ok('One page of documents', pageOf('Document')), 400: common[400], 401: common[401] }
      },
      post: {
        tags: ['Documents'],
        summary: 'Upload a PDF',
        description: `Text is extracted straight away; chunking and embedding continue in the background (status PROCESSING). Up to ${MAX_FILE_SIZE_MB} MB.`,
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary' } } }
            }
          }
        },
        responses: {
          201: ok('Uploaded; indexing has started', ref('Document')),
          400: common[400],
          401: common[401],
          409: error('Document limit reached (`code: DOCUMENT_LIMIT`)'),
          413: error('File too large (`code: FILE_TOO_LARGE`)'),
          415: error('Not a PDF (`code: UNSUPPORTED_TYPE`)'),
          422: error('No text (scanned), password-protected, corrupt, or too many pages'),
          429: common[429]
        }
      }
    },
    '/documents/{id}': {
      parameters: [idParam],
      get: {
        tags: ['Documents'],
        summary: 'Get a document',
        responses: { 200: ok('The document', ref('Document')), 401: common[401], 404: common[404] }
      },
      patch: {
        tags: ['Documents'],
        summary: 'Rename a document',
        description: "The document's own chat is renamed with it.",
        requestBody: body(renameSchema),
        responses: { 200: ok('Renamed', ref('Document')), 400: common[400], 401: common[401], 404: common[404] }
      },
      delete: {
        tags: ['Documents'],
        summary: 'Delete a document',
        description: 'Also deletes its chunks, its own chat, and multi-document chats left with no documents.',
        responses: { 204: { description: 'Deleted' }, 401: common[401], 404: common[404] }
      }
    },
    '/documents/{id}/file': {
      parameters: [idParam],
      get: {
        tags: ['Documents'],
        summary: 'Download the original PDF',
        responses: {
          200: {
            description: 'The PDF',
            content: { 'application/pdf': { schema: { type: 'string', format: 'binary' } } }
          },
          401: common[401],
          404: common[404]
        }
      }
    },
    '/documents/{id}/chat': {
      parameters: [idParam],
      post: {
        tags: ['Documents'],
        summary: "Get or create the document's own chat",
        responses: {
          200: ok('Existing chat', ref('Chat')),
          201: ok('Created', ref('Chat')),
          401: common[401],
          404: common[404]
        }
      }
    },

    // ---- chats ----
    '/chats': {
      get: {
        tags: ['Chats'],
        summary: 'List chats',
        description: 'Most recently active first. `q` searches titles and document names; `kind` filters.',
        parameters: queryParams(chatListQuerySchema),
        responses: { 200: ok('One page of chats', pageOf('Chat')), 400: common[400], 401: common[401] }
      },
      post: {
        tags: ['Chats'],
        summary: 'Start a multi-document chat',
        requestBody: body(createChatSchema),
        responses: { 201: ok('Created', ref('Chat')), 400: common[400], 401: common[401], 404: common[404] }
      }
    },
    '/chats/{id}': {
      parameters: [idParam],
      get: {
        tags: ['Chats'],
        summary: 'Get a chat with its messages',
        responses: { 200: ok('The chat', ref('ChatDetail')), 401: common[401], 404: common[404] }
      },
      patch: {
        tags: ['Chats'],
        summary: 'Rename a chat',
        requestBody: body(renameSchema),
        responses: { 200: ok('Renamed', ref('Chat')), 400: common[400], 401: common[401], 404: common[404] }
      },
      delete: {
        tags: ['Chats'],
        summary: 'Delete a chat',
        responses: { 204: { description: 'Deleted' }, 401: common[401], 404: common[404] }
      }
    },
    '/chats/{id}/messages': {
      parameters: [idParam],
      post: {
        tags: ['Chats'],
        summary: 'Ask a question (streams the answer)',
        description: [
          'Retrieves the most relevant chunks, then streams the answer as **Server-Sent Events**. Each `data:` line',
          'is JSON: `{type: "sources", userMessage, sources}` first, then `{type: "token", text}` many times, then',
          '`{type: "done", message}` (saved assistant message) or `{type: "error", message}`.'
        ].join(' '),
        requestBody: body(askSchema),
        responses: {
          200: { description: 'Event stream', content: { 'text/event-stream': { schema: { type: 'string' } } } },
          400: common[400],
          401: common[401],
          404: common[404],
          409: error('Documents still being processed (`code: NOT_READY`)'),
          429: common[429]
        }
      },
      delete: {
        tags: ['Chats'],
        summary: 'Clear the chat history',
        responses: { 204: { description: 'Cleared' }, 401: common[401], 404: common[404] }
      }
    },

    // ---- admin ----
    '/admin/stats': {
      get: {
        tags: ['Admin'],
        summary: 'Usage totals',
        responses: {
          200: ok('Totals', ref('AdminStats')),
          401: common[401],
          403: error('Not an administrator (`code: FORBIDDEN`)')
        }
      }
    },
    '/admin/users': {
      get: {
        tags: ['Admin'],
        summary: 'List users',
        parameters: queryParams(adminUserListQuerySchema),
        responses: {
          200: ok('One page of users', pageOf('AdminUser')),
          401: common[401],
          403: error('Not an administrator (`code: FORBIDDEN`)')
        }
      }
    },
    '/admin/users/{id}': {
      parameters: [idParam],
      patch: {
        tags: ['Admin'],
        summary: "Change a user's role",
        requestBody: body(updateRoleSchema),
        responses: {
          200: ok('Updated', ref('AdminUser')),
          400: common[400],
          403: error('Not an administrator, or changing your own role'),
          404: common[404]
        }
      },
      delete: {
        tags: ['Admin'],
        summary: 'Delete a user and all their data',
        responses: {
          204: { description: 'Deleted' },
          403: error('Not an administrator, or deleting yourself'),
          404: common[404]
        }
      }
    }
  }
};
