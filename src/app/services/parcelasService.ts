/**
 * @module parcelasService
 * @description Serviço CRUD para parcelas via Supabase.
 *
 * @see database.types para tipagem completa
 */
import { supabase } from '../lib/supabase';
import type {
  Parcela,
  ParcelaInsert,
  ParcelaUpdate,
  ParcelaComCliente,
} from '../lib/database.types';
// ── Queries ────────────────────────────────────────────────

/** Buscar todas as parcelas com nome do cliente */
export async function getParcelas(status?: string): Promise<ParcelaComCliente[]> {
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

  const { data, error } = await supabase
    .from('parcelas')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/**
 * Recalcular parcelas_pagas, proximo_vencimento e status de um empréstimo
 * a partir do estado real das parcelas no banco.
 *
 * Regras de status:
 * - Todas pagas → 'quitado'
 * - Alguma vencida → 'inadimplente'
 * - Caso contrário → 'ativo'
 */
export async function syncEmprestimoStatus(emprestimoId: string): Promise<void> {
  const { data: todasParcelas } = await supabase
    .from('parcelas')
    .select('status, data_vencimento')
    .eq('emprestimo_id', emprestimoId)
    .order('data_vencimento');

  if (!todasParcelas || todasParcelas.length === 0) return;

  const pagas = todasParcelas.filter(p => p.status === 'paga').length;
  const vencidas = todasParcelas.filter(p => p.status === 'vencida').length;
  const total = todasParcelas.length;
  const proximaPendente = todasParcelas.find(p => p.status === 'pendente' || p.status === 'vencida');

  const empUpdate: Record<string, unknown> = { parcelas_pagas: pagas };

  if (proximaPendente) {
    empUpdate.proximo_vencimento = proximaPendente.data_vencimento;
  }

  // Determinar status correto
  if (pagas >= total) {
    empUpdate.status = 'quitado';
  } else if (vencidas > 0) {
    empUpdate.status = 'inadimplente';
  } else {
    empUpdate.status = 'ativo';
  }

  await supabase
    .from('emprestimos')
    .update(empUpdate)
    .eq('id', emprestimoId);
}

/** Registrar pagamento de uma parcela e atualizar o empréstimo */
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
  const parcela = await updateParcela(id, updates);

  if (parcela.emprestimo_id) {
    await syncEmprestimoStatus(parcela.emprestimo_id);
  }

  return parcela;
}
