/**
 * @module fluxosChatbotService
 * @description Serviço para CRUD de fluxos de chatbot e suas etapas.
 *
 * Trabalha diretamente com o Supabase (sem Edge Function) para operações CRUD.
 * Os fluxos são executados automaticamente pelo webhook-whatsapp quando
 * uma mensagem de entrada faz match com a palavra-chave configurada.
 *
 * @see database.types para tipagem completa
 */
import { supabase } from '../lib/supabase';
import type {
  FluxoChatbot,
  FluxoChatbotInsert,
  FluxoChatbotUpdate,
  FluxoChatbotEtapa,
  FluxoChatbotEtapaInsert,
  FluxoChatbotEtapaUpdate,
  FluxoChatbotComEtapas,
} from '../lib/database.types';

// ══════════════════════════════════════════════════════════
// ── Fluxos ────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════

/** Listar todos os fluxos */
export async function getFluxos(): Promise<FluxoChatbot[]> {
  const { data, error } = await supabase
    .from('fluxos_chatbot')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Listar fluxos com suas etapas (JOIN) */
export async function getFluxosComEtapas(): Promise<FluxoChatbotComEtapas[]> {
  const { data, error } = await supabase
    .from('fluxos_chatbot')
    .select('*, fluxos_chatbot_etapas(*)')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as FluxoChatbotComEtapas[];
}

/** Buscar fluxo por ID com etapas */
export async function getFluxoById(id: string): Promise<FluxoChatbotComEtapas> {
  const { data, error } = await supabase
    .from('fluxos_chatbot')
    .select('*, fluxos_chatbot_etapas(*)')
    .eq('id', id)
    .single();

  if (error) throw new Error(error.message);
  return data as FluxoChatbotComEtapas;
}

/** Buscar fluxos por departamento */
export async function getFluxosByDepartamento(departamento: string): Promise<FluxoChatbot[]> {
  const { data, error } = await supabase
    .from('fluxos_chatbot')
    .select('*')
    .eq('departamento', departamento)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Buscar fluxos ativos */
export async function getFluxosAtivos(): Promise<FluxoChatbot[]> {
  const { data, error } = await supabase
    .from('fluxos_chatbot')
    .select('*')
    .eq('status', 'ativo')
    .order('nome', { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Criar novo fluxo */
export async function criarFluxo(fluxo: FluxoChatbotInsert): Promise<FluxoChatbot> {
  const { data, error } = await supabase
    .from('fluxos_chatbot')
    .insert(fluxo)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/** Atualizar fluxo */
export async function atualizarFluxo(
  id: string,
  updates: FluxoChatbotUpdate
): Promise<FluxoChatbot> {
  const { data, error } = await supabase
    .from('fluxos_chatbot')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/** Deletar fluxo (cascade deleta etapas) */
export async function deletarFluxo(id: string): Promise<void> {
  const { error } = await supabase
    .from('fluxos_chatbot')
    .delete()
    .eq('id', id);

  if (error) throw new Error(error.message);
}

/** Alternar status ativo/inativo do fluxo */
export async function toggleFluxoStatus(
  id: string,
  statusAtual: string
): Promise<FluxoChatbot> {
  const novoStatus = statusAtual === 'ativo' ? 'inativo' : 'ativo';
  return atualizarFluxo(id, { status: novoStatus as FluxoChatbot['status'] });
}

/** Duplicar fluxo com todas as etapas */
export async function duplicarFluxo(id: string): Promise<FluxoChatbot> {
  const original = await getFluxoById(id);

  // Criar cópia do fluxo
  const { data: novoFluxo, error } = await supabase
    .from('fluxos_chatbot')
    .insert({
      nome: `${original.nome} (cópia)`,
      descricao: original.descricao,
      departamento: original.departamento,
      status: 'rascunho',
      gatilho: original.gatilho,
      palavra_chave: original.palavra_chave,
      cron_expression: original.cron_expression,
      evento_trigger: original.evento_trigger,
      template_id: original.template_id,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  // Duplicar etapas
  if (original.fluxos_chatbot_etapas?.length > 0) {
    const etapas = original.fluxos_chatbot_etapas.map((e) => ({
      fluxo_id: novoFluxo.id,
      ordem: e.ordem,
      tipo: e.tipo,
      conteudo: e.conteudo,
      config: e.config,
    }));

    const { error: etapasErr } = await supabase
      .from('fluxos_chatbot_etapas')
      .insert(etapas);

    if (etapasErr) console.error('Erro ao duplicar etapas:', etapasErr);
  }

  return novoFluxo;
}

// ══════════════════════════════════════════════════════════
// ── Etapas ────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════

/** Buscar etapas de um fluxo, ordenadas */
export async function getEtapasByFluxo(fluxoId: string): Promise<FluxoChatbotEtapa[]> {
  const { data, error } = await supabase
    .from('fluxos_chatbot_etapas')
    .select('*')
    .eq('fluxo_id', fluxoId)
    .order('ordem', { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Criar etapa */
export async function criarEtapa(etapa: FluxoChatbotEtapaInsert): Promise<FluxoChatbotEtapa> {
  const { data, error } = await supabase
    .from('fluxos_chatbot_etapas')
    .insert(etapa)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/** Atualizar etapa */
export async function atualizarEtapa(
  id: string,
  updates: FluxoChatbotEtapaUpdate
): Promise<FluxoChatbotEtapa> {
  const { data, error } = await supabase
    .from('fluxos_chatbot_etapas')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/** Deletar etapa */
export async function deletarEtapa(id: string): Promise<void> {
  const { error } = await supabase
    .from('fluxos_chatbot_etapas')
    .delete()
    .eq('id', id);

  if (error) throw new Error(error.message);
}

/** Reordenar etapas (batch update) */
export async function reordenarEtapas(
  etapas: { id: string; ordem: number }[]
): Promise<void> {
  // Supabase não suporta batch update elegante, então fazemos individualmente
  const promises = etapas.map((e) =>
    supabase
      .from('fluxos_chatbot_etapas')
      .update({ ordem: e.ordem })
      .eq('id', e.id)
  );

  const results = await Promise.all(promises);
  const errors = results.filter((r) => r.error);
  if (errors.length > 0) {
    throw new Error(`Erro ao reordenar: ${errors[0].error!.message}`);
  }
}

/** Criar múltiplas etapas de uma vez */
export async function criarEtapasBatch(
  etapas: FluxoChatbotEtapaInsert[]
): Promise<FluxoChatbotEtapa[]> {
  const { data, error } = await supabase
    .from('fluxos_chatbot_etapas')
    .insert(etapas)
    .select();

  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * Salvar estado completo do editor visual ReactFlow.
 * Recebe os nós e edges, calcula as operações de create/update/delete
 * necessárias e persiste tudo no Supabase.
 */
export async function salvarEstadoEditor(
  fluxoId: string,
  etapaNodes: Array<{
    id: string;
    type: string;
    position: { x: number; y: number };
    data: Record<string, unknown>;
  }>,
  edgeConnections: Array<{
    source: string;
    target: string;
    sourceHandle?: string;
    label?: string;
  }>
): Promise<void> {
  // Buscar etapas existentes
  const existing = await getEtapasByFluxo(fluxoId);
  const existingIds = new Set(existing.map((e) => e.id));

  // Mapear edges por source
  const edgesBySource: Record<string, Array<{ targetId: string; label?: string; sourceHandle?: string }>> = {};
  edgeConnections.forEach((edge) => {
    if (edge.source === 'trigger') return;
    if (!edgesBySource[edge.source]) edgesBySource[edge.source] = [];
    edgesBySource[edge.source].push({
      targetId: edge.target,
      label: edge.label || undefined,
      sourceHandle: edge.sourceHandle || undefined,
    });
  });

  const toCreate: FluxoChatbotEtapaInsert[] = [];
  const updatePromises: Promise<unknown>[] = [];

  etapaNodes.forEach((node, index) => {
    const connections = edgesBySource[node.id] || [];
    const configData = {
      ...((node.data.config || {}) as Record<string, unknown>),
      position: node.position,
      connections,
    };

    let proximo_sim: string | null = null;
    let proximo_nao: string | null = null;

    if (node.type === 'condicao') {
      const simConn = connections.find((c) => c.sourceHandle === 'sim' || c.label === 'Sim');
      const naoConn = connections.find((c) => c.sourceHandle === 'nao' || c.label === 'Não');
      proximo_sim = simConn?.targetId || null;
      proximo_nao = naoConn?.targetId || null;
    } else if (connections.length > 0) {
      proximo_sim = connections[0].targetId;
    }

    const etapaData = {
      ordem: index,
      tipo: node.type as FluxoChatbotEtapa['tipo'],
      conteudo: String(node.data.conteudo || ''),
      config: configData,
      proximo_sim,
      proximo_nao,
    };

    if (existingIds.has(node.id)) {
      updatePromises.push(atualizarEtapa(node.id, etapaData));
    } else {
      toCreate.push({ ...etapaData, fluxo_id: fluxoId });
    }
  });

  // Deletar nós removidos
  const currentNodeIds = new Set(etapaNodes.map((n) => n.id));
  const toDelete = existing.filter((e) => !currentNodeIds.has(e.id));
  const deletePromises = toDelete.map((e) => deletarEtapa(e.id));

  // Executar tudo
  await Promise.all([...updatePromises, ...deletePromises]);
  if (toCreate.length > 0) {
    await criarEtapasBatch(toCreate);
  }
}
