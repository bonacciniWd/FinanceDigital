/**
 * @module acordoService
 * @description Serviço CRUD para acordos/renegociações via Supabase.
 */
import { supabase } from '../lib/supabase';
import type {
  AcordoInsert,
  AcordoUpdate,
  AcordoComCliente,
} from '../lib/database.types';

// ── SELECT ────────────────────────────────────────────────

const ACORDO_SELECT = `
  *,
  clientes(nome, telefone)
`;

/** Lista todos os acordos (com nome do cliente). */
export async function listAcordos(): Promise<AcordoComCliente[]> {
  const { data, error } = await supabase
    .from('acordos')
    .select(ACORDO_SELECT)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as AcordoComCliente[];
}

/** Lista acordos de um cliente específico. */
export async function listAcordosByCliente(clienteId: string): Promise<AcordoComCliente[]> {
  const { data, error } = await supabase
    .from('acordos')
    .select(ACORDO_SELECT)
    .eq('cliente_id', clienteId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as AcordoComCliente[];
}

/** Busca um acordo pelo ID. */
export async function getAcordoById(id: string): Promise<AcordoComCliente | null> {
  const { data, error } = await supabase
    .from('acordos')
    .select(ACORDO_SELECT)
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return data as AcordoComCliente | null;
}

/** Busca acordo ativo de um cliente. */
export async function getAcordoAtivo(clienteId: string): Promise<AcordoComCliente | null> {
  const { data, error } = await supabase
    .from('acordos')
    .select(ACORDO_SELECT)
    .eq('cliente_id', clienteId)
    .eq('status', 'ativo')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data as AcordoComCliente | null;
}

// ── INSERT ────────────────────────────────────────────────

/**
 * Cria um acordo + congela parcelas originais + cria parcelas do acordo.
 * Tudo numa sequência para consistência.
 */
export async function criarAcordo(
  acordo: AcordoInsert,
  parcelasAcordo: {
    emprestimo_id: string;
    cliente_id: string;
    numero: number;
    valor: number;
    valor_original: number;
    data_vencimento: string;
  }[],
) {
  // 1. Inserir o acordo
  const { data: novoAcordo, error: errAcordo } = await supabase
    .from('acordos')
    .insert(acordo)
    .select()
    .single();

  if (errAcordo) throw errAcordo;

  // 2. Congelar parcelas originais
  if (acordo.parcelas_originais_ids.length > 0) {
    const { error: errFreeze } = await supabase
      .from('parcelas')
      .update({ congelada: true })
      .in('id', acordo.parcelas_originais_ids);

    if (errFreeze) console.error('Erro ao congelar parcelas:', errFreeze);
  }

  // 3. Criar parcelas do acordo (com acordo_id vinculado)
  if (parcelasAcordo.length > 0) {
    const rows = parcelasAcordo.map((p) => ({
      ...p,
      acordo_id: novoAcordo.id,
      status: 'pendente' as const,
    }));

    const { error: errParcelas } = await supabase
      .from('parcelas')
      .insert(rows);

    if (errParcelas) throw errParcelas;
  }

  // 4. Mover card do kanban para etapa 'acordo'.
  //    Se kanban_card_id não foi passado, busca o card ativo do cliente.
  try {
    let cardId = acordo.kanban_card_id ?? null;
    if (!cardId && acordo.cliente_id) {
      const { data: card } = await supabase
        .from('kanban_cobranca')
        .select('id')
        .eq('cliente_id', acordo.cliente_id)
        .not('etapa', 'in', '("pago","perdido","arquivado","acordo")')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      cardId = (card as { id: string } | null)?.id ?? null;
      if (cardId) {
        await supabase.from('acordos').update({ kanban_card_id: cardId }).eq('id', novoAcordo.id);
      }
    }
    if (cardId) {
      await supabase
        .from('kanban_cobranca')
        .update({ etapa: 'acordo', updated_at: new Date().toISOString() })
        .eq('id', cardId);
    }
  } catch (e) {
    console.error('[acordoService] Erro ao mover card kanban:', e);
  }

  // 5. Recomputar status dos empréstimos afetados (parcelas vencidas → congeladas
  //    devem fazer o emprestimo voltar de 'inadimplente' → 'ativo').
  try {
    const empIds = new Set<string>();
    parcelasAcordo.forEach((p) => p.emprestimo_id && empIds.add(p.emprestimo_id));
    // Buscar emprestimos das parcelas originais também (caso difiram)
    if (acordo.parcelas_originais_ids?.length) {
      const { data: origs } = await supabase
        .from('parcelas')
        .select('emprestimo_id')
        .in('id', acordo.parcelas_originais_ids);
      (origs ?? []).forEach((r: { emprestimo_id: string | null }) => {
        if (r.emprestimo_id) empIds.add(r.emprestimo_id);
      });
    }
    for (const empId of empIds) {
      await supabase.rpc('sync_emprestimo_status_from_parcelas', { p_emprestimo_id: empId });
    }
  } catch (e) {
    console.error('[acordoService] Erro ao sincronizar status do empréstimo:', e);
  }

  return novoAcordo;
}

// ── UPDATE ────────────────────────────────────────────────

/** Atualiza um acordo (status, observação, etc.). */
export async function updateAcordo(id: string, updates: AcordoUpdate) {
  const { error } = await supabase
    .from('acordos')
    .update(updates)
    .eq('id', id);

  if (error) throw error;
}

/** Marca entrada como paga. */
export async function marcarEntradaPaga(id: string) {
  return updateAcordo(id, { entrada_paga: true });
}

/** Cancela um acordo e descongela parcelas. */
export async function cancelarAcordo(id: string) {
  // Buscar acordo para saber quais parcelas descongelar
  const { data: acordo } = await supabase
    .from('acordos')
    .select('parcelas_originais_ids')
    .eq('id', id)
    .single();

  // Cancelar o acordo
  const { error } = await supabase
    .from('acordos')
    .update({ status: 'cancelado' })
    .eq('id', id);

  if (error) throw error;

  // Descongelar parcelas originais
  if (acordo?.parcelas_originais_ids?.length) {
    await supabase
      .from('parcelas')
      .update({ congelada: false })
      .in('id', acordo.parcelas_originais_ids);
  }

  // Cancelar parcelas pendentes do acordo
  await supabase
    .from('parcelas')
    .update({ status: 'cancelada' })
    .eq('acordo_id', id)
    .neq('status', 'paga');
}

/** Marca acordo como quebrado (cliente parou de pagar). */
export async function quebrarAcordo(id: string) {
  const { data: acordo } = await supabase
    .from('acordos')
    .select('parcelas_originais_ids')
    .eq('id', id)
    .single();

  const { error } = await supabase
    .from('acordos')
    .update({ status: 'quebrado' })
    .eq('id', id);

  if (error) throw error;

  // Descongelar parcelas originais (voltam a acumular juros)
  if (acordo?.parcelas_originais_ids?.length) {
    await supabase
      .from('parcelas')
      .update({ congelada: false })
      .in('id', acordo.parcelas_originais_ids);
  }
}
