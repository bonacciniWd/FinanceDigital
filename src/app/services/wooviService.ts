/**
 * @module wooviService
 * @description Serviço para integração com Woovi (OpenPix) via Edge Functions.
 * Gerencia cobranças Pix, pagamentos, subcontas e saldo.
 *
 * @see database.types para tipagem completa
 */
import { supabase } from '../lib/supabase';
import type {
  WooviCharge,
  WooviChargeComCliente,
  WooviTransaction,
  WooviSubaccount,
  WooviSubaccountComCliente,
  WooviWebhookLog,
} from '../lib/database.types';

// ── Helper: chamar Edge Function woovi ─────────────────────

interface WooviActionPayload {
  action: string;
  [key: string]: unknown;
}

interface WooviResponse<T = unknown> {
  success: boolean;
  error?: string;
  [key: string]: unknown;
  data?: T;
}

async function callWoovi<T = unknown>(payload: WooviActionPayload): Promise<WooviResponse<T>> {
  const { data, error } = await supabase.functions.invoke('woovi', {
    body: payload,
  });

  if (error) throw new Error(error.message || 'Erro ao chamar Edge Function woovi');
  if (data?.error) throw new Error(data.error);

  return data as WooviResponse<T>;
}

// ══════════════════════════════════════════════════════════════
// COBRANÇAS
// ══════════════════════════════════════════════════════════════

/** Criar cobrança Pix para pagamento de parcela */
export async function criarCobranca(params: {
  parcela_id?: string;
  emprestimo_id?: string;
  cliente_id: string;
  valor: number;
  descricao?: string;
  cliente_nome?: string;
  cliente_cpf?: string;
  expiration_minutes?: number;
  // Split
  split_indicador_id?: string;
  split_valor?: number;
  split_woovi_account_id?: string;
}) {
  return callWoovi({ action: 'create_charge', ...params });
}

/** Consultar status de uma cobrança na Woovi */
export async function consultarCobranca(chargeId: string) {
  return callWoovi({ action: 'get_charge', charge_id: chargeId });
}

/** Cancelar/deletar uma cobrança */
export async function cancelarCobranca(chargeId: string) {
  return callWoovi({ action: 'delete_charge', charge_id: chargeId });
}

/** Listar cobranças do banco (local) */
export async function getCobrancas(status?: string): Promise<WooviChargeComCliente[]> {
  let query = supabase
    .from('woovi_charges')
    .select('*, clientes(nome, telefone)')
    .order('created_at', { ascending: false });

  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as WooviChargeComCliente[];
}

/** Buscar cobrança por ID */
export async function getCobrancaById(id: string): Promise<WooviChargeComCliente | null> {
  const { data, error } = await supabase
    .from('woovi_charges')
    .select('*, clientes(nome, telefone)')
    .eq('id', id)
    .single();

  if (error) throw new Error(error.message);
  return data as WooviChargeComCliente;
}

/** Buscar cobranças de uma parcela */
export async function getCobrancasByParcela(parcelaId: string): Promise<WooviCharge[]> {
  const { data, error } = await supabase
    .from('woovi_charges')
    .select('*')
    .eq('parcela_id', parcelaId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Buscar cobranças de um cliente */
export async function getCobrancasByCliente(clienteId: string): Promise<WooviCharge[]> {
  const { data, error } = await supabase
    .from('woovi_charges')
    .select('*')
    .eq('cliente_id', clienteId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

// ══════════════════════════════════════════════════════════════
// PAGAMENTOS PIX (Liberação de Empréstimo)
// ══════════════════════════════════════════════════════════════

/** Criar pagamento Pix para liberar empréstimo ao cliente */
export async function liberarEmprestimoPix(params: {
  emprestimo_id: string;
  cliente_id: string;
  valor: number;
  pix_key: string;
  pix_key_type?: string;
  destinatario_nome?: string;
  descricao?: string;
}) {
  return callWoovi({ action: 'create_payment', ...params });
}

// ══════════════════════════════════════════════════════════════
// SALDO
// ══════════════════════════════════════════════════════════════

/** Consultar saldo da conta principal na Woovi */
export async function getSaldo() {
  return callWoovi({ action: 'get_balance' });
}

/** Buscar estatísticas Woovi (banco + API) */
export async function getWooviStats() {
  return callWoovi({ action: 'get_stats' });
}

// ══════════════════════════════════════════════════════════════
// SUBCONTAS (Indicadores)
// ══════════════════════════════════════════════════════════════

/** Criar subconta para indicador */
export async function criarSubconta(params: {
  cliente_id: string;
  user_id?: string;
  nome: string;
  documento?: string;
  pix_key?: string;
}) {
  return callWoovi({ action: 'create_subaccount', ...params });
}

/** Consultar subconta na Woovi (atualiza saldo cacheado) */
export async function consultarSubconta(wooviAccountId: string) {
  return callWoovi({ action: 'get_subaccount', woovi_account_id: wooviAccountId });
}

/** Solicitar saque de subconta */
export async function sacarSubconta(params: {
  woovi_account_id: string;
  valor: number;
  pix_key?: string;
}) {
  return callWoovi({ action: 'withdraw_subaccount', ...params });
}

/** Listar subcontas do banco (local) */
export async function getSubcontas(): Promise<WooviSubaccountComCliente[]> {
  const { data, error } = await supabase
    .from('woovi_subaccounts')
    .select('*, clientes(nome, telefone, email)')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as WooviSubaccountComCliente[];
}

/** Buscar subconta por cliente */
export async function getSubcontaByCliente(clienteId: string): Promise<WooviSubaccount | null> {
  const { data, error } = await supabase
    .from('woovi_subaccounts')
    .select('*')
    .eq('cliente_id', clienteId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

// ══════════════════════════════════════════════════════════════
// TRANSAÇÕES
// ══════════════════════════════════════════════════════════════

/** Listar transações do banco (local) */
export async function getTransacoes(tipo?: string): Promise<WooviTransaction[]> {
  let query = supabase
    .from('woovi_transactions')
    .select('*')
    .order('created_at', { ascending: false });

  if (tipo) query = query.eq('tipo', tipo);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Buscar transações de um empréstimo */
export async function getTransacoesByEmprestimo(emprestimoId: string): Promise<WooviTransaction[]> {
  const { data, error } = await supabase
    .from('woovi_transactions')
    .select('*')
    .eq('emprestimo_id', emprestimoId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

// ══════════════════════════════════════════════════════════════
// WEBHOOKS LOG
// ══════════════════════════════════════════════════════════════

/** Listar logs de webhooks (admin only) */
export async function getWebhooksLog(): Promise<WooviWebhookLog[]> {
  const { data, error } = await supabase
    .from('woovi_webhooks_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) throw new Error(error.message);
  return data ?? [];
}

// ══════════════════════════════════════════════════════════════
// REALTIME
// ══════════════════════════════════════════════════════════════

/** Subscribe a mudanças em woovi_charges (Realtime) */
export function subscribeToCharges(callback: () => void) {
  const channel = supabase
    .channel('woovi-charges-changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'woovi_charges' },
      () => callback()
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/** Subscribe a mudanças em woovi_transactions (Realtime) */
export function subscribeToTransactions(callback: () => void) {
  const channel = supabase
    .channel('woovi-transactions-changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'woovi_transactions' },
      () => callback()
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
