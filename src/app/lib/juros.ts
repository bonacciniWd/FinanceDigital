/**
 * @module juros
 * @description Configuração global de juros automáticos por atraso.
 *
 * Regra:
 *  - Valor original < R$1.000 → R$100 / dia de atraso
 *  - Valor original ≥ R$1.000 → 10% do valor original / dia de atraso
 */

/** Valor fixo diário para dívidas abaixo do limiar */
export const JUROS_FIXO_DIA = 100; // R$

/** Percentual diário para dívidas ≥ limiar */
export const JUROS_PERC_DIA = 0.10; // 10%

/** Limiar que separa regra fixa da percentual */
export const JUROS_LIMIAR = 1_000; // R$

/**
 * Calcula juros automáticos com base no valor original e dias de atraso.
 * @param valorOriginal Valor da parcela sem juros/multa
 * @param diasAtraso    Dias corridos após o vencimento (≤ 0 retorna 0)
 * @returns Valor de juros em R$
 */
export function calcularJurosAtraso(valorOriginal: number, diasAtraso: number): number {
  if (diasAtraso <= 0 || valorOriginal <= 0) return 0;
  if (valorOriginal < JUROS_LIMIAR) {
    return JUROS_FIXO_DIA * diasAtraso;
  }
  return Math.round(valorOriginal * JUROS_PERC_DIA * diasAtraso * 100) / 100;
}

/**
 * Calcula dias de atraso de uma parcela a partir da data de vencimento.
 * @param dataVencimento ISO date string ou Date
 * @returns Número de dias de atraso (0 se não vencida)
 */
export function diasDeAtraso(dataVencimento: string | Date): number {
  const venc = typeof dataVencimento === 'string' ? new Date(dataVencimento) : dataVencimento;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  venc.setHours(0, 0, 0, 0);
  const diff = Math.floor((today.getTime() - venc.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, diff);
}

/**
 * Retorna o valor total corrigido (valorOriginal + juros automáticos).
 * Usa juros do banco se já preenchido; caso contrário calcula automaticamente.
 * @param valorOriginal  Valor base da parcela
 * @param dataVencimento Data de vencimento
 * @param jurosManual    Juros já registrado no banco (default 0)
 * @param multa          Multa já registrada (default 0)
 * @param desconto       Desconto aplicado (default 0)
 */
export function valorCorrigido(
  valorOriginal: number,
  dataVencimento: string | Date,
  jurosManual = 0,
  multa = 0,
  desconto = 0,
): { total: number; juros: number; dias: number } {
  const dias = diasDeAtraso(dataVencimento);
  const juros = jurosManual > 0 ? jurosManual : calcularJurosAtraso(valorOriginal, dias);
  const total = Math.max(valorOriginal + juros + multa - desconto, 0);
  return { total, juros, dias };
}
