/**
 * @module useComissoes
 * @description Hooks React Query para gestão de comissões de agentes,
 * relatório de liquidações e gateways de pagamento.
 *
 * @see comissoesService para chamadas ao Supabase
 * @see migration 023_pix_flow_comissoes.sql
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchAgentesComissoes,
  criarAgenteComissao,
  atualizarAgenteComissao,
  removerAgenteComissao,
  fetchComissoesLiquidacoes,
  atualizarStatusComissao,
  aprovarComissoesEmLote,
  fetchGateways,
  atualizarGateway,
  fetchFuncionariosComissoes,
} from '../services/comissoesService';
import {
  dbAgenteComissaoToView,
  dbComissaoLiquidacaoToView,
  dbGatewayPagamentoToView,
} from '../lib/adapters';
import type { AgenteComissaoInsert, AgenteComissaoUpdate, GatewayPagamentoUpdate } from '../lib/database.types';
import type { AgenteComissaoView, ComissaoLiquidacaoView, GatewayPagamentoView } from '../lib/view-types';

// ── Query Keys ───────────────────────────────────────────
const AGENTES_KEY = 'agentes-comissoes';
const COMISSOES_KEY = 'comissoes-liquidacoes';
const GATEWAYS_KEY = 'gateways-pagamento';

// ══════════════════════════════════════════════════════════
// AGENTES COMISSÕES
// ══════════════════════════════════════════════════════════

/** Lista todas as configurações de comissão de agentes */
export function useAgentesComissoes() {
  return useQuery<AgenteComissaoView[]>({
    queryKey: [AGENTES_KEY],
    queryFn: async () => {
      const data = await fetchAgentesComissoes();
      return data.map(dbAgenteComissaoToView);
    },
  });
}

/** Criar configuração de comissão */
export function useCriarAgenteComissao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AgenteComissaoInsert) => criarAgenteComissao(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: [AGENTES_KEY] }),
  });
}

/** Atualizar configuração de comissão */
export function useAtualizarAgenteComissao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: AgenteComissaoUpdate }) =>
      atualizarAgenteComissao(id, updates),
    onSuccess: () => qc.invalidateQueries({ queryKey: [AGENTES_KEY] }),
  });
}

/** Remover configuração de comissão */
export function useRemoverAgenteComissao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => removerAgenteComissao(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: [AGENTES_KEY] }),
  });
}

// ══════════════════════════════════════════════════════════
// COMISSÕES LIQUIDAÇÕES (relatório)
// ══════════════════════════════════════════════════════════

/** Lista comissões com filtros opcionais */
export function useComissoesLiquidacoes(params?: {
  mesReferencia?: string;
  mesReferenciaFim?: string;
  agenteId?: string;
  tipo?: 'venda' | 'cobranca' | 'gerencia';
  status?: 'pendente' | 'aprovado' | 'pago';
}) {
  return useQuery<ComissaoLiquidacaoView[]>({
    queryKey: [COMISSOES_KEY, params],
    queryFn: async () => {
      const data = await fetchComissoesLiquidacoes(params);
      return data.map(dbComissaoLiquidacaoToView);
    },
  });
}

/** Lista de funcionários para filtro de comissões */
export function useFuncionariosComissoes() {
  return useQuery<{ id: string; name: string; email: string; role: string }[]>({
    queryKey: ['funcionarios-comissoes'],
    queryFn: fetchFuncionariosComissoes,
  });
}

/** Atualizar status de uma comissão */
export function useAtualizarStatusComissao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'aprovado' | 'pago' }) =>
      atualizarStatusComissao(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: [COMISSOES_KEY] }),
  });
}

/** Aprovar todas as comissões pendentes de um mês */
export function useAprovarComissoesEmLote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (mesReferencia: string) => aprovarComissoesEmLote(mesReferencia),
    onSuccess: () => qc.invalidateQueries({ queryKey: [COMISSOES_KEY] }),
  });
}

// ══════════════════════════════════════════════════════════
// GATEWAYS DE PAGAMENTO
// ══════════════════════════════════════════════════════════

/** Lista todos os gateways */
export function useGateways() {
  return useQuery<GatewayPagamentoView[]>({
    queryKey: [GATEWAYS_KEY],
    queryFn: async () => {
      const data = await fetchGateways();
      return data.map(dbGatewayPagamentoToView);
    },
  });
}

/** Atualizar configuração de gateway */
export function useAtualizarGateway() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: GatewayPagamentoUpdate }) =>
      atualizarGateway(id, updates),
    onSuccess: () => qc.invalidateQueries({ queryKey: [GATEWAYS_KEY] }),
  });
}
