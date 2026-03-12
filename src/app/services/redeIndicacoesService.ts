/**
 * @module redeIndicacoesService
 * @description Serviço para a Rede de Indicações via Supabase.
 *
 * A rede é derivada **diretamente** da tabela `clientes` usando o campo
 * `indicado_por` (FK recursiva). Não há mais tabela `rede_indicacoes` nem
 * dados mock — tudo vem do banco real.
 *
 * Cada "árvore" de indicações gera uma rede com rede_id derivado do ID
 * do cliente-raiz. Nível e parentesco são calculados por BFS.
 *
 * @see database.types para tipagem completa
 */
import { supabase } from '../lib/supabase';
import type {
  Cliente,
  ClienteInsert,
  BloqueioRedeComCausador,
} from '../lib/database.types';
import type { BloqueioMotivo } from '../lib/database.types';

// ── Tipo auxiliar para o payload de criação de indicação ──────

export interface CriarIndicacaoPayload {
  nome: string;
  email: string;
  telefone: string;
  cpf?: string;
  sexo: 'masculino' | 'feminino';
  indicadoPor?: string; // cliente_id do indicador
  valor?: number;
}

// ── Helpers internos ─────────────────────────────────────────

/** Gera rede_id determinístico a partir do UUID do cliente-raiz */
function redeIdFromRoot(rootId: string): string {
  return `rede-${rootId.substring(0, 8)}`;
}

/** Tipo compatível com RedeIndicacaoComCliente para o adapter */
interface MembroRedeRow {
  id: string;
  cliente_id: string;
  indicado_por: string | null;
  nivel: number;
  rede_id: string;
  status: 'ativo' | 'bloqueado' | 'inativo';
  created_at: string;
  updated_at: string;
  clientes: {
    id: string;
    nome: string;
    email: string;
    telefone: string;
    status: 'em_dia' | 'a_vencer' | 'vencido';
    valor: number;
    bonus_acumulado: number;
    score_interno: number;
  } | null;
}

/**
 * Lê todos os clientes e constrói a rede de indicações por BFS,
 * usando `indicado_por` como aresta.
 */
async function buildRedeFromClientes(
  filterRedeId?: string,
): Promise<MembroRedeRow[]> {
  const { data, error } = await supabase
    .from('clientes')
    .select('*')
    .order('nome');

  if (error) throw new Error(error.message);
  const clientes = (data ?? []) as unknown as Cliente[];
  if (clientes.length === 0) return [];

  const clienteMap = new Map<string, Cliente>(clientes.map((c) => [c.id, c]));

  // Mapa de filhos: parentId → [childId, …]
  const childrenMap = new Map<string, string[]>();
  for (const c of clientes) {
    if (c.indicado_por && clienteMap.has(c.indicado_por)) {
      const arr = childrenMap.get(c.indicado_por) || [];
      arr.push(c.id);
      childrenMap.set(c.indicado_por, arr);
    }
  }

  // Marcar todos os clientes que participam de alguma cadeia
  const inNetwork = new Set<string>();
  for (const c of clientes) {
    if (c.indicado_por && clienteMap.has(c.indicado_por)) {
      inNetwork.add(c.id);
      // Subir a cadeia marcando ancestrais
      let cur: string | null = c.indicado_por;
      while (cur && clienteMap.has(cur) && !inNetwork.has(cur)) {
        inNetwork.add(cur);
        cur = clienteMap.get(cur)!.indicado_por;
      }
    }
  }

  // Raízes: clientes na rede cujo indicado_por é null (ou fora da rede)
  const roots: string[] = [];
  for (const id of inNetwork) {
    const c = clienteMap.get(id)!;
    if (!c.indicado_por || !inNetwork.has(c.indicado_por)) {
      roots.push(id);
    }
  }

  // BFS → gerar MembroRedeRow[]
  const results: MembroRedeRow[] = [];

  for (const rootId of roots) {
    const currentRedeId = redeIdFromRoot(rootId);
    if (filterRedeId && currentRedeId !== filterRedeId) continue;

    const queue: { id: string; nivel: number; indicadoPor: string | null }[] = [
      { id: rootId, nivel: 1, indicadoPor: null },
    ];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const { id, nivel, indicadoPor } = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);

      const c = clienteMap.get(id);
      if (!c) continue;

      results.push({
        id: `ri-${id}`,
        cliente_id: c.id,
        indicado_por: indicadoPor,
        nivel,
        rede_id: currentRedeId,
        status: 'ativo',
        created_at: c.created_at,
        updated_at: c.created_at,
        clientes: {
          id: c.id,
          nome: c.nome,
          email: c.email,
          telefone: c.telefone,
          status: c.status,
          valor: c.valor,
          bonus_acumulado: c.bonus_acumulado,
          score_interno: c.score_interno,
        },
      });

      const children = childrenMap.get(id) || [];
      for (const childId of children) {
        if (!visited.has(childId)) {
          queue.push({ id: childId, nivel: nivel + 1, indicadoPor: id });
        }
      }
    }
  }

  return results;
}

// ── Queries de Membros da Rede ────────────────────────────────

/** Buscar todos os membros de todas as redes (derivado de clientes.indicado_por) */
export async function getMembrosRede(redeId?: string): Promise<MembroRedeRow[]> {
  return buildRedeFromClientes(redeId);
}

/** Buscar membros de uma rede específica */
export async function getMembrosByRede(redeId: string): Promise<MembroRedeRow[]> {
  return buildRedeFromClientes(redeId);
}

/** Buscar um membro específico por ID do cliente */
export async function getMembroById(clienteId: string): Promise<MembroRedeRow | null> {
  const all = await buildRedeFromClientes();
  return all.find((m) => m.cliente_id === clienteId) ?? null;
}

/** Listar IDs únicos de redes */
export async function getRedesUnicas(): Promise<string[]> {
  const all = await buildRedeFromClientes();
  return [...new Set(all.map((m) => m.rede_id))];
}

/** Criar um novo cliente vinculado a um indicador (cria a relação na rede) */
export async function createIndicacao(payload: CriarIndicacaoPayload): Promise<Cliente> {
  const insert: ClienteInsert = {
    nome: payload.nome,
    email: payload.email,
    telefone: payload.telefone,
    cpf: payload.cpf || null,
    sexo: payload.sexo,
    indicado_por: payload.indicadoPor || null,
    vencimento: new Date().toISOString().split('T')[0],
    valor: payload.valor ?? 0,
  };

  const { data, error } = await supabase
    .from('clientes')
    .insert(insert as never)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/** Vincular um cliente existente a um indicador */
export async function vincularIndicacao(clienteId: string, indicadoPor: string): Promise<void> {
  const { error } = await supabase
    .from('clientes')
    .update({ indicado_por: indicadoPor } as never)
    .eq('id', clienteId);

  if (error) throw new Error(error.message);
}

// ── Queries de Bloqueios ──────────────────────────────────────

/** Buscar todos os bloqueios (opcionalmente por rede) */
export async function getBloqueiosRede(redeId?: string): Promise<BloqueioRedeComCausador[]> {
  let query = supabase
    .from('bloqueios_rede')
    .select('*, clientes:causado_por(nome)')
    .order('bloqueado_em', { ascending: false });

  if (redeId) query = query.eq('rede_id', redeId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as BloqueioRedeComCausador[]).map((b) => ({
    ...b,
    clientes: b.clientes ?? { nome: 'Desconhecido' },
  }));
}

/** Buscar bloqueios ativos */
export async function getBloqueiosAtivos(): Promise<BloqueioRedeComCausador[]> {
  const { data, error } = await supabase
    .from('bloqueios_rede')
    .select('*, clientes:causado_por(nome)')
    .eq('ativo', true)
    .order('bloqueado_em', { ascending: false });

  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as BloqueioRedeComCausador[]).map((b) => ({
    ...b,
    clientes: b.clientes ?? { nome: 'Desconhecido' },
  }));
}

/** Criar novo bloqueio */
export async function criarBloqueio(bloqueio: {
  rede_id: string;
  causado_por?: string | null;
  motivo: BloqueioMotivo;
  descricao?: string | null;
}): Promise<void> {
  const { error } = await supabase
    .from('bloqueios_rede')
    .insert(bloqueio as never);

  if (error) throw new Error(error.message);
}

/** Desbloquear rede (marcar bloqueio como inativo) */
export async function desbloquearRede(bloqueioId: string, _redeId: string): Promise<void> {
  const { error } = await supabase
    .from('bloqueios_rede')
    .update({ ativo: false, desbloqueado_em: new Date().toISOString() } as never)
    .eq('id', bloqueioId);

  if (error) throw new Error(error.message);
}

/** Bloquear toda uma rede */
export async function bloquearRede(redeId: string, causadoPor: string, motivo: string): Promise<void> {
  await criarBloqueio({
    rede_id: redeId,
    causado_por: causadoPor,
    motivo: 'manual',
    descricao: motivo,
  });
}
