/**
 * Tipos da nova arquitetura de comissões (introduzida em 1.10.0).
 *
 * - `kanban_nivel`: cobrador vinculado a uma faixa N1/N2/N3/N4 do Kanban Cobrança.
 *     • N1/N2 → pct_sobre_acordos + pct_sobre_parcelas
 *     • N3/N4 → pct_sobre_acordo_parcela + pct_sobre_emprestimo_em_dia
 *   Múltiplos usuários por nível são permitidos: a soma de `pesoPct` define
 *   a divisão do bolo (ex.: 60/40).
 * - `gerente_pct`: % sobre total de entradas da semana (default ~3%, configurável).
 * - `dono_pct`: % sobre total de entradas da semana (default ~20%).
 *
 * Substitui `comissoes-semanais.ts` (legacy).
 */

import type { NivelCobranca } from './faixas-cobranca';

export type TipoComissaoConfig = 'kanban_nivel' | 'gerente_pct' | 'dono_pct';

export interface ComissaoConfig {
  id: string;
  tipo: TipoComissaoConfig;
  nivelKanban: NivelCobranca | null;
  /** NULL apenas quando tipo='dono_pct' (dono sem conta no sistema). */
  userId: string | null;
  /** 0-100. Soma dos ativos do mesmo (tipo, nivel) deveria ser 100. */
  pesoPct: number;

  // ─ Percentuais (todos default 0; cada tipo usa um subconjunto) ─
  /** N1/N2: % sobre o valor total de acordos novos fechados na semana. */
  pctSobreAcordos: number;
  /** N1/N2: % sobre parcelas pagas em dia (não-acordo) na semana. */
  pctSobreParcelas: number;
  /** N3/N4: % sobre cada parcela de acordo paga (acumulando, sem somar valor total do acordo). */
  pctSobreAcordoParcela: number;
  /** N3/N4: % sobre empréstimos cadastrados pelo usuário e pagos em dia. */
  pctSobreEmprestimoEmDia: number;
  /** Gerente/Dono: % sobre total de entradas da semana. */
  pctSobreTotalEntradas: number;

  ativo: boolean;
  observacao: string | null;

  // Hidratado opcionalmente pelo service via join com profiles
  userNome?: string;
  userSigla?: string | null;
  userRole?: string;
}

/** Campos editáveis no formulário (sem id/timestamps/foreign joins). */
export type ComissaoConfigInput = Omit<
  ComissaoConfig,
  'id' | 'userNome' | 'userSigla' | 'userRole'
>;

/** Cria um input em branco com defaults consistentes para o tipo dado. */
export function novaConfigPadrao(tipo: TipoComissaoConfig, userId: string | null = ''): ComissaoConfigInput {
  return {
    tipo,
    nivelKanban: tipo === 'kanban_nivel' ? 'n1' : null,
    userId: tipo === 'dono_pct' ? (userId || null) : (userId ?? ''),
    pesoPct: 100,
    pctSobreAcordos: 0,
    pctSobreParcelas: 0,
    pctSobreAcordoParcela: 0,
    pctSobreEmprestimoEmDia: 0,
    pctSobreTotalEntradas: tipo === 'dono_pct' ? 20 : tipo === 'gerente_pct' ? 3 : 0,
    ativo: true,
    observacao: null,
  };
}

/** Quais campos de % são relevantes para um dado tipo/nível. */
export function camposPctRelevantes(
  tipo: TipoComissaoConfig,
  nivel: NivelCobranca | null,
): Array<keyof Pick<ComissaoConfig,
  'pctSobreAcordos' | 'pctSobreParcelas' | 'pctSobreAcordoParcela' | 'pctSobreEmprestimoEmDia' | 'pctSobreTotalEntradas'
>> {
  if (tipo === 'kanban_nivel') {
    if (nivel === 'n1' || nivel === 'n2') return ['pctSobreAcordos', 'pctSobreParcelas'];
    if (nivel === 'n3' || nivel === 'n4') return ['pctSobreAcordoParcela', 'pctSobreEmprestimoEmDia'];
    return [];
  }
  return ['pctSobreTotalEntradas'];
}

/** Label legível do tipo+nível. */
export function descreverConfig(tipo: TipoComissaoConfig, nivel: NivelCobranca | null): string {
  switch (tipo) {
    case 'kanban_nivel':
      if (nivel === 'n1' || nivel === 'n2') return 'Cobrador N1+N2 (recente)';
      if (nivel === 'n3' || nivel === 'n4') return 'Cobrador N3+N4 (antigo)';
      return 'Cobrador';
    case 'gerente_pct':
      return 'Gerente (% entradas)';
    case 'dono_pct':
      return 'Dono (% entradas)';
  }
}

/** Grupo do nível para fins de comissão (N1+N2 vs N3+N4). */
export type GrupoCobrancaConfig = 'early' | 'late';
export function grupoDeNivel(nivel: NivelCobranca | null): GrupoCobrancaConfig | null {
  if (nivel === 'n1' || nivel === 'n2') return 'early';
  if (nivel === 'n3' || nivel === 'n4') return 'late';
  return null;
}
/** Nível canônico a salvar no DB para representar o grupo (n1 → early, n3 → late). */
export function nivelCanonicoDoGrupo(grupo: GrupoCobrancaConfig): NivelCobranca {
  return grupo === 'early' ? 'n1' : 'n3';
}
