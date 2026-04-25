/**
 * @module juros
 * @description Configuração global de juros automáticos por atraso.
 *
 * Regra padrão (overridável via `configuracoes_sistema` no Supabase):
 *  - Valor original < limiar → fixo R$/dia de atraso
 *  - Valor original ≥ limiar → percentual do valor original / dia
 *  - Juros param de correr após `juros_dias_max` dias de atraso
 *  - Quando o empréstimo está arquivado/perdido no Kanban, juros também
 *    param (ver `valorCorrigido` com `options.congelarJuros`).
 *
 * Os valores podem ser alterados em runtime via `setJurosConfig(...)`.
 * O hook `useSyncJurosConfig` (chamado em App.tsx) propaga mudanças do
 * banco automaticamente.
 */

/** Defaults — usados se o banco não tiver valor configurado */
export const JUROS_FIXO_DIA_DEFAULT = 100;   // R$
export const JUROS_PERC_DIA_DEFAULT = 0.10;  // 10%
export const JUROS_LIMIAR_DEFAULT = 1_000;   // R$
export const JUROS_DIAS_MAX_DEFAULT = 365;   // dias

/** Runtime mutável — atualizado por setJurosConfig */
const runtime = {
  fixoDia: JUROS_FIXO_DIA_DEFAULT,
  percDia: JUROS_PERC_DIA_DEFAULT,
  limiar: JUROS_LIMIAR_DEFAULT,
  diasMax: JUROS_DIAS_MAX_DEFAULT,
};

/** Retrocompat — leitura pontual (snapshot do runtime no momento do import) */
export const JUROS_FIXO_DIA = runtime.fixoDia;
export const JUROS_PERC_DIA = runtime.percDia;
export const JUROS_LIMIAR = runtime.limiar;
export const JUROS_DIAS_MAX = runtime.diasMax;

export interface JurosConfigPartial {
  fixoDia?: number;
  percDia?: number;
  limiar?: number;
  diasMax?: number;
}

/** Atualiza os parâmetros de juros em runtime. Valores inválidos são ignorados. */
export function setJurosConfig(partial: JurosConfigPartial): void {
  if (typeof partial.fixoDia === 'number' && partial.fixoDia >= 0) runtime.fixoDia = partial.fixoDia;
  if (typeof partial.percDia === 'number' && partial.percDia >= 0) runtime.percDia = partial.percDia;
  if (typeof partial.limiar === 'number' && partial.limiar >= 0) runtime.limiar = partial.limiar;
  if (typeof partial.diasMax === 'number' && partial.diasMax >= 0) runtime.diasMax = Math.floor(partial.diasMax);
}

/** Retorna snapshot atual dos parâmetros de juros em runtime. */
export function getJurosConfig() {
  return {
    fixoDia: runtime.fixoDia,
    percDia: runtime.percDia,
    limiar: runtime.limiar,
    diasMax: runtime.diasMax,
  };
}

/**
 * Calcula juros automáticos com base no valor original e dias de atraso.
 * Usa os parâmetros de runtime (configuráveis).
 */
export function calcularJurosAtraso(valorOriginal: number, diasAtraso: number): number {
  if (diasAtraso <= 0 || valorOriginal <= 0) return 0;
  const dias = Math.min(diasAtraso, runtime.diasMax);
  if (valorOriginal < runtime.limiar) {
    return runtime.fixoDia * dias;
  }
  return Math.round(valorOriginal * runtime.percDia * dias * 100) / 100;
}

/**
 * Calcula dias de atraso de uma parcela a partir da data de vencimento.
 * Trata strings ISO yyyy-mm-dd como datas LOCAIS (evita shift de timezone
 * que faria "2026-04-10" virar "09/04" em UTC-3).
 * @param dataVencimento ISO date string ou Date
 * @returns Número de dias de atraso (0 se não vencida)
 */
export function diasDeAtraso(dataVencimento: string | Date): number {
  let venc: Date;
  if (typeof dataVencimento === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dataVencimento);
    venc = m
      ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
      : new Date(dataVencimento);
  } else {
    venc = new Date(dataVencimento);
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  venc.setHours(0, 0, 0, 0);
  const diff = Math.floor((today.getTime() - venc.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, diff);
}

/**
 * Retorna o valor total corrigido (valorOriginal + juros automáticos).
 * Usa juros do banco se já preenchido; caso contrário calcula automaticamente.
 *
 * @param valorOriginal  Valor base da parcela
 * @param dataVencimento Data de vencimento
 * @param jurosManual    Juros já registrado no banco (default 0)
 * @param multa          Multa já registrada (default 0)
 * @param desconto       Desconto aplicado (default 0)
 * @param options        { congelarJuros?: boolean } — se true (ex.: empréstimo
 *                       arquivado ou perdido no kanban), juros param de correr
 *                       e o total retorna apenas valorOriginal + jurosManual + multa - desconto.
 */
export function valorCorrigido(
  valorOriginal: number,
  dataVencimento: string | Date,
  jurosManual = 0,
  multa = 0,
  desconto = 0,
  options: { congelarJuros?: boolean } = {},
): { total: number; juros: number; dias: number } {
  const dias = diasDeAtraso(dataVencimento);
  let juros: number;
  if (options.congelarJuros) {
    juros = jurosManual > 0 ? jurosManual : 0;
  } else {
    juros = jurosManual > 0 ? jurosManual : calcularJurosAtraso(valorOriginal, dias);
  }
  const total = Math.max(valorOriginal + juros + multa - desconto, 0);
  return { total, juros, dias: Math.min(dias, runtime.diasMax) };
}
