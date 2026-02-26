/**
 * @module parcelasService
 * @description Serviço CRUD para parcelas via Supabase.
 *
 * Suporta fallback para mock data quando Supabase não está configurado.
 *
 * @see database.types para tipagem completa
 */
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { mockParcelas } from '../lib/mockData';
import type {
  Parcela,
  ParcelaInsert,
  ParcelaUpdate,
  ParcelaComCliente,
} from '../lib/database.types';

// ── Adaptador mock → DB types ──────────────────────────────

function adaptMockParcela(mock: (typeof mockParcelas)[0]): Parcela {
  return {
    id: mock.id,
    emprestimo_id: mock.emprestimoId,
    cliente_id: mock.clienteId,
    numero: mock.numero,
    valor: mock.valor,
    valor_original: mock.valorOriginal,
    data_vencimento: mock.dataVencimento,
    data_pagamento: mock.dataPagamento ?? null,
    status: mock.status,
    juros: mock.juros,
    multa: mock.multa,
    desconto: mock.desconto,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

// ── Queries ────────────────────────────────────────────────

/** Buscar todas as parcelas com nome do cliente */
export async function getParcelas(status?: string): Promise<ParcelaComCliente[]> {
  if (!isSupabaseConfigured()) {
    let data = mockParcelas;
    if (status) data = data.filter((p) => p.status === status);
    return data.map((p) => ({
      ...adaptMockParcela(p),
      clientes: { nome: p.clienteNome },
    }));
  }

  let query = supabase
    .from('parcelas')
    .select('*, clientes(nome)')
    .order('data_vencimento');

  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as ParcelaComCliente[];
}

/** Buscar parcelas de um empréstimo específico */
export async function getParcelasByEmprestimo(emprestimoId: string): Promise<Parcela[]> {
  if (!isSupabaseConfigured()) {
    return mockParcelas
      .filter((p) => p.emprestimoId === emprestimoId)
      .map(adaptMockParcela);
  }

  const { data, error } = await supabase
    .from('parcelas')
    .select('*')
    .eq('emprestimo_id', emprestimoId)
    .order('numero');

  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Buscar parcelas de um cliente */
export async function getParcelasByCliente(clienteId: string): Promise<ParcelaComCliente[]> {
  if (!isSupabaseConfigured()) {
    return mockParcelas
      .filter((p) => p.clienteId === clienteId)
      .map((p) => ({
        ...adaptMockParcela(p),
        clientes: { nome: p.clienteNome },
      }));
  }

  const { data, error } = await supabase
    .from('parcelas')
    .select('*, clientes(nome)')
    .eq('cliente_id', clienteId)
    .order('data_vencimento');

  if (error) throw new Error(error.message);
  return (data ?? []) as ParcelaComCliente[];
}

/** Buscar parcelas vencidas (para Kanban de cobrança) */
export async function getParcelasVencidas(): Promise<ParcelaComCliente[]> {
  return getParcelas('vencida');
}

// ── Mutations ──────────────────────────────────────────────

/** Criar parcela */
export async function createParcela(parcela: ParcelaInsert): Promise<Parcela> {
  if (!isSupabaseConfigured()) {
    throw new Error('CRUD real requer Supabase configurado');
  }

  const { data, error } = await supabase
    .from('parcelas')
    .insert(parcela)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/** Atualizar parcela (ex: registrar pagamento, aplicar desconto) */
export async function updateParcela(id: string, updates: ParcelaUpdate): Promise<Parcela> {
  if (!isSupabaseConfigured()) {
    throw new Error('CRUD real requer Supabase configurado');
  }

  const { data, error } = await supabase
    .from('parcelas')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/** Registrar pagamento de uma parcela */
export async function registrarPagamento(
  id: string,
  dataPagamento: string,
  desconto?: number
): Promise<Parcela> {
  const updates: ParcelaUpdate = {
    status: 'paga',
    data_pagamento: dataPagamento,
  };
  if (desconto !== undefined) {
    updates.desconto = desconto;
  }
  return updateParcela(id, updates);
}
