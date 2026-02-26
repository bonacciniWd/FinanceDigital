/**
 * @module AuthContext
 * @description Contexto de autenticação integrado com Supabase Auth.
 *
 * Quando o Supabase está configurado (variáveis de ambiente definidas),
 * usa autenticação real com email/senha via Supabase Auth.
 * Caso contrário, faz fallback para os dados mock (desenvolvimento).
 *
 * Provider escuta `onAuthStateChange` para manter sessão atualizada.
 * Profile do usuário (name, role) é carregado da tabela `profiles`.
 *
 * @example
 * ```tsx
 * const { user, login, logout, register, isAuthenticated, loading } = useAuth();
 * ```
 */
import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import type { Profile, UserRole } from '../lib/database.types';
import type { User as MockUser } from '../lib/mockData';
import { mockUsers } from '../lib/mockData';

/** Usuário unificado (funciona com mock e Supabase) */
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

/**
 * Provider de autenticação. Detecta automaticamente se Supabase
 * está configurado e usa o modo apropriado.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const useSupabase = isSupabaseConfigured();

  // ── Helpers ──────────────────────────────────────────────

  const fetchProfile = useCallback(async (userId: string): Promise<Profile | null> => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('Erro ao buscar profile:', error);
      return null;
    }
    return data;
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

  function mockUserToAuthUser(mockUser: MockUser): AuthUser {
    return {
      id: mockUser.id,
      name: mockUser.name,
      email: mockUser.email,
      role: mockUser.role,
      avatar: mockUser.avatar,
    };
  }

  // ── Inicialização ────────────────────────────────────────

  useEffect(() => {
    if (useSupabase) {
      // Supabase Auth
      let ignore = false;

      async function init() {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (!ignore && session?.user) {
            const profile = await fetchProfile(session.user.id);
            if (profile) setUser(profileToAuthUser(profile));
          }
        } catch (error) {
          console.error('Erro ao inicializar Supabase Auth:', error);
        } finally {
          if (!ignore) setLoading(false);
        }
      }

      init();

      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        async (event, session) => {
          if (event === 'SIGNED_IN' && session?.user) {
            const profile = await fetchProfile(session.user.id);
            if (profile) setUser(profileToAuthUser(profile));
          } else if (event === 'SIGNED_OUT') {
            setUser(null);
          }
        }
      );

      return () => {
        ignore = true;
        subscription.unsubscribe();
      };
    } else {
      // Mock Auth (localStorage)
      const savedUser = localStorage.getItem('fintechflow_user');
      if (savedUser) {
        try {
          setUser(mockUserToAuthUser(JSON.parse(savedUser)));
        } catch {
          localStorage.removeItem('fintechflow_user');
        }
      }
      setLoading(false);
    }
  }, [useSupabase, fetchProfile]);

  // ── Login ────────────────────────────────────────────────

  async function login(
    email: string,
    password: string
  ): Promise<{ success: boolean; error?: string }> {
    if (useSupabase) {
      try {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) return { success: false, error: error.message };
        if (data.user) {
          const profile = await fetchProfile(data.user.id);
          if (profile) {
            setUser(profileToAuthUser(profile));
            return { success: true };
          }
          return { success: false, error: 'Perfil não encontrado' };
        }
        return { success: false, error: 'Erro desconhecido' };
      } catch {
        return { success: false, error: 'Erro de conexão' };
      }
    }

    // Mock login
    const foundUser = mockUsers.find((u) => u.email === email);
    if (foundUser) {
      const authUser = mockUserToAuthUser(foundUser);
      setUser(authUser);
      localStorage.setItem('fintechflow_user', JSON.stringify(foundUser));
      return { success: true };
    }
    return { success: false, error: 'Usuário não encontrado' };
  }

  // ── Registro ─────────────────────────────────────────────

  async function register(
    email: string,
    password: string,
    name: string,
    role: UserRole = 'comercial'
  ): Promise<{ success: boolean; error?: string }> {
    if (!useSupabase) {
      return { success: false, error: 'Registro disponível apenas com Supabase configurado' };
    }
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { name, role } },
      });
      if (error) return { success: false, error: error.message };
      if (data.user) return { success: true };
      return { success: false, error: 'Erro ao criar conta' };
    } catch {
      return { success: false, error: 'Erro de conexão' };
    }
  }

  // ── Logout ───────────────────────────────────────────────

  async function logout() {
    if (useSupabase) {
      await supabase.auth.signOut();
    }
    setUser(null);
    localStorage.removeItem('fintechflow_user');
  }

  // ── Update Profile ───────────────────────────────────────

  async function updateProfile(data: Partial<Pick<AuthUser, 'name' | 'avatar'>>) {
    if (!user) return;
    if (useSupabase) {
      const updates: Record<string, unknown> = {};
      if (data.name) updates.name = data.name;
      if (data.avatar) updates.avatar_url = data.avatar;
      await supabase.from('profiles').update(updates).eq('id', user.id);
    }
    setUser((prev) => prev ? { ...prev, ...data } : null);
  }

  // ── Provider ─────────────────────────────────────────────

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthenticated: !!user,
        login,
        register,
        logout,
        updateProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Hook para acessar o contexto de autenticação.
 * @throws Error se usado fora do AuthProvider
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
