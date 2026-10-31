import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';

export interface FileStorage {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

/** Disk storage for local development and tests. Not for Render: its disk is wiped on every restart. */
class LocalStorage implements FileStorage {
  private root: string;
  constructor(dir: string) {
    this.root = path.resolve(dir);
  }
  private resolve(key: string) {
    const full = path.resolve(this.root, key);
    if (!full.startsWith(this.root + path.sep)) throw new Error('Invalid storage key');
    return full;
  }
  async put(key: string, data: Buffer) {
    const file = this.resolve(key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, data);
  }
  async get(key: string) {
    return readFile(this.resolve(key));
  }
  async delete(key: string) {
    await rm(this.resolve(key), { force: true });
  }
}

/** Private Supabase Storage bucket. Files are only reachable through our authenticated API. */
class SupabaseStorage implements FileStorage {
  private client: SupabaseClient;
  constructor(
    url: string,
    serviceRoleKey: string,
    private bucket: string
  ) {
    this.client = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  }
  async put(key: string, data: Buffer, contentType: string) {
    const { error } = await this.client.storage.from(this.bucket).upload(key, data, { contentType, upsert: false });
    if (error) throw new Error(`Storage upload failed: ${error.message}`);
  }
  async get(key: string) {
    const { data, error } = await this.client.storage.from(this.bucket).download(key);
    if (error || !data) throw new Error(`Storage download failed: ${error?.message ?? 'empty'}`);
    return Buffer.from(await data.arrayBuffer());
  }
  async delete(key: string) {
    const { error } = await this.client.storage.from(this.bucket).remove([key]);
    if (error) throw new Error(`Storage delete failed: ${error.message}`);
  }
}

export const storage: FileStorage =
  env.STORAGE_DRIVER === 'supabase'
    ? new SupabaseStorage(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, env.SUPABASE_BUCKET)
    : new LocalStorage(env.LOCAL_STORAGE_DIR);
