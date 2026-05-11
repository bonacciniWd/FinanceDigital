/**
 * @module pdf-report
 * @description Gerador de PDF executivo padrão da Casa da Moeda — usa jsPDF + autoTable.
 *
 * Padrão visual:
 * - Cabeçalho: logo `logo-wide.png` à esquerda + título + período à direita
 * - Seções: KPIs em grid, tabelas de extrato (entradas/saídas) e empréstimos
 * - Rodapé com numeração de página + data/hora de geração
 *
 * Importação de imagem: usa `import logoUrl from '../assets/logo-wide.png'`
 * (Vite resolve para uma URL acessível em runtime). Convertemos pra dataURL
 * via canvas antes de injetar no jsPDF, pois jsPDF.addImage aceita base64 ou HTMLImageElement.
 */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import logoWide from '../assets/logo-wide.png';
import type { ComissaoSemanalCalculada } from './comissoes-semanais';

const fmtBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

const fmtDateBR = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

const fmtDateTimeBR = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

/** Carrega a logo como dataURL. Cacheia em memória após o primeiro carregamento. */
let logoDataUrlCache: string | null = null;
async function getLogoDataUrl(): Promise<string | null> {
  if (logoDataUrlCache) return logoDataUrlCache;
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = logoWide;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = (e) => reject(e);
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    logoDataUrlCache = canvas.toDataURL('image/png');
    return logoDataUrlCache;
  } catch {
    return null;
  }
}

export interface RelatorioExtratoItem {
  horario: string;
  direction: 'entrada' | 'saida';
  nome: string;
  descricao: string;
  valor: number;
  e2eId?: string;
  status?: string;
}

export interface RelatorioEmprestimoItem {
  dataContrato: string;
  clienteNome: string;
  valor: number;
  status: string;
  desembolsado: boolean;
}

export interface RelatorioGastoInternoItem {
  horario: string;
  categoria: string;
  favorecido: string;
  descricao: string;
  valor: number;
}

export interface RelatorioExecutivoData {
  /** Período do relatório (ISO yyyy-mm-dd) */
  periodoInicio: string;
  periodoFim: string;
  /** Empréstimos cadastrados no período */
  emprestimos: RelatorioEmprestimoItem[];
  /** Itens do extrato (entradas + saídas) — mesma estrutura da PagamentosWooviPage */
  extrato: RelatorioExtratoItem[];
  /** Saldo informativo da conta EFI no momento da geração */
  saldoEfi?: number;
  /** Nome da empresa/fintech (rodapé) */
  empresaNome?: string;
  /** Subtítulo opcional (ex.: nome do operador que gerou) */
  subtitulo?: string;
  /** Comissões semanais calculadas por funcionário (regras de `comissoes_semanais_config`) */
  comissoesSemanais?: ComissaoSemanalCalculada[];
  /** Gastos internos classificados no período (categoria · favorecido · valor) */
  gastosInternos?: RelatorioGastoInternoItem[];
}

/**
 * Gera e baixa um PDF executivo com:
 * - Cabeçalho com logo
 * - KPIs (empréstimos cadastrados, total entradas, total saídas, saldo período)
 * - Tabela resumo de empréstimos
 * - Tabela de entradas (Pix recebidos)
 * - Tabela de saídas (Pix enviados)
 *
 * NOTA: relatório de cobranças intencionalmente omitido — a maioria dos pagamentos
 * acontece fora da plataforma de cobranças (pagamento interno/informal).
 */
export interface GerarRelatorioPdfOptions {
  /** 'save' (default) baixa o arquivo. 'base64' retorna data URI. 'blob' retorna Blob para upload. */
  output?: 'save' | 'base64' | 'blob';
}

export async function gerarRelatorioExecutivoPdf(
  data: RelatorioExecutivoData,
  options: GerarRelatorioPdfOptions = {},
): Promise<string | Blob | void> {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40;

  const logoUrl = await getLogoDataUrl();

  // ── Cabeçalho ─────────────────────────────────────────────
  if (logoUrl) {
    // logo-wide → mantém aspect ratio, altura fixa de 32pt
    try {
      const imgProps = doc.getImageProperties(logoUrl);
      const h = 32;
      const w = (imgProps.width / imgProps.height) * h;
      doc.addImage(logoUrl, 'PNG', margin, margin, w, h);
    } catch {
      // se der erro, segue sem logo
    }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(20, 20, 20);
  doc.text('Relatório Executivo', pageW - margin, margin + 12, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(90, 90, 90);
  const periodoStr = `Período: ${fmtDateBR(data.periodoInicio)} a ${fmtDateBR(data.periodoFim)}`;
  doc.text(periodoStr, pageW - margin, margin + 28, { align: 'right' });
  if (data.subtitulo) {
    doc.text(data.subtitulo, pageW - margin, margin + 42, { align: 'right' });
  }

  let cursorY = margin + 60;
  doc.setDrawColor(220);
  doc.line(margin, cursorY, pageW - margin, cursorY);
  cursorY += 18;

  // ── KPIs ──────────────────────────────────────────────────
  const totalEmprestimos = data.emprestimos.length;
  const valorEmprestimos = data.emprestimos.reduce((s, e) => s + e.valor, 0);
  const entradas = data.extrato.filter((i) => i.direction === 'entrada');
  const saidas = data.extrato.filter((i) => i.direction === 'saida');
  const totalEntradas = entradas.reduce((s, i) => s + i.valor, 0);
  const totalSaidas = saidas.reduce((s, i) => s + i.valor, 0);
  const saldoPeriodo = totalEntradas - totalSaidas;

  const kpis: Array<{ label: string; valor: string; sub?: string }> = [
    { label: 'Empréstimos cadastrados', valor: String(totalEmprestimos), sub: fmtBRL(valorEmprestimos) },
    { label: 'Entradas (Pix recebidos)', valor: String(entradas.length), sub: fmtBRL(totalEntradas) },
    { label: 'Saídas (Pix enviados)', valor: String(saidas.length), sub: fmtBRL(totalSaidas) },
    { label: 'Saldo do período', valor: fmtBRL(saldoPeriodo), sub: data.saldoEfi != null ? `EFI: ${fmtBRL(data.saldoEfi)}` : undefined },
  ];

  const cardW = (pageW - margin * 2 - 12 * 3) / 4;
  const cardH = 56;
  kpis.forEach((k, i) => {
    const x = margin + i * (cardW + 12);
    doc.setDrawColor(220);
    doc.setFillColor(247, 248, 250);
    doc.roundedRect(x, cursorY, cardW, cardH, 4, 4, 'FD');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(110, 110, 110);
    doc.text(k.label, x + 8, cursorY + 14);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(20, 20, 20);
    doc.text(k.valor, x + 8, cursorY + 32);
    if (k.sub) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(110, 110, 110);
      doc.text(k.sub, x + 8, cursorY + 48);
    }
  });
  cursorY += cardH + 18;

  // Aviso sobre cobranças
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.setTextColor(140, 140, 140);
  doc.text(
    'Observação: cobranças geradas no sistema são pouco utilizadas — a maior parte dos pagamentos é conciliada via extrato bancário (entradas).',
    margin,
    cursorY,
  );
  cursorY += 16;

  // ── Tabela: Comissões semanais por funcionário ──────────
  if (data.comissoesSemanais && data.comissoesSemanais.length > 0) {
    const totalComissoes = data.comissoesSemanais.reduce((s, c) => s + c.valorCalculado, 0);
    autoTable(doc, {
      startY: cursorY,
      head: [['Funcionário', 'Regra', 'Base', 'Valor da semana']],
      body: data.comissoesSemanais.map((c) => [
        c.nome,
        c.descricaoRegra,
        c.tipo === 'fixo' ? '—' : fmtBRL(c.base),
        fmtBRL(c.valorCalculado),
      ]),
      foot: [['', '', 'TOTAL', fmtBRL(totalComissoes)]],
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [120, 53, 15], textColor: 255, fontStyle: 'bold' },
      footStyles: { fillColor: [254, 243, 199], textColor: 20, fontStyle: 'bold' },
      columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' } },
      margin: { left: margin, right: margin },
      didDrawPage: () => drawPageHeader(doc, pageW, margin, periodoStr, logoUrl),
    });
    cursorY = (doc as any).lastAutoTable?.finalY ?? cursorY;
    cursorY += 16;
  }

  // ── Tabela: Gastos internos classificados no período ──────────
  if (data.gastosInternos && data.gastosInternos.length > 0) {
    // Subtotal por categoria
    const porCategoria = new Map<string, { count: number; total: number }>();
    for (const g of data.gastosInternos) {
      const k = g.categoria || '—';
      const cur = porCategoria.get(k) ?? { count: 0, total: 0 };
      cur.count += 1;
      cur.total += g.valor;
      porCategoria.set(k, cur);
    }
    const totalGastos = data.gastosInternos.reduce((s, g) => s + g.valor, 0);

    autoTable(doc, {
      startY: cursorY,
      head: [['Categoria', 'Lançamentos', 'Total']],
      body: Array.from(porCategoria.entries())
        .sort((a, b) => b[1].total - a[1].total)
        .map(([cat, v]) => [cat, String(v.count), fmtBRL(v.total)]),
      foot: [['TOTAL', String(data.gastosInternos.length), fmtBRL(totalGastos)]],
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [127, 29, 29], textColor: 255, fontStyle: 'bold' },
      footStyles: { fillColor: [254, 226, 226], textColor: 20, fontStyle: 'bold' },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
      margin: { left: margin, right: margin },
      didDrawPage: () => drawPageHeader(doc, pageW, margin, periodoStr, logoUrl),
    });
    cursorY = (doc as any).lastAutoTable?.finalY ?? cursorY;
    cursorY += 10;

    // Detalhe (limitado a 50 linhas para não explodir o PDF)
    const detalhes = data.gastosInternos.slice(0, 50);
    autoTable(doc, {
      startY: cursorY,
      head: [['Data', 'Categoria', 'Favorecido', 'Descrição', 'Valor']],
      body: detalhes.map((g) => [
        fmtDateBR(g.horario),
        g.categoria,
        g.favorecido || '—',
        g.descricao || '—',
        fmtBRL(g.valor),
      ]),
      styles: { fontSize: 7, cellPadding: 3 },
      headStyles: { fillColor: [180, 83, 9], textColor: 255, fontStyle: 'bold' },
      columnStyles: { 4: { halign: 'right' } },
      margin: { left: margin, right: margin },
      didDrawPage: () => drawPageHeader(doc, pageW, margin, periodoStr, logoUrl),
    });
    if (data.gastosInternos.length > detalhes.length) {
      const finalY = (doc as any).lastAutoTable?.finalY ?? cursorY;
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(7);
      doc.setTextColor(140, 140, 140);
      doc.text(
        `(+ ${data.gastosInternos.length - detalhes.length} lançamentos adicionais omitidos)`,
        margin,
        finalY + 10,
      );
      cursorY = finalY + 18;
    } else {
      cursorY = (doc as any).lastAutoTable?.finalY ?? cursorY;
    }
    cursorY += 16;
  }

  // ── Tabela: Empréstimos cadastrados ──────────────────────
  if (data.emprestimos.length > 0) {
    autoTable(doc, {
      startY: cursorY,
      head: [['Data', 'Cliente', 'Valor', 'Status', 'Desembolsado']],
      body: data.emprestimos
        .slice()
        .sort((a, b) => new Date(b.dataContrato).getTime() - new Date(a.dataContrato).getTime())
        .map((e) => [
          fmtDateBR(e.dataContrato),
          e.clienteNome || '—',
          fmtBRL(e.valor),
          e.status,
          e.desembolsado ? 'Sim' : 'Não',
        ]),
      foot: [['', 'TOTAL', fmtBRL(valorEmprestimos), '', '']],
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold' },
      footStyles: { fillColor: [240, 240, 240], textColor: 20, fontStyle: 'bold' },
      margin: { left: margin, right: margin },
      didDrawPage: () => drawPageHeader(doc, pageW, margin, periodoStr, logoUrl),
    });
    cursorY = (doc as any).lastAutoTable?.finalY ?? cursorY;
    cursorY += 16;
  }

  // ── Tabela: Entradas ─────────────────────────────────────
  if (entradas.length > 0) {
    autoTable(doc, {
      startY: cursorY,
      head: [['Data/Hora', 'Pagador', 'Descrição', 'Valor']],
      body: entradas
        .slice()
        .sort((a, b) => new Date(b.horario).getTime() - new Date(a.horario).getTime())
        .map((i) => [fmtDateTimeBR(i.horario), i.nome || '—', i.descricao || '—', fmtBRL(i.valor)]),
      foot: [['', '', 'TOTAL ENTRADAS', fmtBRL(totalEntradas)]],
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [22, 163, 74], textColor: 255, fontStyle: 'bold' },
      footStyles: { fillColor: [220, 252, 231], textColor: 20, fontStyle: 'bold' },
      columnStyles: { 3: { halign: 'right' } },
      margin: { left: margin, right: margin },
      didDrawPage: () => drawPageHeader(doc, pageW, margin, periodoStr, logoUrl),
    });
    cursorY = (doc as any).lastAutoTable?.finalY ?? cursorY;
    cursorY += 16;
  }

  // ── Tabela: Saídas ───────────────────────────────────────
  if (saidas.length > 0) {
    autoTable(doc, {
      startY: cursorY,
      head: [['Data/Hora', 'Favorecido', 'Descrição', 'Valor']],
      body: saidas
        .slice()
        .sort((a, b) => new Date(b.horario).getTime() - new Date(a.horario).getTime())
        .map((i) => [fmtDateTimeBR(i.horario), i.nome || '—', i.descricao || '—', fmtBRL(i.valor)]),
      foot: [['', '', 'TOTAL SAÍDAS', fmtBRL(totalSaidas)]],
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [220, 38, 38], textColor: 255, fontStyle: 'bold' },
      footStyles: { fillColor: [254, 226, 226], textColor: 20, fontStyle: 'bold' },
      columnStyles: { 3: { halign: 'right' } },
      margin: { left: margin, right: margin },
      didDrawPage: () => drawPageHeader(doc, pageW, margin, periodoStr, logoUrl),
    });
  }

  // ── Rodapé com numeração ─────────────────────────────────
  const totalPages = doc.getNumberOfPages();
  const empresa = data.empresaNome || 'Fintech';
  const geradoEm = new Date().toLocaleString('pt-BR');
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(140, 140, 140);
    doc.text(`${empresa} · Gerado em ${geradoEm}`, margin, pageH - 18);
    doc.text(`Página ${p} de ${totalPages}`, pageW - margin, pageH - 18, { align: 'right' });
  }

  const fname = `relatorio-executivo_${data.periodoInicio}_${data.periodoFim}.pdf`;
  if (options.output === 'base64') {
    return doc.output('datauristring', { filename: fname });
  }
  if (options.output === 'blob') {
    return doc.output('blob');
  }
  doc.save(fname);
}

/** Desenha apenas a faixa de logo+título nas páginas seguintes (a primeira já tem). */
function drawPageHeader(
  doc: jsPDF,
  pageW: number,
  margin: number,
  periodoStr: string,
  logoUrl: string | null,
): void {
  const currentPage = (doc as any).internal.getCurrentPageInfo?.().pageNumber ?? 1;
  if (currentPage === 1) return;
  if (logoUrl) {
    try {
      const imgProps = doc.getImageProperties(logoUrl);
      const h = 22;
      const w = (imgProps.width / imgProps.height) * h;
      doc.addImage(logoUrl, 'PNG', margin, margin / 2, w, h);
    } catch { /* noop */ }
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(140, 140, 140);
  doc.text(periodoStr, pageW - margin, margin / 2 + 14, { align: 'right' });
}
