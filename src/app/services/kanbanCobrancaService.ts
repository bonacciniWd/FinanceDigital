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
import { valorCorrigido } from '../lib/juros';
import type {
  KanbanCobrancaComCliente,
  KanbanCobrancaInsert,
  KanbanCobrancaUpdate,
  KanbanCobrancaEtapa,
} from '../lib/database.types';

type KanbanRow = { id: string; cliente_id: string; etapa: KanbanCobrancaEtapa };

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

// ── Sync: popular kanban a partir de empréstimos/parcelas ──

/**
 * Sincroniza o kanban de cobrança com empréstimos inadimplentes e parcelas vencidas/pendentes.
 *
 * - Cria cards para clientes com dívida que ainda não têm card ativo
 * - Atualiza cards existentes com valor e dias de atraso atualizados
 * - Remove cards cujo cliente já quitou tudo
 */
export async function syncCobrancas(): Promise<{ created: number; updated: number; removed: number }> {
  const today = new Date();

  // 1) Buscar empréstimos ativos e inadimplentes
  const { data: rawEmprestimos, error: empErr } = await supabase
    .from('emprestimos')
    .select('id, cliente_id, valor, parcelas, parcelas_pagas, valor_parcela, proximo_vencimento, status')
    .in('status', ['ativo', 'inadimplente']);
  if (empErr) throw new Error(empErr.message);
  const emprestimos = (rawEmprestimos ?? []) as Array<{
    id: string; cliente_id: string; valor: number; parcelas: number;
    parcelas_pagas: number; valor_parcela: number; proximo_vencimento: string; status: string;
  }>;

  // 2) Buscar parcelas pendentes e vencidas desses empréstimos
  const empIds = emprestimos.map((e) => e.id);
  let parcelasVencidas: Array<{
    id: string; emprestimo_id: string; cliente_id: string;
    valor: number; valor_original: number; juros: number; multa: number; desconto: number;
    data_vencimento: string; status: string;
  }> = [];
  if (empIds.length > 0) {
    const { data: parcelas, error: parErr } = await supabase
      .from('parcelas')
      .select('id, emprestimo_id, cliente_id, valor, valor_original, juros, multa, desconto, data_vencimento, status')
      .in('emprestimo_id', empIds)
      .in('status', ['pendente', 'vencida'])
      .order('data_vencimento');
    if (parErr) throw new Error(parErr.message);
    parcelasVencidas = (parcelas ?? []) as typeof parcelasVencidas;
  }

  // 3) Agregar díivida por cliente
  interface ClienteDebt {
    clienteId: string;
    valorTotal: number;
    diasAtraso: number;
    parcelaMaisAntigaId: string | null;
    etapa: KanbanCobrancaEtapa;
  }

  const debtMap = new Map<string, ClienteDebt>();

  for (const emp of emprestimos) {
    const clienteId = emp.cliente_id;
    const existing = debtMap.get(clienteId);

    // Parcelas desse empréstimo (valor corrigido com juros automáticos)
    const empParcelas = parcelasVencidas.filter((p) => p.emprestimo_id === emp.id);
    const valorPendente = empParcelas.reduce((sum, p) => {
      const { total } = valorCorrigido(p.valor_original, p.data_vencimento, p.juros, p.multa, p.desconto);
      return sum + total;
    }, 0);

    // Dia de atraso mais antigo
    const vencidas = empParcelas.filter((p) => p.status === 'vencida');
    let diasAtraso = 0;
    let parcelaMaisAntigaId: string | null = null;

    if (vencidas.length > 0) {
      const maisAntiga = vencidas.reduce((oldest, p) =>
        new Date(p.data_vencimento) < new Date(oldest.data_vencimento) ? p : oldest
      );
      diasAtraso = Math.max(0, Math.floor(
        (today.getTime() - new Date(maisAntiga.data_vencimento).getTime()) / (1000 * 60 * 60 * 24)
      ));
      parcelaMaisAntigaId = maisAntiga.id;
    } else if (empParcelas.length > 0) {
      // Parcelas pendentes — pegar a mais próxima do vencimento
      const proxima = empParcelas[0]; // já ordenadas por data_vencimento
      const diffDias = Math.floor(
        (new Date(proxima.data_vencimento).getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      );
      diasAtraso = diffDias < 0 ? Math.abs(diffDias) : 0;
      parcelaMaisAntigaId = proxima.id;
    }

    // Determinar etapa baseado no status
    let etapa: KanbanCobrancaEtapa = 'a_vencer';
    if (emp.status === 'inadimplente' || diasAtraso > 0) {
      etapa = 'vencido';
    }

    if (existing) {
      existing.valorTotal += valorPendente;
      if (diasAtraso > existing.diasAtraso) {
        existing.diasAtraso = diasAtraso;
        existing.parcelaMaisAntigaId = parcelaMaisAntigaId;
      }
      if (etapa === 'vencido') existing.etapa = 'vencido';
    } else {
      debtMap.set(clienteId, {
        clienteId,
        valorTotal: valorPendente > 0 ? valorPendente : Number(emp.valor_parcela),
        diasAtraso,
        parcelaMaisAntigaId,
        etapa,
      });
    }
  }

  // 4) Buscar cards existentes no kanban
  const { data: existingCards, error: cardsErr } = await supabase
    .from('kanban_cobranca')
    .select('id, cliente_id, etapa');
  if (cardsErr) throw new Error(cardsErr.message);

  const existingByCliente = new Map<string, { id: string; etapa: KanbanCobrancaEtapa }>();
  for (const card of ((existingCards ?? []) as KanbanRow[])) {
    existingByCliente.set(card.cliente_id, { id: card.id, etapa: card.etapa });
  }

  let created = 0;
  let updated = 0;
  let removed = 0;

  // 5) Criar/atualizar cards
  for (const [clienteId, debt] of debtMap) {
    const existing = existingByCliente.get(clienteId);

    if (existing) {
      // Não sobrescrever etapas avançadas (contatado, negociacao, acordo)
      const etapaPreservada = ['contatado', 'negociacao', 'acordo', 'pago'].includes(existing.etapa);
      const { error } = await supabase
        .from('kanban_cobranca')
        .update({
          valor_divida: debt.valorTotal,
          dias_atraso: debt.diasAtraso,
          parcela_id: debt.parcelaMaisAntigaId,
          ...(etapaPreservada ? {} : { etapa: debt.etapa }),
        } as KanbanCobrancaUpdate)
        .eq('id', existing.id);
      if (!error) updated++;
      existingByCliente.delete(clienteId);
    } else {
      const { error } = await supabase
        .from('kanban_cobranca')
        .insert({
          cliente_id: clienteId,
          parcela_id: debt.parcelaMaisAntigaId,
          etapa: debt.etapa,
          valor_divida: debt.valorTotal,
          dias_atraso: debt.diasAtraso,
        } as KanbanCobrancaInsert);
      if (!error) created++;
    }
  }

  // 6) Remover cards de clientes que já não têm dívida ativa
  //    (mas preservar cards em etapas avançadas: acordo, pago)
  for (const [, card] of existingByCliente) {
    if (['pago', 'acordo'].includes(card.etapa)) continue;
    const { error } = await supabase
      .from('kanban_cobranca')
      .delete()
      .eq('id', card.id);
    if (!error) removed++;
  }

  return { created, updated, removed };
}
