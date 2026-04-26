/**
 * @module emprestimosService
 * @description Serviço CRUD para empréstimos via Supabase.
 *
 * @see database.types para tipagem completa
 */
import { supabase } from '../lib/supabase';
import type {
  Emprestimo,
  EmprestimoInsert,
  EmprestimoUpdate,
  EmprestimoComCliente,
} from '../lib/database.types';
// ── Queries ────────────────────────────────────────────────

/** Buscar todos os empréstimos com nome do cliente.
 *  Usa range explícito para evitar o limite default de 1000 linhas do PostgREST. */
export async function getEmprestimos(status?: string): Promise<EmprestimoComCliente[]> {
  let query = supabase
    .from('emprestimos')
    .select('*, clientes(nome)')
    .order('created_at', { ascending: false })
    .range(0, 49999);

  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as EmprestimoComCliente[];
}

/** Buscar empréstimos de um cliente específico */
export async function getEmprestimosByCliente(clienteId: string): Promise<Emprestimo[]> {

  const { data, error } = await supabase
    .from('emprestimos')
    .select('*')
    .eq('cliente_id', clienteId)
    .order('data_contrato', { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Buscar empréstimo por ID */
export async function getEmprestimoById(id: string): Promise<EmprestimoComCliente | null> {
  const { data, error } = await supabase
    .from('emprestimos')
    .select('*, clientes(nome)')
    .eq('id', id)
    .single();

  if (error) throw new Error(error.message);
  return data as EmprestimoComCliente;
}

// ── Mutations ──────────────────────────────────────────────

/** Criar novo empréstimo */
export async function createEmprestimo(emprestimo: EmprestimoInsert): Promise<Emprestimo> {

  const { data, error } = await supabase
    .from('emprestimos')
    .insert(emprestimo)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/** Atualizar empréstimo */
export async function updateEmprestimo(id: string, updates: EmprestimoUpdate): Promise<Emprestimo> {

  const { data, error } = await supabase
    .from('emprestimos')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/** Quitar empréstimo: atualiza status, dá baixa em todas as parcelas pendentes e remove card do kanban */
export async function quitarEmprestimo(id: string, totalParcelas: number): Promise<void> {
  // 1) Marcar empréstimo como quitado
  const { error: empErr } = await supabase
    .from('emprestimos')
    .update({ status: 'quitado', parcelas_pagas: totalParcelas })
    .eq('id', id);
  if (empErr) throw new Error(empErr.message);

  // 2) Dar baixa em todas as parcelas pendentes/vencidas deste empréstimo
  const hoje = new Date().toISOString().slice(0, 10);
  const { error: parcErr } = await supabase
    .from('parcelas')
    .update({ status: 'paga', data_pagamento: hoje })
    .eq('emprestimo_id', id)
    .in('status', ['pendente', 'vencida']);
  if (parcErr) throw new Error(parcErr.message);

  // 3) Buscar cliente_id para remover card do kanban
  const { data: emp } = await supabase
    .from('emprestimos')
    .select('cliente_id')
    .eq('id', id)
    .single();

  if (emp?.cliente_id) {
    // Verificar se o cliente tem outros empréstimos ativos/inadimplentes
    const { data: outros } = await supabase
      .from('emprestimos')
      .select('id')
      .eq('cliente_id', emp.cliente_id)
      .in('status', ['ativo', 'inadimplente'])
      .neq('id', id)
      .limit(1);

    // Se não tem mais dívidas, remover card do kanban
    if (!outros || outros.length === 0) {
      await supabase
        .from('kanban_cobranca')
        .delete()
        .eq('cliente_id', emp.cliente_id);
    }
  }
}

/** Excluir empréstimo */
export async function deleteEmprestimo(id: string): Promise<void> {

  const { error } = await supabase
    .from('emprestimos')
    .delete()
    .eq('id', id);

  if (error) throw new Error(error.message);
}
