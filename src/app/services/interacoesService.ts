/**
 * @module interacoesService
 * @description CRUD para `interacoes_cliente`. Engine de comissões usa para
 * resolver "último user que interagiu com o cliente".
 *
 * Insert é fire-and-forget: erros logam no console mas não bloqueiam fluxo
 * principal (acordos, empréstimos, etc).
 */
import { supabase } from '../lib/supabase';

export type TipoInteracao =
  | 'kanban_contato'
  | 'kanban_responsavel'
  | 'kanban_movimento'
  | 'acordo_criado'
  | 'acordo_quebrado'
  | 'acordo_cancelado'
  | 'emprestimo_criado'
  | 'emprestimo_quitado'
  | 'parcela_paga'
  | 'mensagem_enviada'
  | 'nota';

export interface InteracaoCliente {
  id: string;
  clienteId: string;
  userId: string;
  tipo: TipoInteracao;
  refTabela: string | null;
  refId: string | null;
  detalhe: string | null;
  createdAt: string;
}

export interface RegistrarInteracaoInput {
  clienteId: string;
  tipo: TipoInteracao;
  refTabela?: string | null;
  refId?: string | null;
  detalhe?: string | null;
}

/**
 * Registra interação user↔cliente. Não lança; loga e segue.
 * O user_id vem de auth.uid() lido via supabase.auth.
 */
export async function registrarInteracao(input: RegistrarInteracaoInput): Promise<void> {
  try {
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;
    if (!userId) {
      console.warn('[registrarInteracao] sem auth.user, ignorando', input);
      return;
    }
    // Cast porque interacoes_cliente ainda não está na Database type
    const { error } = await supabase.from('interacoes_cliente' as never).insert({
      cliente_id: input.clienteId,
      user_id: userId,
      tipo: input.tipo,
      ref_tabela: input.refTabela ?? null,
      ref_id: input.refId ?? null,
      detalhe: input.detalhe ?? null,
    } as never);
    if (error) {
      console.warn('[registrarInteracao] insert falhou:', error.message, input);
    }
  } catch (err) {
    console.warn('[registrarInteracao] exceção:', err);
  }
}

/**
 * Retorna o user_id que interagiu mais recentemente com cada cliente da lista.
 * Map<clienteId, userId>. Clientes sem interações ficam de fora.
 */
export async function getUltimoInteragidoPorCliente(
  clienteIds: string[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (clienteIds.length === 0) return result;

  // Busca todas as interações desses clientes (ordem desc) e pega a primeira
  // por cliente. Para listas pequenas (<= algumas centenas) isso é OK.
  const { data, error } = await supabase
    .from('interacoes_cliente' as never)
    .select('cliente_id, user_id, created_at')
    .in('cliente_id', clienteIds)
    .order('created_at', { ascending: false });

  if (error) {
    console.warn('[getUltimoInteragidoPorCliente] erro:', error.message);
    return result;
  }

  const rows = (data ?? []) as Array<{
    cliente_id: string;
    user_id: string;
    created_at: string;
  }>;

  for (const row of rows) {
    if (!result.has(row.cliente_id)) {
      result.set(row.cliente_id, row.user_id);
    }
  }

  return result;
}

/**
 * Lista interações de um cliente (mais recentes primeiro).
 */
export async function listInteracoesByCliente(
  clienteId: string,
  limit = 50,
): Promise<InteracaoCliente[]> {
  const { data, error } = await supabase
    .from('interacoes_cliente' as never)
    .select('*')
    .eq('cliente_id', clienteId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);

  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: r.id as string,
    clienteId: r.cliente_id as string,
    userId: r.user_id as string,
    tipo: r.tipo as TipoInteracao,
    refTabela: (r.ref_tabela as string | null) ?? null,
    refId: (r.ref_id as string | null) ?? null,
    detalhe: (r.detalhe as string | null) ?? null,
    createdAt: r.created_at as string,
  }));
}
