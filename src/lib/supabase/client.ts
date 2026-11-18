import { createBrowserClient } from '@supabase/ssr';
import { getSupabaseEnv } from './config';

let instance: ReturnType<typeof createBrowserClient> | null = null;

export function createBrowserSupabaseClient() {
  if (instance) return instance;
  const { url, anonKey } = getSupabaseEnv();
  instance = createBrowserClient(url, anonKey);
  return instance;
}
