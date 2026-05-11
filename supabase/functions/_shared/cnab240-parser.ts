/**
 * Parser CNAB 240 — Extrato de Conta Corrente (FEBRABAN).
 *
 * Implementação tolerante: extrai dos registros do Segmento E (extrato)
 * apenas os campos essenciais para conciliação (data, valor, sentido D/C,
 * histórico). A linha completa é mantida em `raw_line` para auditoria.
 *
 * Layout de referência (Segmento E — registros tipo 3 com letra E na pos. 14):
 *   pos. 1-3   Código do Banco
 *   pos. 4-7   Lote
 *   pos. 8     Tipo de registro = 3
 *   pos. 9-13  Sequencial
 *   pos. 14    Segmento (E para extrato)
 *   pos. 15-17 Reservado
 *   pos. 18-22 Agência
 *   pos. 23-23 DV agência
 *   pos. 24-35 Conta
 *   pos. 36-36 DV conta
 *   pos. 37-37 DV agência/conta
 *   pos. 38-67 Nome (correntista) — variável p/ banco
 *   pos. 92-99 Data do lançamento (DDMMAAAA)
 *   pos. 109-126 Valor (18 dígitos, 2 decimais)
 *   pos. 127-127 D/C (Débito/Crédito)
 *   pos. 134-148 Número documento
 *   pos. 149-180 Histórico (descrição)
 *
 * Algumas instituições (EFI inclusa) variam offsets — detectamos
 * heurísticamente o campo data buscando padrão de 8 dígitos válidos.
 */

export interface CnabHeaderArquivo {
  banco: string;
  empresa_nome: string;
  conta: string;
  arquivo_data_geracao: string; // YYYY-MM-DD
}

export interface CnabMovimentacao {
  data: string; // YYYY-MM-DD
  valor: number; // sempre positivo
  direction: "entrada" | "saida";
  historico: string;
  documento?: string;
  segmento: string;
  raw_line: string;
}

export interface CnabParseResult {
  header?: CnabHeaderArquivo;
  movimentacoes: CnabMovimentacao[];
  total_lines: number;
  total_segmento_e: number;
  warnings: string[];
}

function parseDateDDMMAAAA(s: string): string | null {
  if (!/^\d{8}$/.test(s)) return null;
  const dd = s.slice(0, 2);
  const mm = s.slice(2, 4);
  const yyyy = s.slice(4, 8);
  const day = Number(dd);
  const month = Number(mm);
  const year = Number(yyyy);
  if (year < 1990 || year > 2099) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  return `${yyyy}-${mm}-${dd}`;
}

function parseValor(s: string): number {
  const digits = s.replace(/\D/g, "");
  if (!digits) return 0;
  const n = Number(digits);
  if (!Number.isFinite(n)) return 0;
  return n / 100;
}

function trimSafe(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Encontra heuristicamente uma data DDMMAAAA válida em uma linha.
 * Retorna a posição (0-indexed) onde inicia, ou -1.
 */
function findDateOffset(line: string, hint = 91): number {
  // Tenta a posição padrão FEBRABAN primeiro
  const candidate = line.slice(hint, hint + 8);
  if (parseDateDDMMAAAA(candidate)) return hint;
  // Fallback: varre toda a linha procurando primeiro DDMMAAAA válido
  // entre posições 60 e 130 (zona típica de data em registros de detalhe).
  for (let i = 60; i <= Math.min(130, line.length - 8); i++) {
    const slice = line.slice(i, i + 8);
    if (parseDateDDMMAAAA(slice)) return i;
  }
  return -1;
}

/**
 * Extrai do registro tipo 3 segmento E os campos essenciais.
 * Retorna null se a linha não for parseável.
 */
function parseSegmentoE(line: string): CnabMovimentacao | null {
  if (line.length < 200) return null;

  const dateOffset = findDateOffset(line, 91);
  if (dateOffset < 0) return null;
  const data = parseDateDDMMAAAA(line.slice(dateOffset, dateOffset + 8))!;

  // Valor: 18 dígitos imediatamente após data (ou + alguns chars de moeda).
  // Tenta posição "padrão" 108-126 primeiro; senão busca após a data.
  let valor = 0;
  let dcChar = "";

  const candidato1 = line.slice(108, 126);
  const dc1 = line.slice(126, 127);
  if (/^\d{18}$/.test(candidato1) && /^[CD]$/i.test(dc1)) {
    valor = parseValor(candidato1);
    dcChar = dc1.toUpperCase();
  } else {
    // Heurística: busca qualquer bloco de 17-18 dígitos após a data
    const after = line.slice(dateOffset + 8, dateOffset + 50);
    const m = after.match(/(\d{15,18})\s*([CD])/i);
    if (m) {
      valor = parseValor(m[1]);
      dcChar = m[2].toUpperCase();
    }
  }

  if (valor === 0) return null;

  const direction: "entrada" | "saida" = dcChar === "C" ? "entrada" : "saida";

  // Histórico: comumente entre posições 149 e 180
  let historico = trimSafe(line.slice(149, 200));
  if (historico.length < 3) {
    // Fallback: pega tudo após o D/C
    historico = trimSafe(line.slice(127, 200));
  }
  // Documento: posições 134-148 padrão
  const documento = trimSafe(line.slice(133, 148));

  return {
    data,
    valor,
    direction,
    historico: historico || "Lançamento",
    documento: documento || undefined,
    segmento: "E",
    raw_line: line,
  };
}

function parseHeaderArquivo(line: string): CnabHeaderArquivo | null {
  if (line.length < 240) return null;
  const banco = line.slice(0, 3);
  // Empresa: posições 73-102 (30 chars)
  const empresa = trimSafe(line.slice(72, 102));
  // Agência (53-57) + Conta (58-69)
  const agencia = trimSafe(line.slice(52, 57));
  const conta = trimSafe(line.slice(57, 69));
  // Data geração: posições 144-151 (DDMMAAAA)
  const dataStr = line.slice(143, 151);
  const dataIso = parseDateDDMMAAAA(dataStr) || "";

  return {
    banco,
    empresa_nome: empresa,
    conta: agencia ? `${agencia}/${conta}` : conta,
    arquivo_data_geracao: dataIso,
  };
}

/**
 * Faz parse de um arquivo CNAB 240 (texto bruto) e extrai movimentações
 * de extrato (Segmento E). Tolerante a variações de layout.
 */
export function parseCnab240(content: string): CnabParseResult {
  const movimentacoes: CnabMovimentacao[] = [];
  const warnings: string[] = [];
  let header: CnabHeaderArquivo | undefined;
  let totalSegmentoE = 0;

  // CNAB 240 usa registros de 240 caracteres. Alguns geram com \r\n,
  // outros só \n, outros sem quebra (string contínua de 240 em 240).
  const normalized = content.replace(/\r\n?/g, "\n");
  let lines: string[];
  if (normalized.includes("\n")) {
    lines = normalized.split("\n").filter((l) => l.length > 0);
  } else {
    lines = [];
    for (let i = 0; i < normalized.length; i += 240) {
      lines.push(normalized.slice(i, i + 240));
    }
  }

  for (const line of lines) {
    if (line.length < 8) continue;
    const tipoRegistro = line.charAt(7);

    if (tipoRegistro === "0") {
      const h = parseHeaderArquivo(line);
      if (h) header = h;
      continue;
    }

    if (tipoRegistro !== "3") continue;
    const segmento = line.charAt(13).toUpperCase();
    if (segmento !== "E") continue;

    totalSegmentoE++;
    const mov = parseSegmentoE(line);
    if (mov) {
      movimentacoes.push(mov);
    } else {
      warnings.push(
        `Linha tipo 3-E não parseável (seq ${line.slice(8, 13)}): ${line.slice(0, 60)}…`,
      );
    }
  }

  if (lines.length > 0 && totalSegmentoE === 0) {
    warnings.push(
      "Nenhum registro Segmento E encontrado — confirme que o arquivo é um " +
      "Extrato de Conta Corrente CNAB 240 da EFI Bank.",
    );
  }

  return {
    header,
    movimentacoes,
    total_lines: lines.length,
    total_segmento_e: totalSegmentoE,
    warnings,
  };
}

/**
 * Classifica heuristicamente um histórico CNAB em uma das categorias da
 * tabela extrato_movimentacoes.categoria. Best-effort baseado em palavras-chave.
 */
export function classifyHistorico(
  historico: string,
  direction: "entrada" | "saida",
): { categoria: string; ehSaldoDiario: boolean } {
  const h = historico.toUpperCase();
  if (h.includes("SALDO")) return { categoria: "saldo_diario", ehSaldoDiario: true };
  if (h.includes("TARIFA")) return { categoria: "tarifa", ehSaldoDiario: false };
  if (h.includes("RECARGA")) return { categoria: "recarga_celular", ehSaldoDiario: false };
  if (h.includes("DEVOLU")) {
    return {
      categoria: direction === "entrada" ? "pix_devolucao_recebida" : "pix_devolucao_enviada",
      ehSaldoDiario: false,
    };
  }
  if (h.includes("PIX") || h.includes("QR")) {
    return {
      categoria: direction === "entrada" ? "pix_recebido" : "pix_enviado",
      ehSaldoDiario: false,
    };
  }
  if (h.includes("TED")) {
    return {
      categoria: direction === "entrada" ? "ted_recebido" : "ted_enviado",
      ehSaldoDiario: false,
    };
  }
  if (h.includes("BOLETO") || h.includes("COBRAN")) {
    return {
      categoria: direction === "entrada" ? "boleto_recebido" : "boleto_pago",
      ehSaldoDiario: false,
    };
  }
  return { categoria: "outros", ehSaldoDiario: false };
}
