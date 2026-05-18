/**
 * @module cobrancaAgendamentoService
 * @description CRUD para regras de agendamento de cobrança e fila de disparos.
 */
import { supabase } from '../lib/supabase';

export interface CobrancaAgendamento {
  id: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  prioridade: number;
  dias_atraso_min: number;
  dias_atraso_max: number;
  template_id: string | null;
  instancia_id: string | null;
  horario_inicio: string;
  horario_fim: string;
  timezone: string;
  dias_semana: number[];
  intervalo_min_horas: number;
  intervalo_entre_envios_seg: number;
  max_disparos_por_dia_cli: number;
  max_disparos_por_hora: number;
  max_disparos_por_dia: number;
  total_disparos: number;
  created_at: string;
  updated_at: string;
}

export type CobrancaFilaStatus =
  | 'pendente'
  | 'enviando'
  | 'enviado'
  | 'falha'
  | 'cancelado'
  | 'fora_horario';

export interface CobrancaFilaItem {
  id: string;
  agendamento_id: string | null;
  cliente_id: string;
  emprestimo_id: string | null;
  parcela_id: string | null;
  template_id: string | null;
  instancia_id: string | null;
  telefone: string;
  mensagem: string;
  agendado_para: string;
  enviado_em: string | null;
  status: CobrancaFilaStatus;
  tentativas: number;
  ultimo_erro: string | null;
  log_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export async function listAgendamentos(): Promise<CobrancaAgendamento[]> {
  const { data, error } = await supabase
    .from('cobranca_agendamentos')
    .select('*')
    .order('prioridade', { ascending: false });
  if (error) throw error;
  return (data ?? []) as CobrancaAgendamento[];
}

export async function criarAgendamento(input: Partial<CobrancaAgendamento> & { nome: string }): Promise<CobrancaAgendamento> {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('cobranca_agendamentos')
    .insert({ ...input, created_by: user?.id ?? null })
    .select()
    .single();
  if (error) throw error;
  return data as CobrancaAgendamento;
}

export async function updateAgendamento(id: string, patch: Partial<CobrancaAgendamento>): Promise<CobrancaAgendamento> {
  const { data, error } = await supabase
    .from('cobranca_agendamentos')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as CobrancaAgendamento;
}

export async function deletarAgendamento(id: string): Promise<void> {
  const { error } = await supabase.from('cobranca_agendamentos').delete().eq('id', id);
  if (error) throw error;
}

export async function listFila(filtros?: {
  status?: CobrancaFilaStatus[];
  clienteId?: string;
  limit?: number;
}): Promise<CobrancaFilaItem[]> {
  let q = supabase.from('cobranca_fila').select('*').order('agendado_para', { ascending: false });
  if (filtros?.status?.length) q = q.in('status', filtros.status);
  if (filtros?.clienteId) q = q.eq('cliente_id', filtros.clienteId);
  q = q.limit(filtros?.limit ?? 200);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as CobrancaFilaItem[];
}

export async function enfileirar(input: {
  agendamento_id?: string;
  cliente_id: string;
  emprestimo_id?: string;
  parcela_id?: string;
  template_id?: string;
  instancia_id: string;
  telefone: string;
  mensagem: string;
  agendado_para?: string;
}): Promise<CobrancaFilaItem> {
  const { data, error } = await supabase
    .from('cobranca_fila')
    .insert({
      agendamento_id: input.agendamento_id ?? null,
      cliente_id: input.cliente_id,
      emprestimo_id: input.emprestimo_id ?? null,
      parcela_id: input.parcela_id ?? null,
      template_id: input.template_id ?? null,
      instancia_id: input.instancia_id,
      telefone: input.telefone,
      mensagem: input.mensagem,
      agendado_para: input.agendado_para ?? new Date().toISOString(),
      status: 'pendente',
    })
    .select()
    .single();
  if (error) throw error;
  return data as CobrancaFilaItem;
}

export async function cancelarItemFila(id: string): Promise<void> {
  const { error } = await supabase
    .from('cobranca_fila')
    .update({ status: 'cancelado', ultimo_erro: 'Cancelado pelo operador' })
    .eq('id', id);
  if (error) throw error;
}

/** Enfileirar múltiplos clientes para uma regra. */
export async function enfileirarLote(input: {
  agendamento_id: string;
  template_id: string | null;
  instancia_id: string;
  itens: Array<{ cliente_id: string; telefone: string; mensagem: string; emprestimo_id?: string | null }>;
}): Promise<{ inseridos: number }> {
  if (input.itens.length === 0) return { inseridos: 0 };
  const rows = input.itens.map((it) => ({
    agendamento_id: input.agendamento_id,
    cliente_id: it.cliente_id,
    emprestimo_id: it.emprestimo_id ?? null,
    template_id: input.template_id,
    instancia_id: input.instancia_id,
    telefone: it.telefone,
    mensagem: it.mensagem,
    agendado_para: new Date().toISOString(),
    status: 'pendente' as CobrancaFilaStatus,
  }));
  const { error, count } = await supabase
    .from('cobranca_fila')
    .insert(rows, { count: 'exact' });
  if (error) throw error;
  return { inseridos: count ?? rows.length };
}

/** Realtime para agendamentos + fila. */
export function subscribeCobrancaAgendamento(onChange: () => void): () => void {
  const channel = supabase
    .channel(`cobranca-ag-${crypto.randomUUID()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'cobranca_agendamentos' }, () => onChange())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'cobranca_fila' }, () => onChange())
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
