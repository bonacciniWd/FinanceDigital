/** Formatadores compartilhados (BRL, datas pt-BR). */

const _brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const formatCurrency = (v: number | null | undefined) => _brl.format(Number(v) || 0);

const _num = new Intl.NumberFormat('pt-BR');
export const formatNumber = (v: number | null | undefined) => _num.format(Number(v) || 0);

/** ISO yyyy-mm-dd → "dd/mm/yyyy" (sem timezone shift). */
export function formatDateBR(iso?: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

/** Dias entre uma data ISO de vencimento e hoje (negativo se já venceu). */
export function diasAteVencimento(iso?: string | null): number {
  if (!iso) return 0;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const venc = new Date(y, (m ?? 1) - 1, d);
  return Math.round((venc.getTime() - hoje.getTime()) / 86400000);
}
