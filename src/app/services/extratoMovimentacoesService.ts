/**
 * @module extratoMovimentacoesService
 * @description Serviço para extrato consolidado da conta EFI (todas as
 * movimentações: PIX, TED, tarifas, recargas, devoluções, etc.).
 *
 * Importação atual: JSON exportado manualmente do painel EFI Bank.
 * Schema do JSON da EFI:
 *   { Tipo, Protocolo, Data: "DD/MM/YYYY", Valor: "1234,56" | "-1234,56", Saldo: "..." }
 *   (linhas "Saldo Diário" não têm Protocolo nem Saldo)
 */
import { supabase } from '../lib/supabase';

export type ExtratoCategoria =
  | 'pix_recebido'
  | 'pix_enviado'
  | 'pix_devolucao_recebida'
  | 'pix_devolucao_enviada'
  | 'tarifa'
  | 'recarga_celular'
  | 'ted_recebido'
  | 'ted_enviado'
  | 'boleto_pago'
  | 'boleto_recebido'
  | 'saldo_diario'
  | 'outros';

export type ExtratoDirection = 'entrada' | 'saida' | 'info';

export interface ExtratoMovimentacao {
  id: string;
  protocolo: number | null;
  categoria: ExtratoCategoria;
  direction: ExtratoDirection;
  descricaoCompleta: string;
  contraparteNome: string | null;
  data: string; // YYYY-MM-DD
  valor: number;
  saldoApos: number | null;
  ehSaldoDiario: boolean;
  source: string;
  raw: any;
  importedAt: string;
}

interface RawEfiLine {
  Tipo: string;
  Protocolo?: number;
  Data: string;
  Valor: string;
  Saldo?: string;
}

const _parseValor = (v: string): number => {
  // "1234,56" → 1234.56 ; "-300,00" → -300
  const cleaned = (v || '0').replace(/\./g, '').replace(',', '.');
  return parseFloat(cleaned) || 0;
};

const _parseData = (d: string): string => {
  // "08/04/2026" → "2026-04-08"
  const [day, month, year] = d.split('/');
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
};

const _classify = (tipoCompleto: string): { categoria: ExtratoCategoria; ehSaldoDiario: boolean } => {
  const t = tipoCompleto.toLowerCase();
  if (t.startsWith('saldo diário') || t.startsWith('saldo diario')) {
    return { categoria: 'saldo_diario', ehSaldoDiario: true };
  }
  if (t.startsWith('devolução de pix recebido') || t.startsWith('devolucao de pix recebido')) {
    return { categoria: 'pix_devolucao_enviada', ehSaldoDiario: false };
  }
  if (t.startsWith('devolução de pix enviado') || t.startsWith('devolucao de pix enviado')) {
    return { categoria: 'pix_devolucao_recebida', ehSaldoDiario: false };
  }
  if (t.startsWith('pix recebido')) return { categoria: 'pix_recebido', ehSaldoDiario: false };
  if (t.startsWith('pix enviado')) return { categoria: 'pix_enviado', ehSaldoDiario: false };
  if (t.startsWith('tarifa')) return { categoria: 'tarifa', ehSaldoDiario: false };
  if (t.startsWith('recarga')) return { categoria: 'recarga_celular', ehSaldoDiario: false };
  if (t.startsWith('ted recebido') || t.startsWith('ted recebida')) {
    return { categoria: 'ted_recebido', ehSaldoDiario: false };
  }
  if (t.startsWith('ted enviado') || t.startsWith('ted enviada')) {
    return { categoria: 'ted_enviado', ehSaldoDiario: false };
  }
  if (t.startsWith('boleto pago') || t.startsWith('pagamento de boleto')) {
    return { categoria: 'boleto_pago', ehSaldoDiario: false };
  }
  if (t.startsWith('boleto recebido')) return { categoria: 'boleto_recebido', ehSaldoDiario: false };
  return { categoria: 'outros', ehSaldoDiario: false };
};

const _extractContraparte = (tipo: string): string | null => {
  const idx = tipo.indexOf(' • ');
  if (idx < 0) return null;
  return tipo.slice(idx + 3).trim() || null;
};

/**
 * Converte o array bruto do JSON EFI no payload pronto pra inserir.
 */
export function parseEfiJson(raw: RawEfiLine[]): {
  rows: any[];
  stats: { total: number; entradas: number; saidas: number; saldoDiario: number };
} {
  const rows: any[] = [];
  const stats = { total: 0, entradas: 0, saidas: 0, saldoDiario: 0 };

  for (const line of raw) {
    if (!line?.Tipo || !line?.Data || line?.Valor == null) continue;

    const valorRaw = _parseValor(line.Valor);
    const { categoria, ehSaldoDiario } = _classify(line.Tipo);

    let direction: ExtratoDirection;
    if (ehSaldoDiario) {
      direction = 'info';
      stats.saldoDiario++;
    } else if (valorRaw < 0) {
      direction = 'saida';
      stats.saidas++;
    } else {
      direction = 'entrada';
      stats.entradas++;
    }

    rows.push({
      protocolo: line.Protocolo ?? null,
      categoria,
      direction,
      descricao_completa: line.Tipo,
      contraparte_nome: _extractContraparte(line.Tipo),
      data: _parseData(line.Data),
      valor: Math.abs(valorRaw),
      saldo_apos: line.Saldo ? _parseValor(line.Saldo) : null,
      eh_saldo_diario: ehSaldoDiario,
      source: 'json_import',
      raw: line,
    });
    stats.total++;
  }

  return { rows, stats };
}

/**
 * Upsert em lote — usa protocolo como chave de deduplicação.
 * Linhas de saldo diário deduplicam por data via índice parcial.
 */
export async function importExtratoJson(raw: RawEfiLine[]): Promise<{
  inserted: number;
  total: number;
  stats: { entradas: number; saidas: number; saldoDiario: number };
}> {
  const { rows, stats } = parseEfiJson(raw);
  if (!rows.length) return { inserted: 0, total: 0, stats: { entradas: 0, saidas: 0, saldoDiario: 0 } };

  // Separar linhas por chave de unicidade pra usar onConflict correto
  const comProtocolo = rows.filter((r) => r.protocolo != null);
  const saldoDiario = rows.filter((r) => r.eh_saldo_diario);
  const semChave = rows.filter((r) => r.protocolo == null && !r.eh_saldo_diario);

  let inserted = 0;
  const chunkSize = 500;

  // 1) Lançamentos com protocolo — upsert por protocolo
  for (let i = 0; i < comProtocolo.length; i += chunkSize) {
    const chunk = comProtocolo.slice(i, i + chunkSize);
    const { error, count } = await supabase
      .from('extrato_movimentacoes')
      .upsert(chunk, { onConflict: 'protocolo', count: 'exact' });
    if (error) throw new Error(`Falha ao importar lançamentos: ${error.message}`);
    inserted += count ?? chunk.length;
  }

  // 2) Saldo diário — upsert por data (índice parcial)
  for (let i = 0; i < saldoDiario.length; i += chunkSize) {
    const chunk = saldoDiario.slice(i, i + chunkSize);
    // Ignora se já existir (não tem onConflict para índice parcial direto;
    // usa insert e silencia conflito unique).
    const { error } = await supabase
      .from('extrato_movimentacoes')
      .insert(chunk);
    if (error && !error.message.includes('duplicate key')) {
      throw new Error(`Falha ao importar saldo diário: ${error.message}`);
    }
  }

  // 3) Sem protocolo nem saldo diário — insere puro (não deduplica)
  if (semChave.length > 0) {
    const { error } = await supabase.from('extrato_movimentacoes').insert(semChave);
    if (error) throw new Error(`Falha ao importar lançamentos avulsos: ${error.message}`);
    inserted += semChave.length;
  }

  return { inserted, total: rows.length, stats };
}

/**
 * Lista movimentações por intervalo de data (YYYY-MM-DD).
 * Por padrão exclui linhas de saldo diário.
 */
export async function getExtratoMovimentacoes(
  inicio: string,
  fim: string,
  opts: { incluirSaldoDiario?: boolean } = {}
): Promise<ExtratoMovimentacao[]> {
  let query = supabase
    .from('extrato_movimentacoes')
    .select('*')
    .gte('data', inicio)
    .lte('data', fim)
    .order('data', { ascending: false })
    .order('imported_at', { ascending: false });

  if (!opts.incluirSaldoDiario) query = query.eq('eh_saldo_diario', false);

  const { data, error } = await query.range(0, 49999);
  if (error) throw new Error(error.message);

  return (data ?? []).map((r: any) => ({
    id: r.id,
    protocolo: r.protocolo,
    categoria: r.categoria,
    direction: r.direction,
    descricaoCompleta: r.descricao_completa,
    contraparteNome: r.contraparte_nome,
    data: r.data,
    valor: parseFloat(r.valor),
    saldoApos: r.saldo_apos != null ? parseFloat(r.saldo_apos) : null,
    ehSaldoDiario: r.eh_saldo_diario,
    source: r.source,
    raw: r.raw,
    importedAt: r.imported_at,
  }));
}
