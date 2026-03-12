/**
 * @module useWoovi
 * @description React Query hooks para operações com Woovi (OpenPix).
 * Gerencia cobranças Pix, pagamentos, subcontas e saldo.
 *
 * @example
 * ```tsx
 * const { data: cobrancas } = useCobrancasWoovi();
 * const { data: saldo } = useSaldoWoovi();
 * const criarCobranca = useCriarCobrancaWoovi();
 * ```
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import * as wooviService from '../services/wooviService';
import { dbWooviChargeToView, dbWooviTransactionToView, dbWooviSubaccountToView } from '../lib/adapters';

const CHARGES_KEY = 'woovi-charges';
const TRANSACTIONS_KEY = 'woovi-transactions';
const SUBACCOUNTS_KEY = 'woovi-subaccounts';
const BALANCE_KEY = 'woovi-balance';
const STATS_KEY = 'woovi-stats';
const WEBHOOKS_KEY = 'woovi-webhooks';

// ══════════════════════════════════════════════════════════════
// COBRANÇAS
// ══════════════════════════════════════════════════════════════

/** Listar cobranças (com Realtime + polling) — retorna camelCase */
export function useCobrancasWoovi(status?: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const unsubscribe = wooviService.subscribeToCharges(() => {
      queryClient.invalidateQueries({ queryKey: [CHARGES_KEY] });
      queryClient.invalidateQueries({ queryKey: [BALANCE_KEY] });
      queryClient.invalidateQueries({ queryKey: [STATS_KEY] });
    });
    return unsubscribe;
  }, [queryClient]);

  return useQuery({
    queryKey: [CHARGES_KEY, { status }],
    queryFn: () => wooviService.getCobrancas(status),
    select: (data) => data.map(dbWooviChargeToView),
    refetchInterval: 30000, // Backup polling 30s
  });
}

/** Buscar cobrança por ID — retorna camelCase */
export function useCobrancaWoovi(id: string | undefined) {
  return useQuery({
    queryKey: [CHARGES_KEY, id],
    queryFn: () => wooviService.getCobrancaById(id!),
    enabled: !!id,
    select: (data) => (data ? dbWooviChargeToView(data) : null),
  });
}

/** Buscar cobranças de uma parcela */
export function useCobrancasByParcela(parcelaId: string | undefined) {
  return useQuery({
    queryKey: [CHARGES_KEY, 'by-parcela', parcelaId],
    queryFn: () => wooviService.getCobrancasByParcela(parcelaId!),
    enabled: !!parcelaId,
  });
}

/** Buscar cobranças de um cliente */
export function useCobrancasByCliente(clienteId: string | undefined) {
  return useQuery({
    queryKey: [CHARGES_KEY, 'by-cliente', clienteId],
    queryFn: () => wooviService.getCobrancasByCliente(clienteId!),
    enabled: !!clienteId,
  });
}

/** Criar cobrança Pix */
export function useCriarCobrancaWoovi() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: Parameters<typeof wooviService.criarCobranca>[0]) =>
      wooviService.criarCobranca(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [CHARGES_KEY] });
      queryClient.invalidateQueries({ queryKey: ['parcelas'] });
      queryClient.invalidateQueries({ queryKey: [STATS_KEY] });
    },
  });
}

/** Cancelar cobrança */
export function useCancelarCobrancaWoovi() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (chargeId: string) => wooviService.cancelarCobranca(chargeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [CHARGES_KEY] });
      queryClient.invalidateQueries({ queryKey: [STATS_KEY] });
    },
  });
}

// ══════════════════════════════════════════════════════════════
// PAGAMENTOS PIX (Liberação de Empréstimo)
// ══════════════════════════════════════════════════════════════

/** Liberar empréstimo via Pix */
export function useLiberarEmprestimoPix() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: Parameters<typeof wooviService.liberarEmprestimoPix>[0]) =>
      wooviService.liberarEmprestimoPix(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [TRANSACTIONS_KEY] });
      queryClient.invalidateQueries({ queryKey: ['emprestimos'] });
      queryClient.invalidateQueries({ queryKey: [BALANCE_KEY] });
      queryClient.invalidateQueries({ queryKey: [STATS_KEY] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['financial-summary'] });
    },
  });
}

// ══════════════════════════════════════════════════════════════
// SALDO
// ══════════════════════════════════════════════════════════════

/** Consultar saldo da conta principal — polling a cada 60s */
export function useSaldoWoovi() {
  return useQuery({
    queryKey: [BALANCE_KEY],
    queryFn: () => wooviService.getSaldo(),
    refetchInterval: 60000,
    staleTime: 30000,
    select: (data) => ({
      saldo: ((data as any)?.balance || 0) / 100, // centavos → reais
    }),
  });
}

/** Buscar stats do dashboard Woovi */
export function useWooviDashboardStats() {
  return useQuery({
    queryKey: [STATS_KEY],
    queryFn: () => wooviService.getWooviStats(),
    refetchInterval: 60000,
    staleTime: 30000,
    select: (data) => {
      const stats = (data as any)?.stats || {};
      return {
        totalCharges: stats.total_charges || 0,
        chargesActive: stats.charges_active || 0,
        chargesCompleted: stats.charges_completed || 0,
        chargesExpired: stats.charges_expired || 0,
        totalRecebido: stats.total_recebido || 0,
        totalTransferido: stats.total_transferido || 0,
        totalSplit: stats.total_split || 0,
        totalSubcontas: stats.total_subcontas || 0,
        totalWebhooks: stats.total_webhooks || 0,
        webhooksComErro: stats.webhooks_com_erro || 0,
        saldoConta: stats.saldo_conta || 0,
      };
    },
  });
}

// ══════════════════════════════════════════════════════════════
// SUBCONTAS (Indicadores)
// ══════════════════════════════════════════════════════════════

/** Listar subcontas — retorna camelCase */
export function useSubcontasWoovi() {
  return useQuery({
    queryKey: [SUBACCOUNTS_KEY],
    queryFn: () => wooviService.getSubcontas(),
    select: (data) => data.map(dbWooviSubaccountToView),
  });
}

/** Buscar subconta por cliente */
export function useSubcontaByCliente(clienteId: string | undefined) {
  return useQuery({
    queryKey: [SUBACCOUNTS_KEY, 'by-cliente', clienteId],
    queryFn: () => wooviService.getSubcontaByCliente(clienteId!),
    enabled: !!clienteId,
  });
}

/** Criar subconta para indicador */
export function useCriarSubcontaWoovi() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: Parameters<typeof wooviService.criarSubconta>[0]) =>
      wooviService.criarSubconta(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [SUBACCOUNTS_KEY] });
      queryClient.invalidateQueries({ queryKey: [STATS_KEY] });
    },
  });
}

/** Consultar saldo atualizado de subconta */
export function useConsultarSubcontaWoovi() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (wooviAccountId: string) =>
      wooviService.consultarSubconta(wooviAccountId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [SUBACCOUNTS_KEY] });
    },
  });
}

/** Solicitar saque de subconta */
export function useSacarSubcontaWoovi() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: Parameters<typeof wooviService.sacarSubconta>[0]) =>
      wooviService.sacarSubconta(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [SUBACCOUNTS_KEY] });
      queryClient.invalidateQueries({ queryKey: [TRANSACTIONS_KEY] });
      queryClient.invalidateQueries({ queryKey: [BALANCE_KEY] });
    },
  });
}

// ══════════════════════════════════════════════════════════════
// TRANSAÇÕES
// ══════════════════════════════════════════════════════════════

/** Listar transações (com Realtime) — retorna camelCase */
export function useTransacoesWoovi(tipo?: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const unsubscribe = wooviService.subscribeToTransactions(() => {
      queryClient.invalidateQueries({ queryKey: [TRANSACTIONS_KEY] });
    });
    return unsubscribe;
  }, [queryClient]);

  return useQuery({
    queryKey: [TRANSACTIONS_KEY, { tipo }],
    queryFn: () => wooviService.getTransacoes(tipo),
    select: (data) => data.map(dbWooviTransactionToView),
    refetchInterval: 30000,
  });
}

/** Transações de um empréstimo — retorna camelCase */
export function useTransacoesByEmprestimo(emprestimoId: string | undefined) {
  return useQuery({
    queryKey: [TRANSACTIONS_KEY, 'by-emprestimo', emprestimoId],
    queryFn: () => wooviService.getTransacoesByEmprestimo(emprestimoId!),
    enabled: !!emprestimoId,
    select: (data) => data.map(dbWooviTransactionToView),
  });
}

// ══════════════════════════════════════════════════════════════
// WEBHOOKS LOG
// ══════════════════════════════════════════════════════════════

/** Listar logs de webhooks (admin) */
export function useWebhooksLogWoovi() {
  return useQuery({
    queryKey: [WEBHOOKS_KEY],
    queryFn: () => wooviService.getWebhooksLog(),
  });
}
