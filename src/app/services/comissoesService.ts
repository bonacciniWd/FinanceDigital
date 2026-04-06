/**
 * @module comissoesService
 * @description Serviço para gerenciamento de comissões de agentes e gateways de pagamento.
 * CRUD de configurações de comissão, relatórios de liquidações e gateways.
 */
import { supabase } from '../lib/supabase';
import type {
  AgenteComissao,
  AgenteComissaoInsert,
  AgenteComissaoUpdate,
  ComissaoComAgente,
  GatewayPagamento,
  GatewayPagamentoUpdate,
} from '../lib/database.types';

// ══════════════════════════════════════════════════════════════
// AGENTES COMISSÕES — Config de % por agente
// ══════════════════════════════════════════════════════════════

/** Buscar todas as configurações de comissão (com dados do agente) */
export async function fetchAgentesComissoes() {
  const { data, error } = await supabase
    .from('agentes_comissoes')
    .select('*, profiles:agente_id(name, email, role)')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data as (AgenteComissao & { profiles: { name: string; email: string; role: string } | null })[];
}

/** Criar configuração de comissão para um agente */
export async function criarAgenteComissao(input: AgenteComissaoInsert) {
  const { data, error } = await supabase
    .from('agentes_comissoes')
    .insert(input)
    .select('*, profiles:agente_id(name, email, role)')
    .single();

  if (error) throw error;
  return data;
}

/** Atualizar configuração de comissão de um agente */
export async function atualizarAgenteComissao(id: string, updates: AgenteComissaoUpdate) {
  const { data, error } = await supabase
    .from('agentes_comissoes')
    .update(updates)
    .eq('id', id)
    .select('*, profiles:agente_id(name, email, role)')
    .single();

  if (error) throw error;
  return data;
}

/** Remover configuração de comissão */
export async function removerAgenteComissao(id: string) {
  const { error } = await supabase
    .from('agentes_comissoes')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

// ══════════════════════════════════════════════════════════════
// COMISSÕES LIQUIDAÇÕES — Relatório de comissões calculadas
// ══════════════════════════════════════════════════════════════

/** Buscar comissões de liquidações com filtros */
export async function fetchComissoesLiquidacoes(params?: {
  mesReferencia?: string;
  mesReferenciaFim?: string;
  agenteId?: string;
  tipo?: 'venda' | 'cobranca' | 'gerencia';
  status?: 'pendente' | 'aprovado' | 'pago';
}) {
  let query = supabase
    .from('comissoes_liquidacoes')
    .select('*, profiles:agente_id(name, email, role)')
    .order('created_at', { ascending: false });

  if (params?.mesReferencia) {
    query = query.gte('mes_referencia', params.mesReferencia);
  }
  if (params?.mesReferenciaFim) {
    query = query.lte('mes_referencia', params.mesReferenciaFim);
  }
  if (params?.agenteId) {
    query = query.eq('agente_id', params.agenteId);
  }
  if (params?.tipo) {
    query = query.eq('tipo', params.tipo);
  }
  if (params?.status) {
    query = query.eq('status', params.status);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data as ComissaoComAgente[];
}

/** Buscar todos os funcionários disponíveis para filtro de comissões */
export async function fetchFuncionariosComissoes() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, email, role')
    .in('role', ['admin', 'gerencia', 'cobranca', 'comercial'])
    .order('name');

  if (error) throw error;
  return data ?? [];
}

/** Atualizar status de comissão (aprovar ou marcar como pago) */
export async function atualizarStatusComissao(id: string, status: 'aprovado' | 'pago') {
  const { data, error } = await supabase
    .from('comissoes_liquidacoes')
    .update({ status })
    .eq('id', id)
    .select('*, profiles:agente_id(name, email, role)')
    .single();

  if (error) throw error;
  return data;
}

/** Aprovar comissões em lote por mês de referência */
export async function aprovarComissoesEmLote(mesReferencia: string) {
  const { data, error } = await supabase
    .from('comissoes_liquidacoes')
    .update({ status: 'aprovado' })
    .eq('mes_referencia', mesReferencia)
    .eq('status', 'pendente')
    .select('id');

  if (error) throw error;
  return data?.length ?? 0;
}

// ══════════════════════════════════════════════════════════════
// GATEWAYS DE PAGAMENTO
// ══════════════════════════════════════════════════════════════

/** Buscar todos os gateways configurados */
export async function fetchGateways() {
  const { data, error } = await supabase
    .from('gateways_pagamento')
    .select('*')
    .order('prioridade', { ascending: true });

  if (error) throw error;
  return data as GatewayPagamento[];
}

/** Atualizar configuração de um gateway */
export async function atualizarGateway(id: string, updates: GatewayPagamentoUpdate) {
  const { data, error } = await supabase
    .from('gateways_pagamento')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data as GatewayPagamento;
}

/** Buscar gateway ativo prioritário */
export async function fetchGatewayAtivo() {
  const { data, error } = await supabase
    .from('gateways_pagamento')
    .select('*')
    .eq('ativo', true)
    .order('prioridade', { ascending: true })
    .limit(1)
    .single();

  if (error) throw error;
  return data as GatewayPagamento;
}
