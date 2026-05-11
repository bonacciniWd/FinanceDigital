/**
 * @module comissoes-semanais
 * @description Cálculo de comissões semanais por funcionário com base nas regras
 * cadastradas em `comissoes_semanais_config` aplicadas sobre o extrato do período.
 */

export type TipoRegraComissao =
  | 'pct_entradas'
  | 'pct_saidas'
  | 'fixo'
  | 'fixo_pct_entradas'
  | 'fixo_pct_saidas';

export interface ComissaoSemanalConfig {
  id: string;
  nome: string;
  userId?: string | null;
  tipo: TipoRegraComissao;
  valorPct: number;     // ex.: 8 para 8%
  valorFixo: number;    // ex.: 500
  ativo: boolean;
  ordem: number;
  observacao?: string | null;
}

export interface ComissaoSemanalCalculada {
  configId: string;
  nome: string;
  tipo: TipoRegraComissao;
  descricaoRegra: string;
  base: number;          // valor base usado (entradas, saídas ou 0 se fixo puro)
  valorPct: number;
  valorFixo: number;
  valorCalculado: number;
}

const fmtBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

export function descreverRegra(c: Pick<ComissaoSemanalConfig, 'tipo' | 'valorPct' | 'valorFixo'>): string {
  const pct = `${c.valorPct.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
  const fix = fmtBRL(c.valorFixo);
  switch (c.tipo) {
    case 'pct_entradas':       return `${pct} das entradas`;
    case 'pct_saidas':         return `${pct} das saídas`;
    case 'fixo':               return `${fix} fixo/semana`;
    case 'fixo_pct_entradas':  return `${fix} + ${pct} das entradas`;
    case 'fixo_pct_saidas':    return `${fix} + ${pct} das saídas`;
    default:                   return '—';
  }
}

export interface CalcularComissoesInput {
  configs: ComissaoSemanalConfig[];
  totalEntradas: number;
  totalSaidas: number;
}

export function calcularComissoesSemanais({
  configs,
  totalEntradas,
  totalSaidas,
}: CalcularComissoesInput): ComissaoSemanalCalculada[] {
  return configs
    .filter((c) => c.ativo)
    .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0) || a.nome.localeCompare(b.nome))
    .map((c) => {
      let base = 0;
      let pctParte = 0;
      let fixoParte = 0;

      switch (c.tipo) {
        case 'pct_entradas':
          base = totalEntradas;
          pctParte = (totalEntradas * c.valorPct) / 100;
          break;
        case 'pct_saidas':
          base = totalSaidas;
          pctParte = (totalSaidas * c.valorPct) / 100;
          break;
        case 'fixo':
          fixoParte = c.valorFixo;
          break;
        case 'fixo_pct_entradas':
          base = totalEntradas;
          fixoParte = c.valorFixo;
          pctParte = (totalEntradas * c.valorPct) / 100;
          break;
        case 'fixo_pct_saidas':
          base = totalSaidas;
          fixoParte = c.valorFixo;
          pctParte = (totalSaidas * c.valorPct) / 100;
          break;
      }

      return {
        configId: c.id,
        nome: c.nome,
        tipo: c.tipo,
        descricaoRegra: descreverRegra(c),
        base,
        valorPct: c.valorPct,
        valorFixo: c.valorFixo,
        valorCalculado: Math.max(0, +(fixoParte + pctParte).toFixed(2)),
      };
    });
}

export function totalComissoesSemanais(calculadas: ComissaoSemanalCalculada[]): number {
  return calculadas.reduce((s, c) => s + c.valorCalculado, 0);
}
