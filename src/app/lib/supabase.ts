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

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

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

// ── Session keep-alive on tab visibility change ─────────
// Browsers throttle timers on hidden tabs, which can cause the
// Supabase auto-refresh to miss the JWT renewal window.
// When the user returns, we proactively refresh the session so
// subsequent queries don't fail with an expired token.
if (typeof document !== 'undefined') {
  let hiddenSince = 0;

  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'hidden') {
      hiddenSince = Date.now();
      return;
    }

    // Tab became visible — only refresh if hidden > 60 s
    const elapsed = Date.now() - hiddenSince;
    if (elapsed < 60_000) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const expiresAt = (session.expires_at ?? 0) * 1000;
      // If token expires within 5 min, force refresh now
      if (expiresAt - Date.now() < 5 * 60_000) {
        console.log('[Supabase] Refreshing session after tab was hidden for', Math.round(elapsed / 1000), 's');
        await supabase.auth.refreshSession();
      }
    } catch (e) {
      console.warn('[Supabase] Session refresh on visibility change failed:', e);
    }
  });
}

