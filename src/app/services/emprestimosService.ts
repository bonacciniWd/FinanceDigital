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

/** Buscar todos os empréstimos com nome do cliente */
export async function getEmprestimos(status?: string): Promise<EmprestimoComCliente[]> {
  let query = supabase
    .from('emprestimos')
    .select('*, clientes(nome)')
    .order('created_at', { ascending: false });

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

/** Excluir empréstimo */
export async function deleteEmprestimo(id: string): Promise<void> {

  const { error } = await supabase
    .from('emprestimos')
    .delete()
    .eq('id', id);

  if (error) throw new Error(error.message);
}
