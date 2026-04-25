/**
 * OCR de comprovantes de pagamento PIX usando Tesseract.js.
 *
 * Roda 100% no front-end (offline-friendly em Electron). Os arquivos de modelo
 * (~5MB do `por.traineddata`) são baixados sob demanda no primeiro uso e ficam
 * em cache do navegador/Electron.
 *
 * Uso:
 *   const r = await ocrComprovante(file);
 *   if (r.valor) console.log('R$', r.valor);
 *
 * Heurísticas regex pensadas para prints brasileiros de Pix (Itaú, Nubank,
 * Bradesco, Santander, Caixa, Inter, Banco do Brasil, C6, BTG, picpay, mercadopago).
 */
import Tesseract from 'tesseract.js';

export interface OcrResultado {
  textoCompleto: string;
  valor: number | null;
  data: string | null; // YYYY-MM-DD
  chavePix: string | null;
  beneficiario: string | null;
  confidenceMedia: number; // 0-100
  duracaoMs: number;
}

const ALL_NUM = /([0-9]{1,3}(?:\.[0-9]{3})*,[0-9]{2})/g;
const ALL_DATE = /([0-3]?[0-9])[/.-]([0-1]?[0-9])[/.-]([0-9]{2,4})/g;
const PIX_KEY_PATTERNS = [
  // CPF
  /\b([0-9]{3}\.[0-9]{3}\.[0-9]{3}-?[0-9]{2})\b/,
  // CNPJ
  /\b([0-9]{2}\.[0-9]{3}\.[0-9]{3}\/[0-9]{4}-[0-9]{2})\b/,
  // Email
  /\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/,
  // Telefone +55
  /(\+?55\s?\(?\d{2}\)?\s?9?\d{4}-?\d{4})/,
  // Chave aleatória
  /\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i,
];

function parseBRLNumber(s: string): number {
  return Number(s.replace(/\./g, '').replace(',', '.'));
}

function extrairValor(texto: string): number | null {
  const matches = [...texto.matchAll(ALL_NUM)].map((m) => parseBRLNumber(m[1]));
  if (matches.length === 0) return null;
  // Heurística: pegar o MAIOR valor encontrado (geralmente é o valor da transação;
  // tarifa/saldo costumam ser menores ou estão em contextos que o OCR distorce).
  // Mas se houver "valor" explícito perto do número, preferir esse.
  const linhas = texto.split(/\n/);
  for (const l of linhas) {
    if (/valor|total|transferido|enviado|pago/i.test(l)) {
      const m = l.match(ALL_NUM);
      if (m) return parseBRLNumber(m[m.length - 1]);
    }
  }
  return Math.max(...matches);
}

function extrairData(texto: string): string | null {
  const m = texto.match(ALL_DATE);
  if (!m || m.length === 0) return null;
  const first = m[0].match(/([0-3]?[0-9])[/.-]([0-1]?[0-9])[/.-]([0-9]{2,4})/);
  if (!first) return null;
  let [, dd, mm, yy] = first;
  if (yy.length === 2) yy = '20' + yy;
  const day = dd.padStart(2, '0');
  const mon = mm.padStart(2, '0');
  if (Number(day) > 31 || Number(mon) > 12) return null;
  return `${yy}-${mon}-${day}`;
}

function extrairChavePix(texto: string): string | null {
  for (const re of PIX_KEY_PATTERNS) {
    const m = texto.match(re);
    if (m) return m[1] || m[0];
  }
  return null;
}

function extrairBeneficiario(texto: string): string | null {
  const linhas = texto.split(/\n/);
  for (let i = 0; i < linhas.length; i++) {
    if (/(para|destinat[áa]rio|beneficia|recebedor)/i.test(linhas[i])) {
      // tentar mesma linha após :
      const sep = linhas[i].split(':');
      if (sep.length > 1 && sep[1].trim().length > 2) return sep[1].trim();
      // ou próxima linha
      if (i + 1 < linhas.length && linhas[i + 1].trim().length > 2) return linhas[i + 1].trim();
    }
  }
  return null;
}

let workerPromise: Promise<Tesseract.Worker> | null = null;
async function getWorker(): Promise<Tesseract.Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const w = await Tesseract.createWorker('por', 1, {
        // logger: (m) => console.debug('[ocr]', m),
      });
      return w;
    })();
  }
  return workerPromise;
}

export async function ocrComprovante(file: File | Blob): Promise<OcrResultado> {
  const t0 = performance.now();
  const worker = await getWorker();
  const url = URL.createObjectURL(file);
  try {
    const { data } = await worker.recognize(url);
    const texto = data.text || '';
    return {
      textoCompleto: texto,
      valor: extrairValor(texto),
      data: extrairData(texto),
      chavePix: extrairChavePix(texto),
      beneficiario: extrairBeneficiario(texto),
      confidenceMedia: data.confidence ?? 0,
      duracaoMs: Math.round(performance.now() - t0),
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Compara o resultado do OCR com a parcela esperada e retorna se passa
 * no auto-aprovar.
 */
export function avaliarConciliacao(
  ocr: OcrResultado,
  parcela: { valor: number; juros?: number; multa?: number; desconto?: number },
  thresholdPct: number,
): {
  aprovado: boolean;
  diferencaPct: number;
  motivos: string[];
} {
  const motivos: string[] = [];
  if (!ocr.valor) {
    motivos.push('Valor não detectado no comprovante');
    return { aprovado: false, diferencaPct: 100, motivos };
  }
  const total = parcela.valor + (parcela.juros || 0) + (parcela.multa || 0) - (parcela.desconto || 0);
  if (total <= 0) {
    motivos.push('Valor da parcela inválido');
    return { aprovado: false, diferencaPct: 100, motivos };
  }
  const diff = Math.abs(ocr.valor - total);
  const pct = (diff / total) * 100;
  if (pct > thresholdPct) {
    motivos.push(`Valor extraído R$ ${ocr.valor.toFixed(2)} difere ${pct.toFixed(1)}% do esperado R$ ${total.toFixed(2)}`);
    return { aprovado: false, diferencaPct: pct, motivos };
  }
  return { aprovado: true, diferencaPct: pct, motivos: [] };
}
