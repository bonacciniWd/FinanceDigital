/**
 * @module clientesService
 * @description Serviço CRUD para clientes via Supabase.
 *
 * @see database.types para tipagem completa
 */
import { supabase } from '../lib/supabase';
import type {
  Cliente,
  ClienteInsert,
  ClienteUpdate,
  ClienteComIndicados,
} from '../lib/database.types';
// ── Queries ────────────────────────────────────────────────

/** Buscar todos os clientes com empréstimos ATIVOS/INADIMPLENTES embarcados,
 *  opcionalmente filtrados por status do cliente.
 *
 *  Performance: o embed `emprestimos(...)` filtra por status='ativo'|'inadimplente'
 *  via PostgREST embedded resource filter (`emprestimos.status=in.(...)`), o que
 *  reduz o payload de ~10mil empréstimos para apenas os relevantes (~centenas).
 *  Pagina em chunks de 1000 para contornar o `db-max-rows`. */
export async function getClientes(status?: string) {
  const PAGE = 1000;
  const all: any[] = [];

  for (let from = 0; ; from += PAGE) {
    let query = supabase
      .from('clientes')
      .select('*, emprestimos(id, valor, parcelas, parcelas_pagas, proximo_vencimento, status)')
      // ⚡ filtra a coleção embarcada (não o pai): clientes sem empréstimo ativo
      // continuam aparecendo, mas com `emprestimos: []`.
      .in('emprestimos.status', ['ativo', 'inadimplente'])
      .order('nome')
      .range(from, from + PAGE - 1);
    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
  }

  return all;
}

/** Buscar um cliente por ID */
export async function getClienteById(id: string): Promise<Cliente | null> {

  const { data, error } = await supabase
    .from('clientes')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/** Buscar cliente com seus indicados (rede de indicações) */
export async function getClienteComIndicados(id: string): Promise<ClienteComIndicados | null> {
  const { data: cliente, error } = await supabase
    .from('clientes')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw new Error(error.message);
  if (!cliente) return null;

  const { data: indicados } = await supabase
    .from('clientes')
    .select('id, nome, status')
    .eq('indicado_por', id);

  return { ...cliente, indicados: indicados ?? [] };
}

/** Buscar indicados de um cliente */
export async function getIndicados(clienteId: string): Promise<Pick<Cliente, 'id' | 'nome' | 'status'>[]> {
  const { data, error } = await supabase
    .from('clientes')
    .select('id, nome, status')
    .eq('indicado_por', clienteId);

  if (error) throw new Error(error.message);
  return data ?? [];
}

// ── Mutations ──────────────────────────────────────────────

/** Criar novo cliente */
export async function createCliente(cliente: ClienteInsert): Promise<Cliente> {

  const { data, error } = await supabase
    .from('clientes')
    .insert(cliente)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/** Atualizar cliente existente */
export async function updateCliente(id: string, updates: ClienteUpdate): Promise<Cliente> {

  const { data, error } = await supabase
    .from('clientes')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/** Excluir cliente */
export async function deleteCliente(id: string): Promise<void> {

  const { error } = await supabase
    .from('clientes')
    .delete()
    .eq('id', id);

  if (error) throw new Error(error.message);
}

/** Buscar estatísticas dos clientes (para dashboard) */
export async function getClienteStats() {
  const { data, error } = await supabase.rpc('get_dashboard_stats');
  if (error) throw new Error(error.message);
  return data;
}
