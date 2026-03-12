/**
 * @module kanbanCobrancaService
 * @description Serviço CRUD para o pipeline de cobrança (Kanban) via Supabase.
 *
 * Sem mock data — todas as operações vão direto ao banco.
 * Usa JOINs com clientes e funcionarios para retornar nomes.
 *
 * @see database.types para tipagem completa
 */
import { supabase } from '../lib/supabase';
import type {
  KanbanCobrancaComCliente,
  KanbanCobrancaInsert,
  KanbanCobrancaUpdate,
  KanbanCobrancaEtapa,
} from '../lib/database.types';

const COBRANCA_SELECT = `
  *,
  clientes:cliente_id ( nome, telefone, email, status ),
  funcionarios:responsavel_id ( nome )
`;

// ── Queries ────────────────────────────────────────────────

/** Buscar todos os cards de cobrança, opcionalmente filtrados por etapa */
export async function getCardsCobranca(etapa?: KanbanCobrancaEtapa): Promise<KanbanCobrancaComCliente[]> {
  let query = supabase
    .from('kanban_cobranca')
    .select(COBRANCA_SELECT)
    .order('dias_atraso', { ascending: false });

  if (etapa) {
    query = query.eq('etapa', etapa);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as KanbanCobrancaComCliente[];
}

/** Buscar cards por etapa (para colunas do Kanban) */
export async function getCardsByEtapa(etapa: KanbanCobrancaEtapa): Promise<KanbanCobrancaComCliente[]> {
  const { data, error } = await supabase
    .from('kanban_cobranca')
    .select(COBRANCA_SELECT)
    .eq('etapa', etapa)
    .order('dias_atraso', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as KanbanCobrancaComCliente[];
}

/** Buscar card por ID */
export async function getCardById(id: string): Promise<KanbanCobrancaComCliente | null> {
  const { data, error } = await supabase
    .from('kanban_cobranca')
    .select(COBRANCA_SELECT)
    .eq('id', id)
    .single();

  if (error) throw new Error(error.message);
  return data as unknown as KanbanCobrancaComCliente;
}

/** Buscar cards por cliente */
export async function getCardsByCliente(clienteId: string): Promise<KanbanCobrancaComCliente[]> {
  const { data, error } = await supabase
    .from('kanban_cobranca')
    .select(COBRANCA_SELECT)
    .eq('cliente_id', clienteId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as KanbanCobrancaComCliente[];
}

/** Buscar cards por responsável */
export async function getCardsByResponsavel(responsavelId: string): Promise<KanbanCobrancaComCliente[]> {
  const { data, error } = await supabase
    .from('kanban_cobranca')
    .select(COBRANCA_SELECT)
    .eq('responsavel_id', responsavelId)
    .order('dias_atraso', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as KanbanCobrancaComCliente[];
}

// ── Mutations ──────────────────────────────────────────────

/** Criar novo card de cobrança */
export async function createCardCobranca(card: KanbanCobrancaInsert): Promise<KanbanCobrancaComCliente> {
  const { data, error } = await supabase
    .from('kanban_cobranca')
    .insert(card)
    .select(COBRANCA_SELECT)
    .single();

  if (error) throw new Error(error.message);
  return data as unknown as KanbanCobrancaComCliente;
}

/** Atualizar card de cobrança */
export async function updateCardCobranca(
  id: string,
  updates: KanbanCobrancaUpdate
): Promise<KanbanCobrancaComCliente> {
  const { data, error } = await supabase
    .from('kanban_cobranca')
    .update(updates)
    .eq('id', id)
    .select(COBRANCA_SELECT)
    .single();

  if (error) throw new Error(error.message);
  return data as unknown as KanbanCobrancaComCliente;
}

/** Mover card para outra etapa (drag-and-drop no Kanban) */
export async function moverCardCobranca(
  id: string,
  novaEtapa: KanbanCobrancaEtapa
): Promise<KanbanCobrancaComCliente> {
  return updateCardCobranca(id, { etapa: novaEtapa });
}

/** Registrar tentativa de contato */
export async function registrarContato(
  id: string,
  observacao?: string
): Promise<KanbanCobrancaComCliente> {
  // Primeiro pega o card atual para incrementar tentativas
  const { data: current, error: fetchErr } = await supabase
    .from('kanban_cobranca')
    .select('tentativas_contato')
    .eq('id', id)
    .single();

  if (fetchErr) throw new Error(fetchErr.message);

  return updateCardCobranca(id, {
    tentativas_contato: (current?.tentativas_contato ?? 0) + 1,
    ultimo_contato: new Date().toISOString(),
    etapa: 'contatado',
    observacao: observacao ?? null,
  });
}

/** Deletar card de cobrança */
export async function deleteCardCobranca(id: string): Promise<void> {
  const { error } = await supabase
    .from('kanban_cobranca')
    .delete()
    .eq('id', id);

  if (error) throw new Error(error.message);
}

// ── Stats (para Kanban Gerencial) ──────────────────────────

/** Buscar estatísticas consolidadas do Kanban via RPC */
export async function getKanbanStats() {
  const { data, error } = await supabase.rpc('get_kanban_stats');
  if (error) throw new Error(error.message);
  return data;
}
