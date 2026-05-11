/**
 * @module comissoesSemanaisService
 * @description CRUD para `comissoes_semanais_config` e `relatorio_semanal_destinatarios`.
 */
import { supabase } from '../lib/supabase';
import type { ComissaoSemanalConfig, TipoRegraComissao } from '../lib/comissoes-semanais';

export interface UpsertComissaoConfigInput {
  id?: string;
  nome: string;
  userId?: string | null;
  tipo: TipoRegraComissao;
  valorPct?: number;
  valorFixo?: number;
  ativo?: boolean;
  ordem?: number;
  observacao?: string | null;
}

function mapConfig(r: Record<string, unknown>): ComissaoSemanalConfig {
  return {
    id: r.id as string,
    nome: r.nome as string,
    userId: (r.user_id as string | null) ?? null,
    tipo: r.tipo as TipoRegraComissao,
    valorPct: Number(r.valor_pct ?? 0),
    valorFixo: Number(r.valor_fixo ?? 0),
    ativo: !!r.ativo,
    ordem: Number(r.ordem ?? 0),
    observacao: (r.observacao as string | null) ?? null,
  };
}

export async function listComissoesConfigs(): Promise<ComissaoSemanalConfig[]> {
  const { data, error } = await supabase
    .from('comissoes_semanais_config')
    .select('*')
    .order('ordem', { ascending: true })
    .order('nome', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => mapConfig(r as Record<string, unknown>));
}

export async function upsertComissaoConfig(input: UpsertComissaoConfigInput): Promise<void> {
  const payload: Record<string, unknown> = {
    nome: input.nome.trim(),
    user_id: input.userId ?? null,
    tipo: input.tipo,
    valor_pct: input.valorPct ?? 0,
    valor_fixo: input.valorFixo ?? 0,
    ativo: input.ativo ?? true,
    ordem: input.ordem ?? 0,
    observacao: input.observacao ?? null,
  };
  if (input.id) {
    const { error } = await supabase
      .from('comissoes_semanais_config')
      .update(payload)
      .eq('id', input.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('comissoes_semanais_config').insert(payload);
    if (error) throw error;
  }
}

export async function deleteComissaoConfig(id: string): Promise<void> {
  const { error } = await supabase.from('comissoes_semanais_config').delete().eq('id', id);
  if (error) throw error;
}

// ────── Destinatários do relatório semanal ──────
export interface RelatorioSemanalDestinatario {
  id: string;
  nome: string;
  telefone: string;
  ativo: boolean;
  createdAt: string;
}

function mapDest(r: Record<string, unknown>): RelatorioSemanalDestinatario {
  return {
    id: r.id as string,
    nome: r.nome as string,
    telefone: r.telefone as string,
    ativo: !!r.ativo,
    createdAt: r.created_at as string,
  };
}

export async function listRelatorioDestinatarios(): Promise<RelatorioSemanalDestinatario[]> {
  const { data, error } = await supabase
    .from('relatorio_semanal_destinatarios')
    .select('*')
    .order('nome', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => mapDest(r as Record<string, unknown>));
}

export async function upsertRelatorioDestinatario(input: {
  id?: string;
  nome: string;
  telefone: string;
  ativo?: boolean;
}): Promise<void> {
  const payload = {
    nome: input.nome.trim(),
    telefone: input.telefone.replace(/\D/g, ''),
    ativo: input.ativo ?? true,
  };
  if (input.id) {
    const { error } = await supabase
      .from('relatorio_semanal_destinatarios')
      .update(payload)
      .eq('id', input.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('relatorio_semanal_destinatarios').insert(payload);
    if (error) throw error;
  }
}

export async function deleteRelatorioDestinatario(id: string): Promise<void> {
  const { error } = await supabase
    .from('relatorio_semanal_destinatarios')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// ────── Disparo manual do relatório semanal ──────
export interface EnviarRelatorioSemanalInput {
  periodoInicio: string; // yyyy-mm-dd
  periodoFim: string;    // yyyy-mm-dd
  mensagem: string;
  totalEntradas?: number;
  totalSaidas?: number;
  totalComissoes?: number;
  destinatarioIds?: string[]; // se omitido, envia para todos ativos
  /** URL pública do PDF já enviado ao Storage (alternativa a base64) */
  pdfUrl?: string;
  /** Nome do arquivo PDF (default: relatorio-semanal.pdf) */
  pdfFilename?: string;
}

export async function enviarRelatorioSemanalAgora(
  input: EnviarRelatorioSemanalInput,
): Promise<{ enviados: number; falhas: number; detalhes: Array<{ nome: string; telefone: string; status: 'enviado' | 'falhou'; erro?: string }> }> {
  const session = (await supabase.auth.getSession()).data.session;
  if (!session) throw new Error('Sessão expirada');

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cron-relatorio-semanal-whatsapp`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      periodo_inicio: input.periodoInicio,
      periodo_fim: input.periodoFim,
      mensagem: input.mensagem,
      total_entradas: input.totalEntradas,
      total_saidas: input.totalSaidas,
      total_comissoes: input.totalComissoes,
      destinatario_ids: input.destinatarioIds,
      origem: 'manual',
      pdf_url: input.pdfUrl,
      pdf_filename: input.pdfFilename,
    }),
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(txt || `Falha (${resp.status})`);
  }
  return resp.json();
}

export async function listRelatorioEnvios(limit = 20) {
  const { data, error } = await supabase
    .from('relatorio_semanal_envios')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}
