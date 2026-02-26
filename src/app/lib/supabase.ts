/**
 * @module supabase
 * @description Cliente Supabase singleton para uso em toda a aplicação.
 *
 * Inicializa o client com URL e ANON_KEY do .env (via Vite).
 * Exporta também helper para obter sessão do usuário logado.
 *
 * @example
 * ```ts
 * import { supabase } from '@/app/lib/supabase';
 * const { data } = await supabase.from('clientes').select('*');
 * ```
 */
import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '⚠️ Supabase não configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no .env'
  );
}

/**
 * Instância singleton do cliente Supabase com tipagem do banco.
 * Usa persistência de sessão automática via localStorage.
 */
export const supabase = createClient<Database>(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  }
);

/**
 * Retorna o ID do usuário autenticado ou null.
 */
export async function getCurrentUserId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/**
 * Verifica se o Supabase está configurado com credenciais reais.
 */
export function isSupabaseConfigured(): boolean {
  return (
    !!supabaseUrl &&
    !!supabaseAnonKey &&
    !supabaseUrl.includes('YOUR_PROJECT_ID') &&
    !supabaseAnonKey.includes('your-anon-key')
  );
}
