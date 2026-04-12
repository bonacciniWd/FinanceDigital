/**
 * @module efiService
 * @description Serviço frontend para interagir com a Edge Function efi.
 * Faz chamadas ao gateway EFI Bank (Gerencianet) via Supabase Edge Functions.
 */
import { supabase } from '../lib/supabase';

// ── Tipos ─────────────────────────────────────────────────

interface EfiCreateChargeParams {
  parcela_id?: string;
  emprestimo_id?: string;
  cliente_id: string;
  valor: number;
  descricao?: string;
  cliente_nome?: string;
  cliente_cpf?: string;
  expiration_seconds?: number;
}

interface EfiCreateCobvParams {
  parcela_id?: string;
  emprestimo_id?: string;
  cliente_id: string;
  valor: number;
  descricao?: string;
  cliente_nome?: string;
  cliente_cpf?: string;
  data_vencimento: string;
  multa?: { modalidade: number; valorPerc: string };
  juros?: { modalidade: number; valorPerc: string };
  desconto?: { modalidade: number; descontoDataFixa?: Array<{ data: string; valorPerc: string }> };
}

interface EfiCreatePaymentParams {
  emprestimo_id?: string;
  cliente_id: string;
  valor: number;
  pix_key: string;
  pix_key_type?: string;
  destinatario_nome?: string;
  descricao?: string;
}

interface EfiRefundParams {
  e2e_id: string;
  valor: number;
  refund_id?: string;
}

interface EfiDateRangeParams {
  inicio: string;
  fim: string;
  status?: string;
}

// ── Chamada genérica ──────────────────────────────────────

async function callEfi<T = any>(action: string, params: Record<string, any>): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Usuário não autenticado');

  const response = await supabase.functions.invoke('efi', {
    body: { action, ...params },
  });

  if (response.error) throw new Error(response.error.message);
  const result = response.data as any;
  if (result && result.success === false && result.error) {
    throw new Error(result.error);
  }
  return result as T;
}

// ── Cobranças imediatas (cob) ─────────────────────────────

/** Criar cobrança Pix imediata via EFI */
export async function efiCriarCobranca(params: EfiCreateChargeParams) {
  return callEfi('create_charge', params);
}

/** Consultar cobrança por txid */
export async function efiConsultarCobranca(charge_id: string) {
  return callEfi('get_charge', { charge_id });
}

/** Listar cobranças imediatas por período */
export async function efiListarCobrancas(params: EfiDateRangeParams) {
  return callEfi('list_charges', params);
}

// ── Cobranças com vencimento (cobv) ───────────────────────

/** Criar cobrança com vencimento via EFI */
export async function efiCriarCobv(params: EfiCreateCobvParams) {
  return callEfi('create_cobv', params);
}

/** Consultar cobrança com vencimento por txid */
export async function efiConsultarCobv(txid: string) {
  return callEfi('get_cobv', { txid });
}

/** Listar cobranças com vencimento por período */
export async function efiListarCobv(params: EfiDateRangeParams) {
  return callEfi('list_cobv', params);
}

// ── Envio de Pix (pagamentos) ─────────────────────────────

/** Criar pagamento (envio Pix) via EFI — admin only */
export async function efiCriarPagamento(params: EfiCreatePaymentParams) {
  return callEfi('create_payment', params);
}

/** Consultar Pix enviado por idEnvio */
export async function efiConsultarPixEnviado(id_envio: string) {
  return callEfi('get_sent_pix', { id_envio });
}

/** Listar Pix enviados por período */
export async function efiListarPixEnviados(params: EfiDateRangeParams) {
  return callEfi('list_sent_pix', params);
}

// ── Gestão de Pix (recebidos + devoluções) ────────────────

/** Consultar Pix recebido por e2eId */
export async function efiConsultarPix(e2e_id: string) {
  return callEfi('get_pix', { e2e_id });
}

/** Listar Pix recebidos por período */
export async function efiListarPix(params: EfiDateRangeParams) {
  return callEfi('list_pix', params);
}

/** Solicitar devolução de Pix — admin only */
export async function efiSolicitarDevolucao(params: EfiRefundParams) {
  return callEfi('request_refund', params);
}

/** Consultar devolução por e2eId + refund_id */
export async function efiConsultarDevolucao(e2e_id: string, refund_id: string) {
  return callEfi('get_refund', { e2e_id, refund_id });
}

// ── Saldo ─────────────────────────────────────────────────

/** Consultar saldo via EFI */
export async function efiConsultarSaldo() {
  return callEfi('get_balance', {});
}

// ── Webhooks ──────────────────────────────────────────────

/** Configurar webhook URL na EFI — admin only */
export async function efiConfigurarWebhook(webhook_url: string) {
  return callEfi('configure_webhook', { webhook_url });
}

/** Listar webhooks registrados */
export async function efiListarWebhooks(params: EfiDateRangeParams) {
  return callEfi('list_webhooks', params);
}

/** Deletar webhook — admin only */
export async function efiDeletarWebhook() {
  return callEfi('delete_webhook', {});
}
