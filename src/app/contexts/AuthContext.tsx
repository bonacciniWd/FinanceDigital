/**
 * @module AuthContext
 * @description Contexto de autenticação via Supabase Auth.
 *
 * Escuta `onAuthStateChange` para manter sessão atualizada.
 * Profile do usuário (name, role) é carregado da tabela `profiles`.
 * Se o profile não existir após o primeiro login, é criado automaticamente
 * a partir dos metadados do `auth.users` (trigger `handle_new_user`).
 *
 * @example
 * ```tsx
 * const { user, login, logout, isAuthenticated, loading } = useAuth();
 * ```
 */
import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import type { Profile, UserRole } from '../lib/database.types';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar?: string;
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (email: string, password: string, name: string, role?: UserRole) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  updateProfile: (data: Partial<Pick<AuthUser, 'name' | 'avatar'>>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // ── Helpers ──────────────────────────────────────────────

  /**
   * Busca o profile do usuário. Se não existir (trigger falhou ou conta nova),
   * cria automaticamente usando os metadados do auth.users.
   */
  const fetchProfile = useCallback(async (userId: string, email?: string): Promise<Profile | null> => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (!error && data) return data;

    // Profile não encontrado — cria com os dados que já temos (evita round-trip getUser)
    const fallbackEmail = email ?? '';
    const fallbackName = fallbackEmail.split('@')[0] || 'Usuário';
    const fallbackRole: UserRole = 'comercial';

    const { data: created, error: insertError } = await supabase
      .from('profiles')
      .upsert({ id: userId, name: fallbackName, email: fallbackEmail, role: fallbackRole }, { onConflict: 'id' })
      .select()
      .single();

    if (insertError) {
      console.error('Erro ao criar profile:', insertError);
      return null;
    }
    return created;
  }, []);

  function profileToAuthUser(profile: Profile): AuthUser {
    return {
      id: profile.id,
      name: profile.name,
      email: profile.email,
      role: profile.role,
      avatar: profile.avatar_url ?? undefined,
    };
  }

  // ── Inicialização ────────────────────────────────────────

  useEffect(() => {
    // Limpar qualquer dado de sessão mock residual
    localStorage.removeItem('fintechflow_user');

    let ignore = false;

    // Usamos SOMENTE o listener onAuthStateChange para definir o estado inicial
    // e reagir a mudanças. Isso evita race conditions entre getSession() e o listener.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (ignore) return;

        if (
          (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') &&
          session?.user
        ) {
          // Carrega profile completo apenas na sessão inicial e no login
          const profile = await fetchProfile(session.user.id, session.user.email);
          if (!ignore && profile) setUser(profileToAuthUser(profile));
          if (!ignore) setLoading(false);
        } else if (event === 'TOKEN_REFRESHED' && session?.user) {
          // Refresh silencioso — só atualiza se ainda não temos usuário carregado
          setLoading(false);
        } else if (event === 'SIGNED_OUT') {
          setUser(null);
          setLoading(false);
        } else if (event === 'INITIAL_SESSION' && !session) {
          // Nenhuma sessão salva — usuário não está logado
          setLoading(false);
        }
      }
    );

    // Fallback: se o listener não disparar em 4s (edge case raro),
    // finalizamos loading para não travar a tela
    const fallbackTimer = setTimeout(() => {
      if (!ignore) setLoading(false);
    }, 4000);

    return () => {
      ignore = true;
      clearTimeout(fallbackTimer);
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  // ── Login ────────────────────────────────────────────────

  async function login(email: string, password: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { data: authData, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return { success: false, error: error.message };

      // ── IP restriction check ───────────────────────────
      if (authData.user) {
        const { data: profile } = await (supabase as any)
          .from('profiles')
          .select('allowed_ips')
          .eq('id', authData.user.id)
          .single();

        const allowedIps: string[] | null = profile?.allowed_ips;

        if (allowedIps && allowedIps.length > 0) {
          // Fetch current public IP
          let currentIp = '';
          try {
            const ipRes = await fetch('https://api.ipify.org?format=json');
            const ipData = await ipRes.json();
            currentIp = ipData.ip;
          } catch {
            try {
              const ipRes = await fetch('https://ifconfig.me/ip');
              currentIp = (await ipRes.text()).trim();
            } catch { /* cannot detect */ }
          }

          if (!currentIp || !allowedIps.includes(currentIp)) {
            // IP not allowed — sign out immediately
            await supabase.auth.signOut();
            return {
              success: false,
              error: `Acesso bloqueado: seu IP (${currentIp || 'desconhecido'}) não está na lista de IPs autorizados.`,
            };
          }
        }
      }

      // O profile é carregado pelo listener onAuthStateChange('SIGNED_IN')
      // para evitar fetch duplicado.
      return { success: true };
    } catch {
      return { success: false, error: 'Erro de conexão. Verifique sua internet.' };
    }
  }

  // ── Registro ─────────────────────────────────────────────

  async function register(
    email: string,
    password: string,
    name: string,
    role: UserRole = 'comercial'
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { name, role } },
      });
      if (error) return { success: false, error: error.message };
      if (data.user) return { success: true };
      return { success: false, error: 'Erro ao criar conta.' };
    } catch {
      return { success: false, error: 'Erro de conexão.' };
    }
  }

  // ── Logout ───────────────────────────────────────────────

  async function logout() {
    try {
      if (user?.id) {
        const { data: func } = await supabase
          .from('funcionarios')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle();
        if (func) {
          // Fecha todas as sessões abertas deste funcionário
          const agora = new Date();
          const { data: abertas } = await supabase
            .from('sessoes_atividade')
            .select('id, inicio')
            .eq('funcionario_id', func.id)
            .is('fim', null);
          if (abertas && abertas.length > 0) {
            for (const s of abertas) {
              const dur = Math.round((agora.getTime() - new Date(s.inicio).getTime()) / 60000);
              await supabase.from('sessoes_atividade').update({ fim: agora.toISOString(), duracao: dur }).eq('id', s.id);
            }
          }
          // Marca offline
          await supabase.from('funcionarios').update({ status: 'offline', ultima_atividade: agora.toISOString() }).eq('id', func.id);
        }
      }
      await supabase.auth.signOut({ scope: 'local' });
    } catch {
      // best-effort
    } finally {
      setUser(null);
    }
  }

  // ── Update Profile ───────────────────────────────────────

  async function updateProfile(data: Partial<Pick<AuthUser, 'name' | 'avatar'>>) {
    if (!user) return;
    const updates: Record<string, unknown> = {};
    if (data.name) updates.name = data.name;
    if (data.avatar) updates.avatar_url = data.avatar;
    await supabase.from('profiles').update(updates).eq('id', user.id);
    setUser((prev) => prev ? { ...prev, ...data } : null);
  }

  // ── Provider ─────────────────────────────────────────────

  return (
    <AuthContext.Provider
      value={{ user, loading, isAuthenticated: !!user, login, register, logout, updateProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

/** Usuário unificado (funciona com mock e Supabase) */
