/**
 * @module comissoesConfigService
 * @description CRUD para `comissoes_config` (nova arquitetura baseada em papel/nível).
 *
 * Substitui `comissoesSemanaisService` (legacy) progressivamente. A tabela
 * antiga ainda existe e pode ser consultada por código legado até a remoção
 * planejada em sprint posterior.
 */
import { supabase } from '../lib/supabase';
import type { ComissaoConfig, ComissaoConfigInput } from '../lib/comissoes-config';
import type { NivelCobranca } from '../lib/faixas-cobranca';

type DbRow = Record<string, unknown>;

interface ProfileMini {
  id: string;
  name: string;
  email: string;
  sigla: string | null;
  role: string;
}

function mapConfig(r: DbRow, profile?: ProfileMini): ComissaoConfig {
  return {
    id: r.id as string,
    tipo: r.tipo as ComissaoConfig['tipo'],
    nivelKanban: (r.nivel_kanban as NivelCobranca | null) ?? null,
    userId: (r.user_id as string | null) ?? null,
    pesoPct: Number(r.peso_pct ?? 100),
    pctSobreAcordos: Number(r.pct_sobre_acordos ?? 0),
    pctSobreParcelas: Number(r.pct_sobre_parcelas ?? 0),
    pctSobreAcordoParcela: Number(r.pct_sobre_acordo_parcela ?? 0),
    pctSobreEmprestimoEmDia: Number(r.pct_sobre_emprestimo_em_dia ?? 0),
    pctSobreTotalEntradas: Number(r.pct_sobre_total_entradas ?? 0),
    ativo: !!r.ativo,
    observacao: (r.observacao as string | null) ?? null,
    userNome: profile?.name,
    userSigla: profile?.sigla ?? null,
    userRole: profile?.role,
  };
}

export async function listComissoesConfigs(): Promise<ComissaoConfig[]> {
  // 1) configs
  const { data: rows, error } = await supabase
    .from('comissoes_config' as never)
    .select('*')
    .order('tipo', { ascending: true })
    .order('nivel_kanban', { ascending: true });
  if (error) throw error;

  const configs = (rows ?? []) as DbRow[];
  if (configs.length === 0) return [];

  // 2) hidrata profiles (apenas para configs com user_id setado)
  const userIds = Array.from(
    new Set(
      configs
        .map((r) => r.user_id as string | null)
        .filter((id): id is string => !!id),
    ),
  );
  const profilesById = new Map<string, ProfileMini>();
  if (userIds.length > 0) {
    const { data: profilesData, error: profErr } = await supabase
      .from('profiles')
      .select('id, name, email, sigla, role')
      .in('id', userIds);
    if (profErr) throw profErr;
    for (const p of (profilesData ?? []) as unknown as ProfileMini[]) {
      profilesById.set(p.id, p);
    }
  }

  return configs.map((r) => {
    const uid = r.user_id as string | null;
    return mapConfig(r, uid ? profilesById.get(uid) : undefined);
  });
}

export async function upsertComissaoConfig(
  input: ComissaoConfigInput & { id?: string },
): Promise<void> {
  const payload: Record<string, unknown> = {
    tipo: input.tipo,
    nivel_kanban: input.nivelKanban,
    user_id: input.userId || null,
    peso_pct: input.pesoPct,
    pct_sobre_acordos: input.pctSobreAcordos,
    pct_sobre_parcelas: input.pctSobreParcelas,
    pct_sobre_acordo_parcela: input.pctSobreAcordoParcela,
    pct_sobre_emprestimo_em_dia: input.pctSobreEmprestimoEmDia,
    pct_sobre_total_entradas: input.pctSobreTotalEntradas,
    ativo: input.ativo,
    observacao: input.observacao,
  };
  if (input.id) {
    const { error } = await supabase
      .from('comissoes_config' as never)
      .update(payload as never)
      .eq('id', input.id);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('comissoes_config' as never)
      .insert(payload as never);
    if (error) throw error;
  }
}

export async function deleteComissaoConfig(id: string): Promise<void> {
  const { error } = await supabase
    .from('comissoes_config' as never)
    .delete()
    .eq('id', id);
  if (error) throw error;
}
