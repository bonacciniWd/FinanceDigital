/**
 * @module relatorio-semanal-mensagem
 * @description Monta a mensagem em texto puro (compatível com WhatsApp) do relatório
 * semanal. Usa formatação leve do WhatsApp (* para negrito, _ para itálico).
 */
import type { ComissaoResultado } from './comissoes-engine';

export interface DadosRelatorioSemanal {
  periodoInicio: string; // yyyy-mm-dd
  periodoFim: string;    // yyyy-mm-dd
  totalEntradas: number;
  totalSaidas: number;
  saldoEfi?: number;
  qtdeEmprestimos?: number;
  valorEmprestimos?: number;
  comissoes: ComissaoResultado[];
}

const fmtBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

function fmtData(iso: string): string {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function padEnd(s: string, n: number): string {
  if (s.length >= n) return s.slice(0, n);
  return s + ' '.repeat(n - s.length);
}
function padStart(s: string, n: number): string {
  if (s.length >= n) return s.slice(-n);
  return ' '.repeat(n - s.length) + s;
}

export function montarMensagemRelatorioSemanal(d: DadosRelatorioSemanal): string {
  const linhas: string[] = [];
  linhas.push('*📊 Relatório Semanal — Fintech*');
  linhas.push(`Período: _${fmtData(d.periodoInicio)} a ${fmtData(d.periodoFim)}_`);
  linhas.push('');
  linhas.push('*Resumo financeiro*');
  linhas.push(`• Entradas: *${fmtBRL(d.totalEntradas)}*`);
  linhas.push(`• Saídas: *${fmtBRL(d.totalSaidas)}*`);
  linhas.push(`• Saldo do período: *${fmtBRL(d.totalEntradas - d.totalSaidas)}*`);
  if (d.saldoEfi != null) {
    linhas.push(`• Saldo EFI atual: *${fmtBRL(d.saldoEfi)}*`);
  }
  if (d.qtdeEmprestimos != null) {
    linhas.push(`• Empréstimos no período: *${d.qtdeEmprestimos}* (${fmtBRL(d.valorEmprestimos ?? 0)})`);
  }

  if (d.comissoes.length > 0) {
    linhas.push('');
    linhas.push('*Comissões / Salários da semana*');
    linhas.push('```');
    linhas.push(`${padEnd('Func.', 12)} ${padEnd('Papel', 18)} ${padStart('Valor', 12)}`);
    linhas.push('-'.repeat(46));
    for (const c of d.comissoes) {
      const idCol = c.userSigla ?? c.userNome.slice(0, 12);
      const papel = c.nivelKanban
        ? `Nível ${c.nivelKanban}`
        : (c.userRole === 'gerente' ? 'Gerente' : c.userRole === 'dono' ? 'Dono' : '—');
      linhas.push(
        `${padEnd(idCol, 12)} ${padEnd(papel, 18)} ${padStart(fmtBRL(c.total), 12)}`,
      );
    }
    const total = d.comissoes.reduce((s, c) => s + c.total, 0);
    linhas.push('-'.repeat(46));
    linhas.push(`${padEnd('TOTAL', 33)}${padStart(fmtBRL(total), 12)}`);
    linhas.push('```');
  }

  linhas.push('');
  linhas.push('_Mensagem automática — Fintech_');
  return linhas.join('\n');
}
