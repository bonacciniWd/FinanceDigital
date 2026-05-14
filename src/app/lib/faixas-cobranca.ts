/**
 * Faixas de classificação de inadimplência (Kanban Cobrança).
 *
 * Histórico:
 * - até v1.9.x: N1 = 1-15, N2 = 16-45, N3 = 46+
 * - desde v1.10.0: N1 = 1-7, N2 = 8-30, N3 = 31-60, N4 = 61-365.
 *   A faixa N4 foi adicionada para separar "atraso longo recuperável" (até 1 ano)
 *   de cards arquivados (> 365 dias, juros congelados).
 *
 * Estas faixas são usadas para:
 * - Renderização das colunas do Kanban Cobrança
 * - Relatórios operacionais (cards por nível)
 * - Comissões: definir qual cobrador recebe pela baixa de um cliente
 *   conforme a faixa em que o cliente está no momento do pagamento.
 */

export type NivelCobranca = 'n1' | 'n2' | 'n3' | 'n4';

export interface FaixaCobranca {
  nivel: NivelCobranca;
  /** Coluna virtual do kanban (a etapa real é sempre 'vencido') */
  colId: 'vencido_n1' | 'vencido_n2' | 'vencido_n3' | 'vencido_n4';
  /** Dia mínimo de atraso (inclusive) */
  diaMin: number;
  /** Dia máximo de atraso (inclusive) */
  diaMax: number;
  /** Label curto exibido nas colunas */
  titulo: string;
  /** Cor do dot da coluna */
  dotColor: string;
}

export const FAIXAS_COBRANCA: readonly FaixaCobranca[] = [
  { nivel: 'n1', colId: 'vencido_n1', diaMin: 1,  diaMax: 7,   titulo: 'N1 · 1-7 dias',    dotColor: '#f97316' },
  { nivel: 'n2', colId: 'vencido_n2', diaMin: 8,  diaMax: 30,  titulo: 'N2 · 8-30 dias',   dotColor: '#ef4444' },
  { nivel: 'n3', colId: 'vencido_n3', diaMin: 31, diaMax: 60,  titulo: 'N3 · 31-60 dias',  dotColor: '#b91c1c' },
  { nivel: 'n4', colId: 'vencido_n4', diaMin: 61, diaMax: 365, titulo: 'N4 · 61-365 dias', dotColor: '#7f1d1d' },
] as const;

/** Limite acima do qual o card vai para "Arquivados" (juros congelados). */
export const DIAS_ARQUIVAMENTO = 365;

/**
 * Retorna o nível da faixa para um dado número de dias de atraso.
 * - Retorna `null` se o cliente NÃO está em nenhuma faixa ativa
 *   (0 dias = em dia; >365 = arquivado).
 */
export function faixaPorDias(diasAtraso: number): FaixaCobranca | null {
  if (diasAtraso < 1 || diasAtraso > DIAS_ARQUIVAMENTO) return null;
  return FAIXAS_COBRANCA.find((f) => diasAtraso >= f.diaMin && diasAtraso <= f.diaMax) ?? null;
}

/** Helper: o nível (string) para `diasAtraso` ou null. */
export function nivelPorDias(diasAtraso: number): NivelCobranca | null {
  return faixaPorDias(diasAtraso)?.nivel ?? null;
}

/**
 * Faixas em que os cobradores N1/N2 atuam (comissão sobre acordos + parcelas pagas).
 * - Inclui "vence_hoje" (0 dias) e "pagamentos em dia" (n1).
 */
export const FAIXAS_N1_N2: readonly NivelCobranca[] = ['n1', 'n2'] as const;

/**
 * Faixas em que os cobradores N3/N4 atuam (comissão sobre parcelas de acordos pagas
 * + empréstimos cadastrados por eles e pagos em dia).
 */
export const FAIXAS_N3_N4: readonly NivelCobranca[] = ['n3', 'n4'] as const;
