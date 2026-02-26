/**
 * @module clientesService
 * @description Serviço CRUD para clientes via Supabase.
 *
 * Quando Supabase está configurado, faz queries reais ao banco.
 * Caso contrário, retorna dados mock para desenvolvimento.
 *
 * @see database.types para tipagem completa
 */
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { mockClientes } from '../lib/mockData';
import type {
  Cliente,
  ClienteInsert,
  ClienteUpdate,
  ClienteComIndicados,
} from '../lib/database.types';

// ── Adaptador mock → DB types ──────────────────────────────

function adaptMockCliente(mock: (typeof mockClientes)[0]): Cliente {
  return {
    id: mock.id,
    nome: mock.nome,
    email: mock.email,
    telefone: mock.telefone,
    cpf: mock.cpf ?? null,
    sexo: mock.sexo,
    data_nascimento: mock.dataNascimento ?? null,
    endereco: mock.endereco ?? null,
    status: mock.status,
    valor: mock.valor,
    vencimento: mock.vencimento,
    dias_atraso: mock.diasAtraso ?? 0,
    ultimo_contato: mock.ultimoContato ?? null,
    limite_credito: mock.limiteCredito,
    credito_utilizado: mock.creditoUtilizado,
    score_interno: mock.scoreInterno,
    bonus_acumulado: mock.bonusAcumulado,
    grupo: mock.grupo ?? null,
    indicado_por: mock.indicadoPor ?? null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

// ── Queries ────────────────────────────────────────────────

/** Buscar todos os clientes, opcionalmente filtrados por status */
export async function getClientes(status?: string): Promise<Cliente[]> {
  if (!isSupabaseConfigured()) {
    let data = mockClientes.map(adaptMockCliente);
    if (status) data = data.filter((c) => c.status === status);
    return data;
  }

  let query = supabase.from('clientes').select('*').order('nome');
  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Buscar um cliente por ID */
export async function getClienteById(id: string): Promise<Cliente | null> {
  if (!isSupabaseConfigured()) {
    const mock = mockClientes.find((c) => c.id === id);
    return mock ? adaptMockCliente(mock) : null;
  }

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
  if (!isSupabaseConfigured()) {
    const mock = mockClientes.find((c) => c.id === id);
    if (!mock) return null;

    const indicados = (mock.indicou ?? [])
      .map((indId) => mockClientes.find((c) => c.id === indId))
      .filter(Boolean)
      .map((c) => ({ id: c!.id, nome: c!.nome, status: c!.status }));

    return { ...adaptMockCliente(mock), indicados };
  }

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
  if (!isSupabaseConfigured()) {
    const mock = mockClientes.find((c) => c.id === clienteId);
    return (mock?.indicou ?? [])
      .map((indId) => mockClientes.find((c) => c.id === indId))
      .filter(Boolean)
      .map((c) => ({ id: c!.id, nome: c!.nome, status: c!.status }));
  }

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
  if (!isSupabaseConfigured()) {
    throw new Error('CRUD real requer Supabase configurado');
  }

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
  if (!isSupabaseConfigured()) {
    throw new Error('CRUD real requer Supabase configurado');
  }

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
  if (!isSupabaseConfigured()) {
    throw new Error('CRUD real requer Supabase configurado');
  }

  const { error } = await supabase
    .from('clientes')
    .delete()
    .eq('id', id);

  if (error) throw new Error(error.message);
}

/** Buscar estatísticas dos clientes (para dashboard) */
export async function getClienteStats() {
  if (!isSupabaseConfigured()) {
    const clientes = mockClientes;
    return {
      total: clientes.length,
      em_dia: clientes.filter((c) => c.status === 'em_dia').length,
      a_vencer: clientes.filter((c) => c.status === 'a_vencer').length,
      vencido: clientes.filter((c) => c.status === 'vencido').length,
      totalCarteira: clientes.reduce((sum, c) => sum + c.valor, 0),
    };
  }

  const { data, error } = await supabase.rpc('get_dashboard_stats');
  if (error) throw new Error(error.message);
  return data;
}
