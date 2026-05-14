/**
 * @module comissoes-engine
 * @description Engine de cálculo de comissões (nova arquitetura — 1.10.0).
 *
 * Substitui `calcularComissoesSemanais` (legacy).
 *
 * ## Regras
 *
 * Cobradores são agrupados em DOIS pools (não 4 níveis isolados):
 *   • **Recente (N1+N2)**: clientes com atraso 1-30d.
 *   • **Antigo (N3+N4)**: clientes com atraso 31d+.
 *
 * No DB cada config ainda tem `nivel_kanban` n1/n2/n3/n4 individualmente (sem
 * migration), mas o engine trata como grupo. Comissão é SEMPRE % sobre o
 * valor PAGO no período (nunca sobre potencial/dívida total).
 *
 * ### Pcts aplicáveis
 *
 * Recente (N1+N2):
 *   • `pctSobreAcordos` → cada parcela de acordo paga em dia.
 *   • `pctSobreParcelas` → cada parcela direta (sem acordo) paga em dia.
 *
 * Antigo (N3+N4):
 *   • `pctSobreAcordoParcela` → cada parcela de acordo paga em dia.
 *   • `pctSobreEmprestimoEmDia` → cada parcela direta paga em dia.
 *
 * Gerente (`gerente_pct`) e Dono (`dono_pct`): % sobre total de entradas.
 *
 * ### Atribuição cliente → cobrador (regra anti-fraude)
 * Para cada parcela paga:
 *  1. Detecta o grupo (early=N1+N2 ou late=N3+N4) pelo atraso da parcela.
 *  2. Lista candidatos = todas as configs ativas do mesmo grupo.
 *  3. Pega o "último user que interagiu com o cliente".
 *  4. Se esse user tem config ativa no grupo → ele recebe.
 *  5. Caso contrário, fallback: primeira config ativa do grupo (alfabético).
 *  6. Sem ninguém configurado → nenhuma comissão de cobrador (mas gerente/dono recebem sobre entradas).
 *
 * "Pago em dia" = `data_pagamento <= data_vencimento`.
 */

import type { ComissaoConfig } from './comissoes-config';
import { nivelPorDias, type NivelCobranca } from './faixas-cobranca';

// Grupos de níveis (UI/engine — não persistido no DB).
export type GrupoCobranca = 'early' | 'late';

function grupoDoNivel(n: NivelCobranca | null): GrupoCobranca | null {
  if (n === 'n1' || n === 'n2') return 'early';
  if (n === 'n3' || n === 'n4') return 'late';
  return null;
}

// ── Inputs do engine ──────────────────────────────────────────────

export interface ParcelaPaga {
  id: string;
  clienteId: string;
  emprestimoId: string;
  acordoId: string | null;     // null = parcela direta (não-acordo)
  valor: number;
  dataVencimento: string;      // YYYY-MM-DD
  dataPagamento: string;       // YYYY-MM-DD
}

export interface AcordoFechado {
  id: string;
  clienteId: string;
  valorDividaOriginal: number;
  criadoPor: string | null;    // user_id de quem fechou o acordo
  dataAcordo: string;          // ISO datetime
}

export interface EmprestimoQuitado {
  id: string;
  clienteId: string;
  valor: number;
  criadoPor: string | null;    // user_id de quem cadastrou
  ultimaParcelaVencimento: string;  // YYYY-MM-DD
  ultimaParcelaPagamento: string;   // YYYY-MM-DD
}

export interface ParcelaAbertaSnapshot {
  /** clienteId → maior `diasAtraso` da parcela em aberto MAIS antiga, na data do evento. */
  [clienteId: string]: number;
}

export interface EngineInput {
  configs: ComissaoConfig[];
  parcelasPagas: ParcelaPaga[];
  acordosFechados: AcordoFechado[];
  emprestimosQuitados: EmprestimoQuitado[];
  totalEntradas: number;
  ultimoInteragidoPorCliente: Map<string, string>; // clienteId → userId
}

// ── Output ─────────────────────────────────────────────────────────

export interface BreakdownItem {
  origem:
    | 'parcela_direta_early'  // N1+N2: pct sobre parcela direta paga em dia
    | 'parcela_acordo_early'  // N1+N2: pct sobre parcela de acordo paga em dia
    | 'parcela_acordo_late'   // N3+N4: pct sobre parcela de acordo paga em dia
    | 'parcela_direta_late'   // N3+N4: pct sobre parcela direta paga em dia
    | 'gerente_entradas'      // Gerente: pct sobre total entradas
    | 'dono_entradas';        // Dono: pct sobre total entradas
  descricao: string;
  refId?: string;
  base: number;
  pct: number;
  valor: number;
}

export interface ComissaoResultado {
  userId: string;
  userSigla: string | null;
  userNome: string;
  userRole?: string;
  /** Grupo ('early'/'late') quando aplicável, ou null para gerente/dono. */
  grupo: GrupoCobranca | null;
  /** Mantido para compat; reflete o nivelKanban da config representativa. */
  nivelKanban: NivelCobranca | null;
  total: number;
  breakdown: BreakdownItem[];
}

// ── Helpers ────────────────────────────────────────────────────────

function pagaEmDia(p: { dataVencimento: string; dataPagamento: string }): boolean {
  return p.dataPagamento <= p.dataVencimento;
}

function diasEntre(d1: string, d2: string): number {
  const t1 = new Date(d1 + 'T00:00:00Z').getTime();
  const t2 = new Date(d2 + 'T00:00:00Z').getTime();
  return Math.floor((t2 - t1) / 86400000);
}

/**
 * Calcula o nível do kanban em que o cliente ESTAVA quando a parcela foi paga.
 * Baseia no `dataVencimento` da própria parcela vs `dataPagamento`. Se o
 * caller forneceu um snapshot (atraso da parcela mais antiga em aberto), usa
 * esse valor (mais preciso).
 */
function nivelDoEventoParcela(
  parcela: ParcelaPaga,
  snapshotAtrasoMax?: number,
): NivelCobranca | null {
  if (snapshotAtrasoMax !== undefined && snapshotAtrasoMax > 0) {
    return nivelPorDias(snapshotAtrasoMax);
  }
  const dias = diasEntre(parcela.dataVencimento, parcela.dataPagamento);
  if (dias <= 0) return 'n1'; // pagamentos em dia continuam no escopo N1
  return nivelPorDias(dias);
}

/**
 * Seleciona qual user recebe a comissão dada uma transação, aplicando a
 * regra anti-fraude. Retorna `null` se não houver candidato configurado.
 */
function elegerCobrador(
  grupo: GrupoCobranca | null,
  clienteId: string,
  configsPorGrupo: Map<GrupoCobranca, ComissaoConfig[]>,
  ultimoInteragido: Map<string, string>,
): ComissaoConfig | null {
  if (!grupo) return null;
  const candidatos = configsPorGrupo.get(grupo) ?? [];
  if (candidatos.length === 0) return null;

  // 1. Tenta casar com o último que interagiu
  const lastUser = ultimoInteragido.get(clienteId);
  if (lastUser) {
    const match = candidatos.find((c) => c.userId === lastUser);
    if (match) return match;
  }

  // 2. Fallback determinístico: primeiro candidato (ordem por userId)
  return [...candidatos].sort((a, b) => (a.userId ?? '').localeCompare(b.userId ?? ''))[0] ?? null;
}

// ── Engine principal ───────────────────────────────────────────────

export function calcularComissoes(input: EngineInput): ComissaoResultado[] {
  const { configs, parcelasPagas, acordosFechados, emprestimosQuitados, totalEntradas, ultimoInteragidoPorCliente } = input;

  // Indexa configs ativas por GRUPO (não mais por nivel individual)
  const ativos = configs.filter((c) => c.ativo);
  const configsPorGrupo = new Map<GrupoCobranca, ComissaoConfig[]>();
  const configsGerente: ComissaoConfig[] = [];
  const configsDono: ComissaoConfig[] = [];

  for (const c of ativos) {
    if (c.tipo === 'kanban_nivel' && c.nivelKanban) {
      const g = grupoDoNivel(c.nivelKanban);
      if (!g) continue;
      const arr = configsPorGrupo.get(g) ?? [];
      arr.push(c);
      configsPorGrupo.set(g, arr);
    } else if (c.tipo === 'gerente_pct') {
      configsGerente.push(c);
    } else if (c.tipo === 'dono_pct') {
      configsDono.push(c);
    }
  }

  // Bucket de resultado por userId (null → bucket virtual para dono sem conta)
  const resultados = new Map<string, ComissaoResultado>();
  const VIRTUAL_DONO_KEY = '__dono__';
  function bucket(c: ComissaoConfig): ComissaoResultado {
    const key = c.userId ?? VIRTUAL_DONO_KEY;
    let r = resultados.get(key);
    if (!r) {
      r = {
        userId: c.userId ?? VIRTUAL_DONO_KEY,
        userSigla: c.userSigla ?? null,
        userNome: c.userNome ?? (c.userId ? c.userId.slice(0, 8) : 'Dono'),
        userRole: c.userRole ?? (c.tipo === 'dono_pct' ? 'dono' : undefined),
        grupo: c.tipo === 'kanban_nivel' ? grupoDoNivel(c.nivelKanban) : null,
        nivelKanban: c.tipo === 'kanban_nivel' ? c.nivelKanban : null,
        total: 0,
        breakdown: [],
      };
      resultados.set(key, r);
    }
    return r;
  }
  function adicionar(c: ComissaoConfig, item: BreakdownItem) {
    if (item.valor === 0) return;
    const r = bucket(c);
    r.breakdown.push(item);
    r.total += item.valor;
  }

  // ─── 1. Parcelas pagas em dia (única fonte de cobrador) ───────
  // Base SEMPRE = valor da parcela paga (entrada real). Nunca usamos
  // valor potencial do acordo total.
  for (const parc of parcelasPagas) {
    if (!pagaEmDia(parc)) continue;
    const nivel = nivelDoEventoParcela(parc);
    const grupo = grupoDoNivel(nivel);
    const eleito = elegerCobrador(grupo, parc.clienteId, configsPorGrupo, ultimoInteragidoPorCliente);
    if (!eleito) continue;

    const isAcordo = parc.acordoId !== null;

    if (grupo === 'early') {
      const pct = isAcordo ? eleito.pctSobreAcordos : eleito.pctSobreParcelas;
      if (pct <= 0) continue;
      const valor = parc.valor * (pct / 100);
      adicionar(eleito, {
        origem: isAcordo ? 'parcela_acordo_early' : 'parcela_direta_early',
        descricao: `${isAcordo ? 'Parcela acordo' : 'Parcela'} ${parc.id.slice(0, 8)} (${pct}%)`,
        refId: parc.id,
        base: parc.valor,
        pct,
        valor,
      });
    } else if (grupo === 'late') {
      const pct = isAcordo ? eleito.pctSobreAcordoParcela : eleito.pctSobreEmprestimoEmDia;
      if (pct <= 0) continue;
      const valor = parc.valor * (pct / 100);
      adicionar(eleito, {
        origem: isAcordo ? 'parcela_acordo_late' : 'parcela_direta_late',
        descricao: `${isAcordo ? 'Parcela acordo' : 'Parcela'} ${parc.id.slice(0, 8)} (${pct}%)`,
        refId: parc.id,
        base: parc.valor,
        pct,
        valor,
      });
    }
  }

  // Acordos fechados e empréstimos quitados deixaram de gerar comissão direta:
  // a base agora é o pagamento real (já contado em parcelasPagas). Mantemos
  // os arrays no input para uso futuro (bônus, relatórios), mas sem somar.
  void acordosFechados;
  void emprestimosQuitados;

  // ─── 4. Gerente ───────────────────────────────────────────────
  for (const c of configsGerente) {
    const valor = totalEntradas * (c.pctSobreTotalEntradas / 100);
    adicionar(c, {
      origem: 'gerente_entradas',
      descricao: `Gerente ${c.pctSobreTotalEntradas}% sobre entradas`,
      base: totalEntradas,
      pct: c.pctSobreTotalEntradas,
      valor,
    });
  }

  // ─── 5. Dono ──────────────────────────────────────────────────
  for (const c of configsDono) {
    const valor = totalEntradas * (c.pctSobreTotalEntradas / 100);
    adicionar(c, {
      origem: 'dono_entradas',
      descricao: `Dono ${c.pctSobreTotalEntradas}% sobre entradas`,
      base: totalEntradas,
      pct: c.pctSobreTotalEntradas,
      valor,
    });
  }

  // Ordena: dono → gerente → cobradores (early antes de late)
  return Array.from(resultados.values()).sort((a, b) => {
    const rank = (r: ComissaoResultado) => {
      if (r.userRole === 'admin' || r.breakdown.some((i) => i.origem === 'dono_entradas')) return 0;
      if (r.breakdown.some((i) => i.origem === 'gerente_entradas')) return 1;
      if (r.grupo === 'early') return 2;
      if (r.grupo === 'late') return 3;
      return 4;
    };
    return rank(a) - rank(b) || b.total - a.total;
  });
}
