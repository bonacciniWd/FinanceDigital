/**
 * @module adminUsersService
 * @description Serviço para gerenciamento de usuários (admin only).
 *
 * Usa Edge Functions para operações que requerem service_role:
 * - invite-user: criar novo usuário
 * - update-user-role: alterar papel
 * - delete-user: excluir usuário
 *
 * Listagem de profiles usa query direta (RLS permite admin ver todos).
 */
import { supabase } from '../lib/supabase';
import type { Profile } from '../lib/database.types';
import { FunctionsHttpError, FunctionsFetchError } from '@supabase/supabase-js';

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

// ── Queries ────────────────────────────────────────────────

/** Buscar todos os usuários (profiles) */
export async function getUsers(): Promise<AdminUser[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}

// ── Helpers ────────────────────────────────────────────────

/** Extrai mensagem de erro legível de uma FunctionsHttpError */
async function extractErrorMessage(error: unknown): Promise<string> {
  if (error instanceof FunctionsFetchError) {
    return 'Falha na conexão com o servidor. Verifique sua internet e tente novamente.';
  }
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await error.context.json();
      return body?.error ?? 'Erro desconhecido na Edge Function';
    } catch {
      return 'Edge Function retornou erro sem detalhes';
    }
  }
  if (error instanceof Error) return error.message;
  return 'Erro desconhecido';
}

// ── Mutations (via Edge Functions) ─────────────────────────

/** Criar novo usuário (chama Edge Function invite-user) */
export async function createUser(payload: {
  email: string;
  password: string;
  name: string;
  role: string;
}): Promise<{ success: boolean; error?: string; user?: AdminUser }> {
  const { data, error } = await supabase.functions.invoke('invite-user', {
    body: payload,
  });

  if (error) {
    const msg = await extractErrorMessage(error);
    return { success: false, error: msg };
  }

  if (data?.error) {
    return { success: false, error: data.error };
  }

  return { success: true, user: data.user };
}

/** Alterar role de um usuário */
export async function updateUserRole(
  userId: string,
  role: string
): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.functions.invoke('update-user-role', {
    body: { userId, role },
  });

  if (error) {
    const msg = await extractErrorMessage(error);
    return { success: false, error: msg };
  }
  if (data?.error) return { success: false, error: data.error };

  return { success: true };
}

/** Excluir usuário */
export async function deleteUser(
  userId: string
): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.functions.invoke('delete-user', {
    body: { userId },
  });

  if (error) {
    const msg = await extractErrorMessage(error);
    return { success: false, error: msg };
  }
  if (data?.error) return { success: false, error: data.error };

  return { success: true };
}

/** Atualizar nome do usuário (direto na tabela profiles) */
export async function updateUserName(
  userId: string,
  name: string
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from('profiles')
    .update({ name, updated_at: new Date().toISOString() })
    .eq('id', userId);

  if (error) return { success: false, error: error.message };
  return { success: true };
}
