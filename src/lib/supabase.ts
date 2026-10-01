import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey && !url.includes('SEU-PROJETO'));

/**
 * Cliente público do Supabase. Usa apenas a chave "anon": todas as
 * permissões reais são decididas no banco pelas políticas de RLS.
 */
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, anonKey!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

export function db(): SupabaseClient {
  if (!supabase) {
    throw new Error('O Supabase ainda não foi configurado. Preencha o arquivo .env.local (veja o README).');
  }
  return supabase;
}
