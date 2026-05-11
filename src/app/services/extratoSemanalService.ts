/**
 * @module extratoSemanalService
 * @description Serviço para o ciclo semanal de extrato CNAB 240 da EFI:
 *  - Histórico de execuções (extratos_semanais)
 *  - Destinatários WhatsApp (extrato_whatsapp_destinatarios)
 *  - Configurações (configuracoes_sistema)
 *  - Gerar URLs assinadas dos arquivos no bucket extratos-bancarios
 *  - Disparar execução manual via edge function cron-extrato-semanal
 */
import { supabase } from '../lib/supabase';

export interface ExtratoSemanal {
  id: string;
  periodoInicio: string;
  periodoFim: string;
  efiArquivoNome: string | null;
  cnabPath: string | null;
  pdfPath: string | null;
  status: 'pendente' | 'baixado' | 'processado' | 'enviado' | 'falhou';
  movimentacoesImportadas: number;
  destinatariosEnviados: number;
  destinatariosFalharam: number;
  erroMsg: string | null;
  rawMeta: Record<string, unknown> | null;
  triggerType: 'cron' | 'manual';
  triggeredBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExtratoDestinatario {
  id: string;
  nome: string;
  telefone: string;
  ativo: boolean;
  observacao: string | null;
  createdAt: string;
  updatedAt: string;
}

function mapExtratoSemanal(r: Record<string, unknown>): ExtratoSemanal {
  return {
    id: r.id as string,
    periodoInicio: r.periodo_inicio as string,
    periodoFim: r.periodo_fim as string,
    efiArquivoNome: (r.efi_arquivo_nome as string | null) ?? null,
    cnabPath: (r.cnab_path as string | null) ?? null,
    pdfPath: (r.pdf_path as string | null) ?? null,
    status: r.status as ExtratoSemanal['status'],
    movimentacoesImportadas: Number(r.movimentacoes_importadas ?? 0),
    destinatariosEnviados: Number(r.destinatarios_enviados ?? 0),
    destinatariosFalharam: Number(r.destinatarios_falharam ?? 0),
    erroMsg: (r.erro_msg as string | null) ?? null,
    rawMeta: (r.raw_meta as Record<string, unknown> | null) ?? null,
    triggerType: r.trigger_type as ExtratoSemanal['triggerType'],
    triggeredBy: (r.triggered_by as string | null) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

function mapDestinatario(r: Record<string, unknown>): ExtratoDestinatario {
  return {
    id: r.id as string,
    nome: r.nome as string,
    telefone: r.telefone as string,
    ativo: r.ativo as boolean,
    observacao: (r.observacao as string | null) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

// ──────────────────────── Histórico ────────────────────────

export async function listExtratosSemanais(limit = 30): Promise<ExtratoSemanal[]> {
  const { data, error } = await supabase
    .from('extratos_semanais')
    .select('*')
    .order('periodo_fim', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r) => mapExtratoSemanal(r as Record<string, unknown>));
}

export async function getSignedUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from('extratos-bancarios')
    .createSignedUrl(path, 60 * 60); // 1 hora
  if (error) throw error;
  return data.signedUrl;
}

export async function downloadExtratoArquivo(path: string): Promise<Blob> {
  const { data, error } = await supabase.storage
    .from('extratos-bancarios')
    .download(path);
  if (error) throw error;
  return data;
}

// ──────────────────────── Destinatários ────────────────────────

export async function listDestinatarios(): Promise<ExtratoDestinatario[]> {
  const { data, error } = await supabase
    .from('extrato_whatsapp_destinatarios')
    .select('*')
    .order('ativo', { ascending: false })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => mapDestinatario(r as Record<string, unknown>));
}

export interface UpsertDestinatarioInput {
  id?: string;
  nome: string;
  telefone: string;
  ativo?: boolean;
  observacao?: string | null;
}

export async function upsertDestinatario(input: UpsertDestinatarioInput): Promise<ExtratoDestinatario> {
  const payload = {
    nome: input.nome.trim(),
    telefone: input.telefone.replace(/\D/g, ''),
    ativo: input.ativo ?? true,
    observacao: input.observacao?.trim() || null,
  };
  if (input.id) {
    const { data, error } = await supabase
      .from('extrato_whatsapp_destinatarios')
      .update(payload)
      .eq('id', input.id)
      .select()
      .single();
    if (error) throw error;
    return mapDestinatario(data as Record<string, unknown>);
  }
  const { data, error } = await supabase
    .from('extrato_whatsapp_destinatarios')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return mapDestinatario(data as Record<string, unknown>);
}

export async function deleteDestinatario(id: string): Promise<void> {
  const { error } = await supabase
    .from('extrato_whatsapp_destinatarios')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// ──────────────────────── Configurações ────────────────────────

export interface ExtratoSemanalConfig {
  ativo: boolean;
  instanciaWhatsappId: string | null;
}

export async function getExtratoSemanalConfig(): Promise<ExtratoSemanalConfig> {
  const { data, error } = await supabase
    .from('configuracoes_sistema')
    .select('chave, valor')
    .in('chave', [
      'extrato_semanal_ativo',
      'extrato_semanal_instancia_whatsapp_id',
    ]);
  if (error) throw error;
  const map: Record<string, unknown> = {};
  for (const r of (data ?? []) as Array<{ chave: string; valor: unknown }>) {
    map[r.chave] = r.valor;
  }
  return {
    ativo: map['extrato_semanal_ativo'] === true,
    instanciaWhatsappId: (map['extrato_semanal_instancia_whatsapp_id'] as string) ?? null,
  };
}

export async function updateExtratoSemanalConfig(input: Partial<ExtratoSemanalConfig>): Promise<void> {
  const updates: Array<{ chave: string; valor: unknown }> = [];
  if (input.ativo !== undefined) {
    updates.push({ chave: 'extrato_semanal_ativo', valor: input.ativo });
  }
  if (input.instanciaWhatsappId !== undefined) {
    updates.push({
      chave: 'extrato_semanal_instancia_whatsapp_id',
      valor: input.instanciaWhatsappId,
    });
  }
  if (updates.length === 0) return;
  const { error } = await supabase
    .from('configuracoes_sistema')
    .upsert(updates, { onConflict: 'chave' });
  if (error) throw error;
}

// ──────────────────────── Disparo manual ────────────────────────

export interface RunExtratoResult {
  success: boolean;
  registro_id?: string;
  arquivo?: string;
  periodo?: { inicio: string; fim: string };
  movimentacoes_importadas?: number;
  total_entradas?: number;
  total_saidas?: number;
  enviados?: number;
  falharam?: number;
  skipped?: boolean;
  reason?: string;
  error?: string;
}

export async function runExtratoSemanalAgora(opts: {
  forcar?: boolean;
  dataInicio?: string;
  dataFim?: string;
} = {}): Promise<RunExtratoResult> {
  const { data, error } = await supabase.functions.invoke('cron-extrato-semanal', {
    body: {
      trigger_type: 'manual',
      forcar: !!opts.forcar,
      data_inicio: opts.dataInicio,
      data_fim: opts.dataFim,
    },
  });
  if (error) throw new Error(error.message ?? String(error));
  return data as RunExtratoResult;
}

// ──────────────────────── Helpers EFI Extratos (admin) ────────────────────────

export async function listEfiExtratoArquivos(opts: {
  dataInicio?: string;
  dataFim?: string;
} = {}): Promise<unknown> {
  const { data, error } = await supabase.functions.invoke('efi-extratos', {
    body: {
      action: 'list_files',
      data_inicio: opts.dataInicio,
      data_fim: opts.dataFim,
    },
  });
  if (error) throw new Error(error.message ?? String(error));
  return data;
}

export async function listEfiExtratoAgendamentos(): Promise<unknown> {
  const { data, error } = await supabase.functions.invoke('efi-extratos', {
    body: { action: 'list_schedules' },
  });
  if (error) throw new Error(error.message ?? String(error));
  return data;
}

export async function createEfiExtratoAgendamento(body: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await supabase.functions.invoke('efi-extratos', {
    body: { action: 'create_schedule', ...body },
  });
  if (error) throw new Error(error.message ?? String(error));
  return data;
}
