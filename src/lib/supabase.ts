/**
 * Supabase Auth client (login only - the frontend never reads tables directly; all data goes through /api).
 *
 * VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are baked in at build time by the pipeline (GitHub variables).
 * When they are missing (AI Studio preview, RUN-LOCAL-TEST.bat) there is no login: the local backend runs
 * with auth off (you are ADMIN); without a backend the app shows "could not reach the server".
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase: SupabaseClient | null = url && anonKey
  ? createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true } })
  : null;

/** Current access token, refreshed by supabase-js when needed; null when logged out or auth is not configured. */
export async function accessToken(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
