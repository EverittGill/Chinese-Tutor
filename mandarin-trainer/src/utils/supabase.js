import { createClient } from '@supabase/supabase-js';
import { getSupabaseConfig } from './config';

let client = null;

export function getSupabaseClient() {
  if (!client) {
    const { url, anonKey } = getSupabaseConfig();
    if (!url || !anonKey) return null;
    client = createClient(url, anonKey);
  }
  return client;
}

export function resetSupabaseClient() {
  client = null;
}
