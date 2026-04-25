/**
 * @module date-utils
 * @description Helpers de data sem bug de timezone.
 *
 * `new Date("2026-04-25")` é interpretado como UTC midnight pelo JS, e ao formatar
 * em fuso UTC-3 vira "24/04/2026". Estes helpers tratam strings ISO YYYY-MM-DD
 * (vindas de colunas DATE do Postgres) preservando o dia local.
 */

/** Converte "yyyy-mm-dd" para Date local à 00:00 (sem shift de timezone). */
export function parseISODateLocal(s: string | null | undefined): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return new Date(s);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** Formata "yyyy-mm-dd" como "dd/mm/aaaa" (pt-BR), preservando o dia. */
export function formatDateBR(s: string | null | undefined): string {
  const d = parseISODateLocal(s);
  if (!d) return '—';
  return d.toLocaleDateString('pt-BR');
}

/** Hoje no formato yyyy-mm-dd (timezone local). */
export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
