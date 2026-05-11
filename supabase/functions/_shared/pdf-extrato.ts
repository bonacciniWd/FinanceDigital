/**
 * Gerador server-side de PDF de extrato semanal.
 *
 * Usa jsPDF + jspdf-autotable via esm.sh (compatível com Deno).
 * Retorna Uint8Array com o PDF binário.
 */
// @ts-ignore — esm.sh sem tipos
import jsPDF from "https://esm.sh/jspdf@2.5.2";
// @ts-ignore
import autoTable from "https://esm.sh/jspdf-autotable@3.8.4?deps=jspdf@2.5.2";

export interface ExtratoPdfItem {
  data: string; // YYYY-MM-DD
  direction: "entrada" | "saida";
  historico: string;
  valor: number;
}

export interface ExtratoPdfData {
  empresa_nome?: string;
  conta?: string;
  periodo_inicio: string; // YYYY-MM-DD
  periodo_fim: string;
  movimentacoes: ExtratoPdfItem[];
  total_entradas: number;
  total_saidas: number;
}

const BR = "pt-BR";

function fmtCurrency(n: number): string {
  return n.toLocaleString(BR, { style: "currency", currency: "BRL" });
}

function fmtDateBr(iso: string): string {
  if (!iso || iso.length < 10) return iso;
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export function gerarExtratoPdf(data: ExtratoPdfData): Uint8Array {
  // jsPDF em Deno expõe a classe diretamente
  const Doc = (jsPDF as any).default || jsPDF;
  const doc = new Doc({ unit: "pt", format: "a4" }) as any;
  const pageWidth = doc.internal.pageSize.getWidth();

  // Cabeçalho
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Extrato Bancário Semanal", pageWidth / 2, 50, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(80, 80, 80);
  let y = 75;
  if (data.empresa_nome) {
    doc.text(data.empresa_nome, pageWidth / 2, y, { align: "center" });
    y += 14;
  }
  if (data.conta) {
    doc.text(`Conta: ${data.conta}`, pageWidth / 2, y, { align: "center" });
    y += 14;
  }
  doc.text(
    `Período: ${fmtDateBr(data.periodo_inicio)} a ${fmtDateBr(data.periodo_fim)}`,
    pageWidth / 2,
    y,
    { align: "center" },
  );
  y += 14;
  doc.text(
    `Gerado em ${new Date().toLocaleString(BR, { timeZone: "America/Sao_Paulo" })}`,
    pageWidth / 2,
    y,
    { align: "center" },
  );
  y += 25;

  // Resumo
  const saldo = data.total_entradas - data.total_saidas;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
  doc.text("Resumo do período", 40, y);
  y += 18;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(0, 130, 0);
  doc.text(`Entradas: ${fmtCurrency(data.total_entradas)}`, 40, y);
  doc.setTextColor(190, 0, 0);
  doc.text(`Saídas: ${fmtCurrency(data.total_saidas)}`, 220, y);
  doc.setTextColor(saldo >= 0 ? 0 : 190, saldo >= 0 ? 130 : 0, 0);
  doc.text(
    `Saldo: ${saldo >= 0 ? "+" : ""}${fmtCurrency(saldo)}`,
    400,
    y,
  );
  doc.setTextColor(0, 0, 0);
  y += 25;

  // Tabela de movimentações
  const rows = data.movimentacoes
    .slice()
    .sort((a, b) => a.data.localeCompare(b.data))
    .map((m) => [
      fmtDateBr(m.data),
      m.direction === "entrada" ? "Entrada" : "Saída",
      m.historico.length > 60 ? m.historico.slice(0, 60) + "…" : m.historico,
      (m.direction === "saida" ? "-" : "+") + fmtCurrency(m.valor),
    ]);

  autoTable(doc, {
    startY: y,
    head: [["Data", "Tipo", "Histórico", "Valor"]],
    body: rows,
    theme: "striped",
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: [40, 40, 40], textColor: 255 },
    columnStyles: {
      0: { cellWidth: 60 },
      1: { cellWidth: 60 },
      2: { cellWidth: 320 },
      3: { cellWidth: 95, halign: "right" },
    },
    didDrawPage: (hookData: any) => {
      // Rodapé com numeração
      const pages = doc.internal.getNumberOfPages();
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(
        `Página ${hookData.pageNumber} de ${pages}`,
        pageWidth - 40,
        doc.internal.pageSize.getHeight() - 20,
        { align: "right" },
      );
    },
  });

  const arrayBuffer = doc.output("arraybuffer") as ArrayBuffer;
  return new Uint8Array(arrayBuffer);
}
