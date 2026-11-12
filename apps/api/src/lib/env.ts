import path from 'node:path';
import { config } from 'dotenv';
import { z } from 'zod';

// One .env at the repo root serves docker compose and local dev; apps/api/.env can override it.
config({ path: [path.resolve(process.cwd(), '.env'), path.resolve(process.cwd(), '../../.env')] });

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    /** Defaults to true in production. Set to false to run the production build over plain http://localhost. */
    COOKIE_SECURE: z.enum(['true', 'false']).optional(),

    AI_PROVIDER: z.enum(['gemini', 'fake']).default('gemini'),
    GEMINI_API_KEY: z.string().optional(),
    GEMINI_CHAT_MODEL: z.string().default('gemini-3.8-flash'),
    /** Used for retries when the main model is overloaded or too slow (common on the free tier) */
    GEMINI_FALLBACK_CHAT_MODEL: z.string().default('gemini-3.5-flash-lite'),
    GEMINI_EMBEDDING_MODEL: z.string().default('gemini-embedding-001'),

    STORAGE_DRIVER: z.enum(['local', 'supabase']).default('local'),
    LOCAL_STORAGE_DIR: z.string().default('./uploads'),
    SUPABASE_URL: z.string().optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
    SUPABASE_BUCKET: z.string().default('pdfs'),

    /** Number of reverse proxies in front of the API (nginx, Render), so rate limits see the real client IP. */
    TRUST_PROXY: z.coerce.number().int().min(0).default(1)
  })
  .superRefine((env, ctx) => {
    if (env.AI_PROVIDER === 'gemini' && !env.GEMINI_API_KEY) {
      ctx.addIssue({ code: 'custom', path: ['GEMINI_API_KEY'], message: 'Required when AI_PROVIDER=gemini' });
    }
    if (env.STORAGE_DRIVER === 'supabase' && (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY)) {
      ctx.addIssue({
        code: 'custom',
        path: ['SUPABASE_URL'],
        message: 'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required when STORAGE_DRIVER=supabase'
      });
    }
  });

// `KEY=` in .env means "not set", not "set to an empty string".
const parsed = schema.safeParse(Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== '')));
if (!parsed.success) {
  console.error('Invalid environment variables:');
  for (const issue of parsed.error.issues) console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
export const secureCookies = env.COOKIE_SECURE ? env.COOKIE_SECURE === 'true' : isProd;
