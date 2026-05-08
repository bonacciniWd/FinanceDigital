/**
 * Filtros e regras compartilhadas para empréstimos/parcelas.
 *
 * Regra principal: parcelas com diasAtraso > 365 OU congelada=true são
 * "arquivadas" e NÃO devem aparecer em dashboards financeiros nem na
 * lista padrão de cobrança. Apenas relatórios históricos podem incluí-las.
 */

/** Data ISO (yyyy-mm-dd) de hoje, considerando timezone local. */
export function hojeIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** ISO da data limite "365 dias atrás" — parcelas com data_vencimento ANTES disso são congeladas. */
export function limiteCongeladoIso(): string {
  const d = new Date();
  d.setDate(d.getDate() - 365);
  return d.toISOString().slice(0, 10);
}

/** ISO do primeiro dia do mês atual. */
export function inicioMesIso(): string {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

/** ISO do dia daqui a N dias. */
export function futuroIso(diasAFrente: number): string {
  const d = new Date();
  d.setDate(d.getDate() + diasAFrente);
  return d.toISOString().slice(0, 10);
}

/** Status de parcelas que ainda têm valor a receber. */
export const STATUS_ABERTOS = ['pendente', 'vencida'] as const;
