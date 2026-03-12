/**
 * @module useEtiquetas
 * @description Hooks para etiquetas (tags) de conversas e vinculação conversa ↔ cliente.
 *
 * Tabelas: etiquetas, conversa_etiquetas, conversa_cliente
 * @see migration 006_etiquetas_conversa_cliente.sql
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

// ── Types ────────────────────────────────────────────────
export interface Etiqueta {
  id: string;
  nome: string;
  cor: string;
  descricao?: string | null;
  created_at: string;
}

export interface ConversaEtiqueta {
  id: string;
  telefone: string;
  instancia_id: string;
  etiqueta_id: string;
  etiqueta?: Etiqueta;
  created_at: string;
}

export interface ConversaCliente {
  telefone: string;
  instancia_id: string;
  cliente_id: string;
  cliente?: {
    id: string;
    nome: string;
    email: string;
    telefone: string;
    status: string;
    score_interno: number;
  };
  created_at: string;
}

// ── Query Keys ───────────────────────────────────────────
const ETIQUETAS_KEY = 'etiquetas';
const CONVERSA_ETIQUETAS_KEY = 'conversa-etiquetas';
const CONVERSA_CLIENTE_KEY = 'conversa-cliente';

// ── Listar todas as etiquetas ────────────────────────────
export function useEtiquetas() {
  return useQuery({
    queryKey: [ETIQUETAS_KEY],
    queryFn: async (): Promise<Etiqueta[]> => {
      const { data, error } = await (supabase as any)
        .from('etiquetas')
        .select('*')
        .order('nome');
      if (error) throw error;
      return data ?? [];
    },
  });
}

// ── CRUD de etiquetas ────────────────────────────────────
export function useCreateEtiqueta() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { nome: string; cor: string; descricao?: string }) => {
      const { data, error } = await (supabase as any)
        .from('etiquetas')
        .insert(params)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ETIQUETAS_KEY] });
    },
  });
}

export function useUpdateEtiqueta() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...params }: { id: string; nome?: string; cor?: string; descricao?: string }) => {
      const { error } = await (supabase as any)
        .from('etiquetas')
        .update(params)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ETIQUETAS_KEY] });
    },
  });
}

export function useDeleteEtiqueta() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from('etiquetas')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ETIQUETAS_KEY] });
      queryClient.invalidateQueries({ queryKey: [CONVERSA_ETIQUETAS_KEY] });
    },
  });
}

// ── Etiquetas de uma instância (todas as conversas) ──────
export function useConversaEtiquetas(instanciaId?: string) {
  return useQuery({
    queryKey: [CONVERSA_ETIQUETAS_KEY, instanciaId],
    queryFn: async (): Promise<ConversaEtiqueta[]> => {
      const { data, error } = await (supabase as any)
        .from('conversa_etiquetas')
        .select('*, etiqueta:etiquetas(*)')
        .eq('instancia_id', instanciaId!);
      if (error) throw error;
      // Achatar a relação joined
      return (data ?? []).map((row: Record<string, unknown>) => ({
        id: row.id as string,
        telefone: row.telefone as string,
        instancia_id: row.instancia_id as string,
        etiqueta_id: row.etiqueta_id as string,
        etiqueta: row.etiqueta as Etiqueta,
        created_at: row.created_at as string,
      }));
    },
    enabled: !!instanciaId,
  });
}

// ── Adicionar/Remover etiqueta de uma conversa ───────────
export function useToggleConversaEtiqueta() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      telefone: string;
      instancia_id: string;
      etiqueta_id: string;
      action: 'add' | 'remove';
    }) => {
      if (params.action === 'add') {
        const { error } = await (supabase as any)
          .from('conversa_etiquetas')
          .insert({
            telefone: params.telefone,
            instancia_id: params.instancia_id,
            etiqueta_id: params.etiqueta_id,
          });
        if (error && !error.message.includes('duplicate')) throw error;
      } else {
        const { error } = await (supabase as any)
          .from('conversa_etiquetas')
          .delete()
          .eq('telefone', params.telefone)
          .eq('instancia_id', params.instancia_id)
          .eq('etiqueta_id', params.etiqueta_id);
        if (error) throw error;
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [CONVERSA_ETIQUETAS_KEY, variables.instancia_id] });
    },
  });
}

// ── Clientes vinculados a conversas (por instância) ──────
export function useConversaClientes(instanciaId?: string) {
  return useQuery({
    queryKey: [CONVERSA_CLIENTE_KEY, instanciaId],
    queryFn: async (): Promise<ConversaCliente[]> => {
      const { data, error } = await (supabase as any)
        .from('conversa_cliente')
        .select('*, cliente:clientes(id, nome, email, telefone, status, score_interno)')
        .eq('instancia_id', instanciaId!);
      if (error) throw error;
      return (data ?? []).map((row: Record<string, unknown>) => ({
        telefone: row.telefone as string,
        instancia_id: row.instancia_id as string,
        cliente_id: row.cliente_id as string,
        cliente: row.cliente as ConversaCliente['cliente'],
        created_at: row.created_at as string,
      }));
    },
    enabled: !!instanciaId,
  });
}

// ── Vincular / desvincular cliente ↔ conversa ────────────
export function useVincularCliente() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      telefone: string;
      instancia_id: string;
      cliente_id: string;
    }) => {
      const { error } = await (supabase as any)
        .from('conversa_cliente')
        .upsert({
          telefone: params.telefone,
          instancia_id: params.instancia_id,
          cliente_id: params.cliente_id,
        }, { onConflict: 'telefone,instancia_id' });
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [CONVERSA_CLIENTE_KEY, variables.instancia_id] });
    },
  });
}

export function useDesvincularCliente() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { telefone: string; instancia_id: string }) => {
      const { error } = await (supabase as any)
        .from('conversa_cliente')
        .delete()
        .eq('telefone', params.telefone)
        .eq('instancia_id', params.instancia_id);
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [CONVERSA_CLIENTE_KEY, variables.instancia_id] });
    },
  });
}
