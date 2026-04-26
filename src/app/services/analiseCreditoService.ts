/**
 * @module analiseCreditoService
 * @description Serviço CRUD para análises de crédito via Supabase.
 *
 * @see database.types para tipagem completa
 */
import { supabase } from '../lib/supabase';
import type {
  AnaliseCredito,
  AnaliseCreditoInsert,
  AnaliseCreditoUpdate,
} from '../lib/database.types';

// ── Queries ────────────────────────────────────────────────

/** Buscar todas as análises, opcionalmente filtradas por status.
 *  Pagina em chunks de 1000 para contornar o `db-max-rows` do PostgREST. */
export async function getAnalises(status?: string): Promise<AnaliseCredito[]> {
  const PAGE = 1000;
  const all: AnaliseCredito[] = [];

  for (let from = 0; ; from += PAGE) {
    let query = supabase
      .from('analises_credito')
      .select('*')
      .order('data_solicitacao', { ascending: false })
      .range(from, from + PAGE - 1);

    if (status && status !== 'todos') {
      query = query.eq('status', status);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    all.push(...(data as AnaliseCredito[]));
    if (data.length < PAGE) break;
  }

  return all;
}

/** Buscar uma análise por ID */
export async function getAnaliseById(id: string): Promise<AnaliseCredito | null> {

  const { data, error } = await supabase
    .from('analises_credito')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/** Criar nova análise de crédito */
export async function createAnalise(analise: AnaliseCreditoInsert): Promise<AnaliseCredito> {
  const { data, error } = await supabase
    .from('analises_credito')
    .insert(analise)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/** Atualizar análise (aprovar, recusar, alterar status) */
export async function updateAnalise(
  id: string,
  updates: AnaliseCreditoUpdate
): Promise<AnaliseCredito> {
  const { data, error } = await supabase
    .from('analises_credito')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/** Deletar análise */
export async function deleteAnalise(id: string): Promise<void> {

  const { error } = await supabase
    .from('analises_credito')
    .delete()
    .eq('id', id);

  if (error) throw new Error(error.message);
}
