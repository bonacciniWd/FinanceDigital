/**
 * @module funcionariosService
 * @description Serviço para funcionários e monitoramento de atividade.
 *
 * @see database.types para tipagem completa
 */
import { supabase } from '../lib/supabase';
import type { Funcionario, SessaoAtividade } from '../lib/database.types';
// ── Queries ────────────────────────────────────────────────

/** Buscar todos os funcionários */
export async function getFuncionarios(): Promise<Funcionario[]> {

  const { data, error } = await supabase
    .from('funcionarios')
    .select('*')
    .order('nome');

  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Buscar funcionário por ID */
export async function getFuncionarioById(id: string): Promise<Funcionario | null> {

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

  const { data, error } = await supabase
    .from('funcionarios')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.warn('getFuncionarioByUserId:', error.message);
    return null;
  }
  return data;
}

/**
 * Garante que existe um registro em `funcionarios` para o user logado.
 * Se não existir, cria automaticamente usando dados do profile.
 */
export async function ensureFuncionario(
  userId: string,
  nome: string,
  email: string,
  role: string,
): Promise<Funcionario | null> {
  // Tenta buscar existente
  const existing = await getFuncionarioByUserId(userId);
  if (existing) return existing;

  // Cria registro
  const { data, error } = await supabase
    .from('funcionarios')
    .upsert(
      { user_id: userId, nome, email, role: role as Funcionario['role'], status: 'offline' },
      { onConflict: 'user_id' },
    )
    .select()
    .single();

  if (error) {
    console.error('ensureFuncionario: erro ao criar registro:', error.message);
    return null;
  }
  return data;
}

/** Buscar sessões de atividade de um funcionário */
export async function getSessoesByFuncionario(funcionarioId: string): Promise<SessaoAtividade[]> {

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
  const { data, error } = await supabase.from('funcionarios').select('status');
  if (error) throw new Error(error.message);

  const stats = { online: 0, ausente: 0, offline: 0, total: data?.length ?? 0 };
  data?.forEach((f) => {
    if (f.status in stats) stats[f.status as keyof typeof stats]++;
  });
  return stats;
}

/** Buscar todas as sessões de hoje (todos os funcionários) */
export async function getAllSessoesHoje() {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from('sessoes_atividade')
    .select('*, funcionarios!inner(nome)')
    .gte('inicio', hoje.toISOString())
    .order('inicio', { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Buscar logs de atividade recentes */
export async function getLogsAtividade(limit = 50) {
  const { data, error } = await supabase
    .from('logs_atividade')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Buscar logs de atividade de hoje */
export async function getLogsAtividadeHoje() {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from('logs_atividade')
    .select('*')
    .gte('created_at', hoje.toISOString())
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Heartbeat — atualiza ultima_atividade e recalcula horas do funcionário */
export async function heartbeat(funcionarioId: string): Promise<void> {
  const { error } = await supabase
    .from('funcionarios')
    .update({ ultima_atividade: new Date().toISOString() })
    .eq('id', funcionarioId);

  if (error) throw new Error(error.message);
}

/**
 * Heartbeat completo — atualiza ultima_atividade e recalcula horas_hoje/semana/mes
 * com base nas sessões reais em sessoes_atividade.
 */
export async function heartbeatFull(funcionarioId: string): Promise<void> {
  const agora = new Date();

  // Início de hoje, da semana (segunda) e do mês
  const inicioHoje = new Date(agora); inicioHoje.setHours(0, 0, 0, 0);
  const inicieSemana = new Date(agora);
  const dow = agora.getDay(); // 0=dom
  inicieSemana.setDate(agora.getDate() - (dow === 0 ? 6 : dow - 1));
  inicieSemana.setHours(0, 0, 0, 0);
  const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1);

  // Busca todas as sessões do mês (cobre hoje+semana+mês)
  const { data: sessoes } = await supabase
    .from('sessoes_atividade')
    .select('inicio, fim, duracao')
    .eq('funcionario_id', funcionarioId)
    .gte('inicio', inicioMes.toISOString());

  let minHoje = 0;
  let minSemana = 0;
  let minMes = 0;

  (sessoes ?? []).forEach((s) => {
    const inicio = new Date(s.inicio);
    const fimTs = s.fim ? new Date(s.fim).getTime() : agora.getTime();
    const duracaoMin = Math.max(0, Math.round((fimTs - inicio.getTime()) / 60000));

    if (inicio >= inicioHoje) minHoje += duracaoMin;
    if (inicio >= inicieSemana) minSemana += duracaoMin;
    minMes += duracaoMin;
  });

  const horasHoje = +(minHoje / 60).toFixed(1);
  const horasSemana = +(minSemana / 60).toFixed(1);
  const horasMes = +(minMes / 60).toFixed(1);

  const { error } = await supabase
    .from('funcionarios')
    .update({
      ultima_atividade: agora.toISOString(),
      horas_hoje: horasHoje,
      horas_semana: horasSemana,
      horas_mes: horasMes,
    })
    .eq('id', funcionarioId);

  if (error) throw new Error(error.message);
}

/** Registrar ação no log de atividade */
export async function registrarLog(userId: string, acao: string, pagina?: string, detalhes?: string): Promise<void> {
  const { error } = await supabase
    .from('logs_atividade')
    .insert({ user_id: userId, acao, pagina: pagina ?? null, detalhes: detalhes ?? null });

  if (error) console.error('Erro ao registrar log:', error.message);
}

// ── Mutations ──────────────────────────────────────────────

/** Atualizar status do funcionário */
export async function updateFuncionarioStatus(
  id: string,
  status: 'online' | 'offline' | 'ausente'
): Promise<void> {

  const { error } = await supabase
    .from('funcionarios')
    .update({ status, ultima_atividade: new Date().toISOString() })
    .eq('id', id);

  if (error) throw new Error(error.message);
}

/** Atualizar meta diária de um funcionário */
export async function updateMetaDiaria(id: string, metaDiaria: number): Promise<void> {
  const { error } = await supabase
    .from('funcionarios')
    .update({ meta_diaria: metaDiaria })
    .eq('id', id);

  if (error) throw new Error(error.message);
}

/** Registrar início de sessão (fecha sessões órfãs e cria nova) */
export async function iniciarSessao(funcionarioId: string): Promise<SessaoAtividade> {
  // Fecha sessões abertas órfãs deste funcionário (sem `fim`)
  const { data: orfas } = await supabase
    .from('sessoes_atividade')
    .select('id, inicio')
    .eq('funcionario_id', funcionarioId)
    .is('fim', null);

  if (orfas && orfas.length > 0) {
    const agora = new Date();
    for (const s of orfas) {
      const duracao = Math.round((agora.getTime() - new Date(s.inicio).getTime()) / 60000);
      await supabase
        .from('sessoes_atividade')
        .update({ fim: agora.toISOString(), duracao })
        .eq('id', s.id);
    }
  }

  // Cria nova sessão
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

/** Atualizar acoes/paginas da sessão ativa (chamado pelo heartbeat) */
export async function atualizarSessao(
  sessaoId: string,
  acoes: number,
  paginas: string[],
): Promise<void> {
  const { data: sessao } = await supabase
    .from('sessoes_atividade')
    .select('inicio')
    .eq('id', sessaoId)
    .single();

  const duracao = sessao
    ? Math.round((Date.now() - new Date(sessao.inicio).getTime()) / 60000)
    : 0;

  await supabase
    .from('sessoes_atividade')
    .update({ acoes, paginas, duracao })
    .eq('id', sessaoId);
}

/** Finalizar sessão ativa */
export async function finalizarSessao(
  sessaoId: string,
  acoes: number,
  paginas: string[]
): Promise<void> {

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
