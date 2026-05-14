/**
 * Hook que computa comissões do período aplicando o engine sobre os dados reais.
 *
 * Busca:
 *  - configs ativas de `comissoes_config`
 *  - parcelas pagas no período
 *  - acordos fechados no período
 *  - empréstimos quitados no período
 *  - "último user que interagiu" por cliente (de `interacoes_cliente`)
 *
 * Roda o engine e retorna `ComissaoResultado[]`.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import {
  calcularComissoes,
  type ComissaoResultado,
  type ParcelaPaga,
  type AcordoFechado,
  type EmprestimoQuitado,
} from '../lib/comissoes-engine';
import { listComissoesConfigs } from '../services/comissoesConfigService';
import { getUltimoInteragidoPorCliente } from '../services/interacoesService';

interface Params {
  /** YYYY-MM-DD */
  inicio: string;
  /** YYYY-MM-DD */
  fim: string;
  /** Total de entradas no período (passado pela página). */
  totalEntradas: number;
}

async function fetchParcelasPagas(inicio: string, fim: string): Promise<ParcelaPaga[]> {
  const { data, error } = await supabase
    .from('parcelas')
    .select('id, cliente_id, emprestimo_id, acordo_id, valor, data_vencimento, data_pagamento')
    .eq('status', 'paga')
    .gte('data_pagamento', inicio)
    .lte('data_pagamento', fim);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id,
    clienteId: r.cliente_id,
    emprestimoId: r.emprestimo_id,
    acordoId: r.acordo_id ?? null,
    valor: Number(r.valor),
    dataVencimento: r.data_vencimento,
    dataPagamento: r.data_pagamento ?? '',
  }));
}

async function fetchAcordosFechados(inicio: string, fim: string): Promise<AcordoFechado[]> {
  const { data, error } = await supabase
    .from('acordos')
    .select('id, cliente_id, valor_divida_original, criado_por, data_acordo')
    .gte('data_acordo', `${inicio}T00:00:00Z`)
    .lte('data_acordo', `${fim}T23:59:59Z`)
    .neq('status', 'cancelado');
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id,
    clienteId: r.cliente_id,
    valorDividaOriginal: Number(r.valor_divida_original),
    criadoPor: r.criado_por ?? null,
    dataAcordo: r.data_acordo,
  }));
}

async function fetchEmprestimosQuitados(inicio: string, fim: string): Promise<EmprestimoQuitado[]> {
  // Empréstimos com status=quitado e updated_at no período.
  const { data, error } = await supabase
    .from('emprestimos')
    .select('id, cliente_id, valor, criado_por, updated_at')
    .eq('status', 'quitado')
    .gte('updated_at', `${inicio}T00:00:00Z`)
    .lte('updated_at', `${fim}T23:59:59Z`);
  if (error) throw new Error(error.message);

  const emprestimos = data ?? [];
  if (emprestimos.length === 0) return [];

  // Para cada um, busca data_vencimento e data_pagamento da ÚLTIMA parcela.
  const { data: parcs, error: parcErr } = await supabase
    .from('parcelas')
    .select('emprestimo_id, data_vencimento, data_pagamento, numero')
    .in('emprestimo_id', emprestimos.map((e) => e.id))
    .order('numero', { ascending: false });
  if (parcErr) throw new Error(parcErr.message);

  const ultimaPorEmp = new Map<string, { venc: string; pag: string }>();
  for (const p of parcs ?? []) {
    if (!ultimaPorEmp.has(p.emprestimo_id) && p.data_pagamento) {
      ultimaPorEmp.set(p.emprestimo_id, {
        venc: p.data_vencimento,
        pag: p.data_pagamento,
      });
    }
  }

  return emprestimos.map((e) => ({
    id: e.id,
    clienteId: e.cliente_id,
    valor: Number(e.valor),
    criadoPor: e.criado_por ?? null,
    ultimaParcelaVencimento: ultimaPorEmp.get(e.id)?.venc ?? '',
    ultimaParcelaPagamento: ultimaPorEmp.get(e.id)?.pag ?? '',
  }));
}

/**
 * Executa o cálculo de comissões versão standalone (sem hook).
 * Útil para geração de PDF e relatórios WhatsApp.
 */
export async function computarComissoesPeriodo(params: Params): Promise<ComissaoResultado[]> {
  const [configs, parcelasPagas, acordosFechados, emprestimosQuitados] = await Promise.all([
    listComissoesConfigs(),
    fetchParcelasPagas(params.inicio, params.fim),
    fetchAcordosFechados(params.inicio, params.fim),
    fetchEmprestimosQuitados(params.inicio, params.fim),
  ]);

  const clientesEnvolvidos = new Set<string>();
  parcelasPagas.forEach((p) => clientesEnvolvidos.add(p.clienteId));
  acordosFechados.forEach((a) => clientesEnvolvidos.add(a.clienteId));
  emprestimosQuitados.forEach((e) => clientesEnvolvidos.add(e.clienteId));

  const ultimoInteragidoPorCliente = await getUltimoInteragidoPorCliente(
    Array.from(clientesEnvolvidos),
  );

  return calcularComissoes({
    configs,
    parcelasPagas,
    acordosFechados,
    emprestimosQuitados,
    totalEntradas: params.totalEntradas,
    ultimoInteragidoPorCliente,
  });
}

export function useComissoesCalculo(params: Params) {
  return useQuery<ComissaoResultado[]>({
    queryKey: ['comissoes_calculo', params.inicio, params.fim, params.totalEntradas],
    enabled: !!params.inicio && !!params.fim,
    staleTime: 30_000,
    queryFn: () => computarComissoesPeriodo(params),
  });
}
