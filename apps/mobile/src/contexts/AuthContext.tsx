/**
 * AuthContext — gerencia sessão Supabase + perfil do usuário.
 *
 * Bloqueio de role: este app só permite entrar usuários com `role === 'admin'`.
 * Tentativas de login com outro role são deslogadas imediatamente com erro.
 */
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';

export interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  role: 'admin';
}

interface AuthState {
  user: AdminUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  // Hidrata sessão persistida + escuta mudanças
  useEffect(() => {
    mountedRef.current = true;
    let unsub: (() => void) | undefined;

    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        await loadProfile(data.session?.user?.id ?? null, data.session?.user?.email ?? null);
      } finally {
        if (mountedRef.current) setLoading(false);
      }
      const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
        if (!mountedRef.current) return;
        loadProfile(session?.user?.id ?? null, session?.user?.email ?? null);
      });
      unsub = () => sub.subscription.unsubscribe();
    })();

    return () => {
      mountedRef.current = false;
      unsub?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadProfile(authUserId: string | null, authEmail: string | null) {
    if (!authUserId) {
      setUser(null);
      return;
    }
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('id, email, name, role')
      .eq('id', authUserId)
      .single();

    if (error || !profile) {
      console.warn('[auth] profile não encontrado', error?.message);
      await supabase.auth.signOut();
      setUser(null);
      return;
    }

    if (profile.role !== 'admin') {
      // Bloqueio: este app é exclusivo de admin
      console.warn('[auth] usuário sem permissão admin — encerrando sessão');
      await supabase.auth.signOut();
      setUser(null);
      throw new Error('Acesso restrito a administradores.');
    }

    setUser({
      id: profile.id,
      email: profile.email ?? authEmail ?? '',
      name: profile.name ?? null,
      role: 'admin',
    });
  }

  async function signIn(email: string, password: string) {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await loadProfile(data.user?.id ?? null, data.user?.email ?? null);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    setUser(null);
  }

  const value = useMemo<AuthState>(
    () => ({ user, loading, signIn, signOut }),
    [user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de <AuthProvider>');
  return ctx;
}
