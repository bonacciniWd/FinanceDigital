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
import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
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
  ipBlockedMsg: string;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (email: string, password: string, name: string, role?: UserRole) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  updateProfile: (data: Partial<Pick<AuthUser, 'name' | 'avatar'>>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [ipBlockedMsg, setIpBlockedMsg] = useState('');

  // Flag que impede onAuthStateChange de setar o user enquanto login() está rodando
  const loginInProgressRef = useRef(false);

  // ── Helpers ──────────────────────────────────────────────

  /** Detecta IP público do usuário */
  const detectPublicIp = async (): Promise<string> => {
    try {
      const ipRes = await fetch('https://api.ipify.org?format=json');
      const ipData = await ipRes.json();
      return ipData.ip?.trim() ?? '';
    } catch {
      try {
        const ipRes = await fetch('https://ifconfig.me/ip');
        return (await ipRes.text()).trim();
      } catch {
        return '';
      }
    }
  };

  /**
   * Verifica se o IP atual é permitido pela whitelist global e pelo profile do usuário.
   * Retorna { allowed: true } ou { allowed: false, error: '...' }.
   */
  const verifyIpAccess = useCallback(async (userId: string): Promise<{ allowed: boolean; error?: string }> => {
    const isElectron = !!(window as any).electronAPI;
    if (isElectron) return { allowed: true }; // Electron has ip-guard.cjs

    const currentIp = await detectPublicIp();
    if (!currentIp) {
      console.warn('[Auth] Não foi possível detectar IP — permitindo acesso');
      return { allowed: true };
    }

    console.log('[Auth] IP detectado:', currentIp);

    // 1) Verifica whitelist global (tabela allowed_ips)
    const { data: globalIps } = await supabase
      .from('allowed_ips')
      .select('ip_address')
      .eq('active', true);

    if (globalIps && globalIps.length > 0) {
      const { data: allowed, error: rpcErr } = await supabase.rpc('check_ip_allowed', {
        check_ip: currentIp,
      });

      console.log('[Auth] check_ip_allowed RPC:', { ip: currentIp, allowed, error: rpcErr?.message });

      if (rpcErr || allowed === false) {
        return {
          allowed: false,
          error: `Acesso bloqueado: seu IP (${currentIp}) não está autorizado. Contate o administrador.`,
        };
      }
    }

    // 2) Verifica allowed_ips do profile (restrição individual)
    const { data: profileData } = await (supabase as any)
      .from('profiles')
      .select('allowed_ips')
      .eq('id', userId)
      .single();

    const profileIps: string[] | null = profileData?.allowed_ips;

    if (profileIps && profileIps.length > 0) {
      const normalizeIp = (ip: string) => (ip || '').split('/')[0].trim();
      const normalizedCurrent = normalizeIp(currentIp);
      const profileAllowed = profileIps.some((ip: string) => normalizeIp(ip) === normalizedCurrent);
      console.log('[Auth] Profile IP check:', { currentIp: normalizedCurrent, profileIps, profileAllowed });

      if (!profileAllowed) {
        return {
          allowed: false,
          error: `Acesso bloqueado: seu IP (${currentIp}) não está autorizado para sua conta. Contate o administrador.`,
        };
      }
    }

    return { allowed: true };
  }, []);

  /**
   * Busca o profile do usuário. Se não existir (trigger falhou ou conta nova),
   * cria automaticamente usando os metadados do auth.users.
   * Inclui timeout de 8s para evitar hang no Electron.
   */
  const fetchProfile = useCallback(async (userId: string, email?: string): Promise<Profile | null> => {
    console.log('[Auth] fetchProfile:', userId);

    const withTimeout = <T,>(p: PromiseLike<T>, ms: number): Promise<T> =>
      Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`timeout ${ms}ms`)), ms))]);

    try {
      const { data, error } = await withTimeout(
        supabase.from('profiles').select('*').eq('id', userId).single(),
        8000,
      );

      console.log('[Auth] fetchProfile result:', { found: !!data, error: error?.message });

      if (!error && data) return data;
    } catch (e) {
      console.error('[Auth] fetchProfile falhou:', e);
      return null;
    }

    // Profile não encontrado — cria com os dados que já temos (evita round-trip getUser)
    const fallbackEmail = email ?? '';
    const fallbackName = fallbackEmail.split('@')[0] || 'Usuário';
    const fallbackRole: UserRole = 'comercial';

    try {
      const { data: created, error: insertError } = await withTimeout(
        supabase
          .from('profiles')
          .upsert({ id: userId, name: fallbackName, email: fallbackEmail, role: fallbackRole }, { onConflict: 'id' })
          .select()
          .single(),
        8000,
      );

      if (insertError) {
        console.error('[Auth] Erro ao criar profile:', insertError);
        return null;
      }
      return created;
    } catch (e) {
      console.error('[Auth] upsert profile falhou:', e);
      return null;
    }
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

        console.log('[Auth]', event, session ? 'has session' : 'no session', 'loginInProgress:', loginInProgressRef.current);

        if (event === 'SIGNED_IN' && session?.user) {
          // Se login() está em andamento, NÃO seta o user aqui — login() fará isso
          if (loginInProgressRef.current) {
            console.log('[Auth] SIGNED_IN ignorado — login() controlará o user');
            return;
          }
          // Aguarda 200ms para verificar se login() está prestes a rodar
          // (SIGNED_IN pode disparar de sessão restaurada ANTES de login() setar a flag)
          await new Promise((r) => setTimeout(r, 200));
          if (ignore || loginInProgressRef.current) {
            console.log('[Auth] SIGNED_IN ignorado após delay — login() assumiu');
            return;
          }
          // Sessão restaurada sem login() ativo — verifica IP antes de confiar
          const ipCheck = await verifyIpAccess(session.user.id);
          if (!ipCheck.allowed) {
            console.warn('[Auth] IP bloqueado na restauração de sessão:', ipCheck.error);
            setIpBlockedMsg(ipCheck.error ?? 'IP não autorizado');
            await supabase.auth.signOut({ scope: 'local' });
            if (!ignore) setLoading(false);
            return;
          }
          const profile = await fetchProfile(session.user.id, session.user.email);
          if (!ignore && profile) setUser(profileToAuthUser(profile));
          if (!ignore) setLoading(false);
        } else if (event === 'INITIAL_SESSION' && session?.user) {
          // Sessão restaurada do localStorage — valida antes de confiar
          const expiresAt = session.expires_at ?? 0;
          const now = Math.floor(Date.now() / 1000);
          let validSession = false;

          if (expiresAt > now) {
            validSession = true;
          } else {
            // JWT expirado — aguarda o auto-refresh (até 3s)
            console.log('[Auth] JWT expirado, aguardando auto-refresh...');
            await new Promise((r) => setTimeout(r, 3000));
            if (ignore) return;
            const { data: { session: refreshed } } = await supabase.auth.getSession();
            if (refreshed?.user) {
              validSession = true;
            }
          }

          if (validSession) {
            // Verifica IP antes de restaurar sessão
            const ipCheck = await verifyIpAccess(session.user.id);
            if (!ipCheck.allowed) {
              console.warn('[Auth] IP bloqueado na restauração INITIAL_SESSION:', ipCheck.error);
              setIpBlockedMsg(ipCheck.error ?? 'IP não autorizado');
              await supabase.auth.signOut({ scope: 'local' });
              if (!ignore) setLoading(false);
              return;
            }
            const profile = await fetchProfile(session.user.id, session.user.email);
            if (!ignore && profile) setUser(profileToAuthUser(profile));
          }
          if (!ignore) setLoading(false);
        } else if (event === 'TOKEN_REFRESHED' && session?.user) {
          // Refresh silencioso bem-sucedido
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
  }, [fetchProfile, verifyIpAccess]);

  // ── Periodic IP re-check (every 5 min) ──────────────────

  useEffect(() => {
    if (!user) return;

    const IP_RECHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes

    const interval = setInterval(async () => {
      console.log('[Auth] Re-verificando IP...');
      const ipCheck = await verifyIpAccess(user.id);
      if (!ipCheck.allowed) {
        console.warn('[Auth] IP bloqueado durante sessão ativa:', ipCheck.error);
        setIpBlockedMsg(ipCheck.error ?? 'IP não autorizado');
        await supabase.auth.signOut({ scope: 'local' });
        setUser(null);
      }
    }, IP_RECHECK_INTERVAL);

    return () => clearInterval(interval);
  }, [user, verifyIpAccess]);

  // ── Login ────────────────────────────────────────────────

  async function login(email: string, password: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Marca que o login está em andamento — onAuthStateChange NÃO deve setar o user
      loginInProgressRef.current = true;
      setIpBlockedMsg('');

      const { data: authData, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        loginInProgressRef.current = false;
        return { success: false, error: error.message };
      }

      // ── IP restriction check ──
      if (authData.user) {
        const ipCheck = await verifyIpAccess(authData.user.id);
        if (!ipCheck.allowed) {
          loginInProgressRef.current = false;
          await supabase.auth.signOut({ scope: 'local' });
          return { success: false, error: ipCheck.error };
        }
      }

      // ── Seta o user manualmente ──────────
      if (authData.user) {
        console.log('[Auth] Carregando profile...');
        const profile = await fetchProfile(authData.user.id, authData.user.email ?? undefined);
        if (profile) {
          setUser(profileToAuthUser(profile));
        }
      }

      loginInProgressRef.current = false;
      setLoading(false);
      return { success: true };
    } catch (e) {
      console.error('[Auth] login error:', e);
      loginInProgressRef.current = false;
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
      value={{ user, loading, isAuthenticated: !!user, ipBlockedMsg, login, register, logout, updateProfile }}
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
