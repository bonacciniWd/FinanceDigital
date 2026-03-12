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

/** Buscar todos os clientes, opcionalmente filtrados por status */
export async function getClientes(status?: string): Promise<Cliente[]> {

  let query = supabase.from('clientes').select('*').order('nome');
  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
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
