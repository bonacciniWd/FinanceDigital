/**
 * @module emprestimosService
 * @description Serviço CRUD para empréstimos via Supabase.
 *
 * Suporta fallback para mock data quando Supabase não está configurado.
 *
 * @see database.types para tipagem completa
 */
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { mockEmprestimos, mockClientes } from '../lib/mockData';
import type {
  Emprestimo,
  EmprestimoInsert,
  EmprestimoUpdate,
  EmprestimoComCliente,
} from '../lib/database.types';

// ── Adaptador mock → DB types ──────────────────────────────

function adaptMockEmprestimo(mock: (typeof mockEmprestimos)[0]): Emprestimo {
  return {
    id: mock.id,
    cliente_id: mock.clienteId,
    valor: mock.valor,
    parcelas: mock.parcelas,
    parcelas_pagas: mock.parcelasPagas,
    valor_parcela: mock.valorParcela,
    taxa_juros: mock.taxaJuros,
    data_contrato: mock.dataContrato,
    proximo_vencimento: mock.proximoVencimento,
    status: mock.status,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

// ── Queries ────────────────────────────────────────────────

/** Buscar todos os empréstimos com nome do cliente */
export async function getEmprestimos(status?: string): Promise<EmprestimoComCliente[]> {
  if (!isSupabaseConfigured()) {
    let data = mockEmprestimos;
    if (status) data = data.filter((e) => e.status === status);
    return data.map((e) => ({
      ...adaptMockEmprestimo(e),
      clientes: { nome: e.clienteNome ?? mockClientes.find((c) => c.id === e.clienteId)?.nome ?? '' },
    }));
  }

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
  if (!isSupabaseConfigured()) {
    return mockEmprestimos
      .filter((e) => e.clienteId === clienteId)
      .map(adaptMockEmprestimo);
  }

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
  if (!isSupabaseConfigured()) {
    const mock = mockEmprestimos.find((e) => e.id === id);
    if (!mock) return null;
    return {
      ...adaptMockEmprestimo(mock),
      clientes: { nome: mock.clienteNome ?? '' },
    };
  }

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
  if (!isSupabaseConfigured()) {
    throw new Error('CRUD real requer Supabase configurado');
  }

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
  if (!isSupabaseConfigured()) {
    throw new Error('CRUD real requer Supabase configurado');
  }

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
  if (!isSupabaseConfigured()) {
    throw new Error('CRUD real requer Supabase configurado');
  }

  const { error } = await supabase
    .from('emprestimos')
    .delete()
    .eq('id', id);

  if (error) throw new Error(error.message);
}
