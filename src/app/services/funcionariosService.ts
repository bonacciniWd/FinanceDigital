/**
 * @module funcionariosService
 * @description Serviço para funcionários e monitoramento de atividade.
 *
 * @see database.types para tipagem completa
 */
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { mockFuncionarios } from '../lib/mockData';
import type { Funcionario, SessaoAtividade } from '../lib/database.types';

// ── Adaptador mock → DB types ──────────────────────────────

function adaptMockFuncionario(mock: (typeof mockFuncionarios)[0]): Funcionario {
  return {
    id: mock.id,
    user_id: mock.userId,
    nome: mock.nome,
    email: mock.email,
    role: mock.role,
    status: mock.status,
    ultimo_login: mock.ultimoLogin,
    ultima_atividade: mock.ultimaAtividade,
    horas_hoje: mock.horasHoje,
    horas_semana: mock.horasSemana,
    horas_mes: mock.horasMes,
    atividades_hoje: mock.atividadesHoje,
    meta_diaria: mock.metaDiaria,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function adaptMockSessao(mock: (typeof mockFuncionarios)[0]['sessoes'][0]): SessaoAtividade {
  return {
    id: mock.id,
    funcionario_id: mock.funcionarioId,
    inicio: mock.inicio,
    fim: mock.fim ?? null,
    duracao: mock.duracao,
    acoes: mock.acoes,
    paginas: mock.paginas,
    created_at: mock.inicio,
  };
}

// ── Queries ────────────────────────────────────────────────

/** Buscar todos os funcionários */
export async function getFuncionarios(): Promise<Funcionario[]> {
  if (!isSupabaseConfigured()) {
    return mockFuncionarios.map(adaptMockFuncionario);
  }

  const { data, error } = await supabase
    .from('funcionarios')
    .select('*')
    .order('nome');

  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Buscar funcionário por ID */
export async function getFuncionarioById(id: string): Promise<Funcionario | null> {
  if (!isSupabaseConfigured()) {
    const mock = mockFuncionarios.find((f) => f.id === id);
    return mock ? adaptMockFuncionario(mock) : null;
  }

  const { data, error } = await supabase
    .from('funcionarios')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/** Buscar funcionário pelo user_id (Supabase Auth) */
export async function getFuncionarioByUserId(userId: string): Promise<Funcionario | null> {
  if (!isSupabaseConfigured()) {
    const mock = mockFuncionarios.find((f) => f.userId === userId);
    return mock ? adaptMockFuncionario(mock) : null;
  }

  const { data, error } = await supabase
    .from('funcionarios')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/** Buscar sessões de atividade de um funcionário */
export async function getSessoesByFuncionario(funcionarioId: string): Promise<SessaoAtividade[]> {
  if (!isSupabaseConfigured()) {
    const mock = mockFuncionarios.find((f) => f.id === funcionarioId);
    return (mock?.sessoes ?? []).map(adaptMockSessao);
  }

  const { data, error } = await supabase
    .from('sessoes_atividade')
    .select('*')
    .eq('funcionario_id', funcionarioId)
    .order('inicio', { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Buscar contagens por status (para cards do monitoramento) */
export async function getFuncionarioStats() {
  if (!isSupabaseConfigured()) {
    return {
      online: mockFuncionarios.filter((f) => f.status === 'online').length,
      ausente: mockFuncionarios.filter((f) => f.status === 'ausente').length,
      offline: mockFuncionarios.filter((f) => f.status === 'offline').length,
      total: mockFuncionarios.length,
    };
  }

  const { data, error } = await supabase.from('funcionarios').select('status');
  if (error) throw new Error(error.message);

  const stats = { online: 0, ausente: 0, offline: 0, total: data?.length ?? 0 };
  data?.forEach((f) => {
    if (f.status in stats) stats[f.status as keyof typeof stats]++;
  });
  return stats;
}

// ── Mutations ──────────────────────────────────────────────

/** Atualizar status do funcionário */
export async function updateFuncionarioStatus(
  id: string,
  status: 'online' | 'offline' | 'ausente'
): Promise<void> {
  if (!isSupabaseConfigured()) return;

  const { error } = await supabase
    .from('funcionarios')
    .update({ status, ultima_atividade: new Date().toISOString() })
    .eq('id', id);

  if (error) throw new Error(error.message);
}

/** Registrar início de sessão */
export async function iniciarSessao(funcionarioId: string): Promise<SessaoAtividade> {
  if (!isSupabaseConfigured()) {
    throw new Error('Sessions requer Supabase configurado');
  }

  const { data, error } = await supabase
    .from('sessoes_atividade')
    .insert({
      funcionario_id: funcionarioId,
      inicio: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/** Finalizar sessão ativa */
export async function finalizarSessao(
  sessaoId: string,
  acoes: number,
  paginas: string[]
): Promise<void> {
  if (!isSupabaseConfigured()) return;

  const agora = new Date();
  const { data: sessao } = await supabase
    .from('sessoes_atividade')
    .select('inicio')
    .eq('id', sessaoId)
    .single();

  const duracao = sessao
    ? Math.round((agora.getTime() - new Date(sessao.inicio).getTime()) / 60000)
    : 0;

  const { error } = await supabase
    .from('sessoes_atividade')
    .update({ fim: agora.toISOString(), duracao, acoes, paginas })
    .eq('id', sessaoId);

  if (error) throw new Error(error.message);
}
