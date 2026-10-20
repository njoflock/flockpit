import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';

let client: SupabaseClient | null = null;
// Cliente del servidor. Nunca se expone al navegador.
export function db(): SupabaseClient {
  if (!client) client = createClient(env.supabaseUrl(), env.supabaseKey(), { auth: { persistSession: false } });
  return client;
}
export async function must<T>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data as T;
}
