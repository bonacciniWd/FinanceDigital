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
