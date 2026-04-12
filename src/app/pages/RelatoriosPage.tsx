/**
 * @module RelatoriosPage
 * @description Central de relatórios financeiros — dados reais do Supabase.
 *
 * Gerador de relatórios com templates pré-definidos:
 * inadimplência, receita, carteira e performance. Diálogo
 * de configuração com período, formato (PDF/Excel/CSV) e
 * opção de envio por e-mail. Download direto ou agendamento.
 *
 * @route /relatorios
 * @access Protegido — perfis admin, gerente
 */
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { FileText, Download, Mail, FileSpreadsheet, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { useState, useMemo } from 'react';
import { useClientes } from '../hooks/useClientes';
import { useParcelas } from '../hooks/useParcelas';
import { useEmprestimos } from '../hooks/useEmprestimos';
import { useMembrosRede } from '../hooks/useRedeIndicacoes';
import { useAnalises } from '../hooks/useAnaliseCredito';
import { valorCorrigido } from '../lib/juros';
import { toast } from 'sonner';

interface Relatorio {
  id: string;
  titulo: string;
  descricao: string;
  icon: any;
}

const relatoriosGerenciais: Relatorio[] = [
  {
    id: 'fluxo-caixa',
    titulo: 'Fluxo de Caixa Mensal',
    descricao: 'Análise completa de entradas e saídas mensais',
    icon: FileText,
  },
  {
    id: 'inadimplencia',
    titulo: 'Inadimplência por Período',
    descricao: 'Relatório detalhado de inadimplência',
    icon: FileText,
  },
  {
    id: 'performance-rede',
    titulo: 'Performance da Rede',
    descricao: 'Análise de indicações e conversões',
    icon: FileText,
  },
  {
    id: 'comissoes',
    titulo: 'Comissões a Pagar',
    descricao: 'Bônus e comissões de indicadores',
    icon: FileText,
  },
  {
    id: 'clientes-inativos',
    titulo: 'Clientes Inativos',
    descricao: 'Lista de clientes sem movimentação',
    icon: FileText,
  },
  {
    id: 'analise-credito',
    titulo: 'Análise de Crédito',
    descricao: 'Relatório de aprovações e rejeições',
    icon: FileText,
  },
];

/** Gera e faz download de um CSV a partir de linhas string[][] */
function downloadCsv(filename: string, headers: string[], rows: string[][]) {
  const csvContent = [headers, ...rows]
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function RelatoriosPage() {
  const [previewRelatorio, setPreviewRelatorio] = useState<string | null>(null);

  const { data: clientes, isLoading: loadingClientes } = useClientes();
  const { data: parcelas, isLoading: loadingParcelas } = useParcelas();
  const { data: emprestimos, isLoading: loadingEmprestimos } = useEmprestimos();
  const { data: membros, isLoading: loadingMembros } = useMembrosRede();
  const { data: analises, isLoading: loadingAnalises } = useAnalises();

  const loading = loadingClientes || loadingParcelas || loadingMembros || loadingEmprestimos || loadingAnalises;

  // Mapa: clienteId → dívida corrigida (soma das parcelas abertas com juros)
  const clienteDebitoMap = useMemo(() => {
    const map = new Map<string, number>();
    if (!parcelas) return map;
    for (const p of parcelas) {
      if (p.status === 'paga' || p.status === 'cancelada') continue;
      const corrigido = valorCorrigido(p.valorOriginal, p.dataVencimento, p.juros, p.multa, p.desconto).total;
      map.set(p.clienteId, (map.get(p.clienteId) ?? 0) + corrigido);
    }
    return map;
  }, [parcelas]);

  /** Retorna o débito corrigido do cliente (parcelas abertas com juros) ou c.valor como fallback */
  const debitoCliente = (c: { id: string; valor: number }) => clienteDebitoMap.get(c.id) ?? c.valor;

  // ── Clientes por Status ──
  const clientesPorStatus = useMemo(() => {
    if (!clientes) return { emDia: 0, aVencer: 0, vencidos: 0 };
    return {
      emDia: clientes.filter((c) => c.status === 'em_dia').length,
      aVencer: clientes.filter((c) => c.status === 'a_vencer').length,
      vencidos: clientes.filter((c) => c.status === 'vencido').length,
    };
  }, [clientes]);

  // ── Valores por Status (com juros corrigidos) ──
  const valoresPorStatus = useMemo(() => {
    if (!clientes) return { emDia: 0, aVencer: 0, vencidos: 0 };
    return {
      emDia: clientes
        .filter((c) => c.status === 'em_dia')
        .reduce((s, c) => s + debitoCliente(c), 0),
      aVencer: clientes
        .filter((c) => c.status === 'a_vencer')
        .reduce((s, c) => s + debitoCliente(c), 0),
      vencidos: clientes
        .filter((c) => c.status === 'vencido')
        .reduce((s, c) => s + debitoCliente(c), 0),
    };
  }, [clientes, clienteDebitoMap]);

  // ── Top 5 Devedores (clientes vencidos com maior dívida corrigida) ──
  const topDevedores = useMemo(() => {
    if (!clientes) return [];
    return clientes
      .filter((c) => c.status === 'vencido')
      .sort((a, b) => debitoCliente(b) - debitoCliente(a))
      .slice(0, 5);
  }, [clientes, clienteDebitoMap]);

  // ── Indicações do Mês ──
  const indicacoesMes = useMemo(() => {
    if (!membros) return { total: 0, convertidas: 0, taxa: 0 };
    const now = new Date();
    const mesAtual = now.getMonth();
    const anoAtual = now.getFullYear();
    const doMes = membros.filter((m) => {
      const d = new Date(m.createdAt);
      return d.getMonth() === mesAtual && d.getFullYear() === anoAtual;
    });
    const convertidas = doMes.filter((m) => m.clienteValor > 0).length;
    const total = doMes.length;
    return {
      total,
      convertidas,
      taxa: total > 0 ? Math.round((convertidas / total) * 100) : 0,
    };
  }, [membros]);

  // ── Dados do Preview Inadimplência ──
  const inadimplenciaPreview = useMemo(() => {
    if (!clientes || !parcelas) return null;
    const totalClientes = clientes.length;
    const inadimplentes = clientes.filter((c) => c.status === 'vencido');
    const qtdInadimplentes = inadimplentes.length;
    const taxaInadimplencia =
      totalClientes > 0 ? ((qtdInadimplentes / totalClientes) * 100).toFixed(1) : '0';
    const parcelasVencidas = parcelas.filter((p) => p.status === 'vencida');
    const valorEmAtraso = parcelasVencidas.reduce((s, p) => s + valorCorrigido(p.valorOriginal, p.dataVencimento, p.juros, p.multa, p.desconto).total, 0);
    const mediaDiasAtraso =
      inadimplentes.length > 0
        ? Math.round(
            inadimplentes.reduce((s, c) => s + (c.diasAtraso ?? 0), 0) /
              inadimplentes.length
          )
        : 0;
    const top5 = inadimplentes.sort((a, b) => debitoCliente(b) - debitoCliente(a)).slice(0, 5);
    return {
      totalClientes,
      qtdInadimplentes,
      taxaInadimplencia,
      valorEmAtraso,
      mediaDiasAtraso,
      top5,
    };
  }, [clientes, parcelas, clienteDebitoMap]);

  // ── Fluxo de Caixa Mensal ──
  const fluxoCaixaPreview = useMemo(() => {
    if (!parcelas || !emprestimos) return null;
    const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const now = new Date();
    const meses: { mes: string; entradas: number; saidas: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const m = d.getMonth();
      const a = d.getFullYear();
      const entradas = parcelas
        .filter((p) => p.status === 'paga' && p.dataPagamento) 
        .filter((p) => {
          const dp = new Date(p.dataPagamento!);
          return dp.getMonth() === m && dp.getFullYear() === a;
        })
        .reduce((s, p) => s + p.valor, 0);
      const saidas = emprestimos
        .filter((e) => {
          const dc = new Date(e.dataContrato);
          return dc.getMonth() === m && dc.getFullYear() === a;
        })
        .reduce((s, e) => s + e.valor, 0);
      meses.push({ mes: `${MESES[m]}/${a}`, entradas, saidas });
    }
    const totalEntradas = meses.reduce((s, m) => s + m.entradas, 0);
    const totalSaidas = meses.reduce((s, m) => s + m.saidas, 0);
    return { meses, totalEntradas, totalSaidas, saldo: totalEntradas - totalSaidas };
  }, [parcelas, emprestimos]);

  // ── Performance da Rede ──
  const redePreview = useMemo(() => {
    if (!membros) return null;
    const total = membros.length;
    const ativos = membros.filter((m) => m.status === 'ativo').length;
    const bloqueados = membros.filter((m) => m.status === 'bloqueado').length;
    const totalBonus = membros.reduce((s, m) => s + m.clienteBonusAcumulado, 0);
    const totalCarteira = membros.reduce((s, m) => s + m.clienteValor, 0);
    const redesSet = new Set(membros.map((m) => m.redeId));
    const redesCount = redesSet.size;
    const nivelMax = membros.reduce((max, m) => Math.max(max, m.nivel), 0);
    const topIndicadores = membros
      .filter((m) => m.clienteBonusAcumulado > 0)
      .sort((a, b) => b.clienteBonusAcumulado - a.clienteBonusAcumulado)
      .slice(0, 5);
    return { total, ativos, bloqueados, totalBonus, totalCarteira, redesCount, nivelMax, topIndicadores };
  }, [membros]);

  // ── Comissões a Pagar ──
  const comissoesPreview = useMemo(() => {
    if (!clientes) return null;
    const comBonuS = clientes.filter((c) => c.bonusAcumulado > 0);
    const totalBruto = comBonuS.reduce((s, c) => s + c.bonusAcumulado, 0);
    const top5 = comBonuS.sort((a, b) => b.bonusAcumulado - a.bonusAcumulado).slice(0, 10);
    return { total: comBonuS.length, totalBruto, top5 };
  }, [clientes]);

  // ── Clientes Inativos ──
  const inativosPreview = useMemo(() => {
    if (!clientes) return null;
    const now = new Date();
    const limite30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const inativos = clientes.filter((c) => {
      if (!c.ultimoContato) return true;
      return new Date(c.ultimoContato) < limite30;
    });
    const semContato = inativos.filter((c) => !c.ultimoContato);
    const comContatoAntigo = inativos.filter((c) => c.ultimoContato);
    const valorTotal = inativos.reduce((s, c) => s + debitoCliente(c), 0);
    return {
      total: inativos.length,
      semContato: semContato.length,
      comContatoAntigo: comContatoAntigo.length,
      valorTotal,
      lista: inativos.sort((a, b) => debitoCliente(b) - debitoCliente(a)).slice(0, 10),
    };
  }, [clientes, clienteDebitoMap]);

  // ── Análise de Crédito ──
  const creditoPreview = useMemo(() => {
    if (!analises) return null;
    const total = analises.length;
    const aprovadas = analises.filter((a) => a.status === 'aprovado');
    const recusadas = analises.filter((a) => a.status === 'recusado');
    const pendentes = analises.filter((a) => a.status === 'pendente');
    const emAnalise = analises.filter((a) => a.status === 'em_analise');
    const valorAprovado = aprovadas.reduce((s, a) => s + a.valorSolicitado, 0);
    const valorRecusado = recusadas.reduce((s, a) => s + a.valorSolicitado, 0);
    const taxaAprovacao = total > 0 ? ((aprovadas.length / total) * 100).toFixed(1) : '0';
    return {
      total,
      aprovadas: aprovadas.length,
      recusadas: recusadas.length,
      pendentes: pendentes.length,
      emAnalise: emAnalise.length,
      valorAprovado,
      valorRecusado,
      taxaAprovacao,
      recentes: analises.sort((a, b) => new Date(b.dataSolicitacao).getTime() - new Date(a.dataSolicitacao).getTime()).slice(0, 10),
    };
  }, [analises]);

  const handleGerarRelatorio = (id: string) => {
    setPreviewRelatorio(id);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const handleExportClientesPorStatus = () => {
    if (!clientes) return;
    downloadCsv(
      'clientes_por_status.csv',
      ['Nome', 'Status', 'Valor Corrigido', 'Dias Atraso', 'Email', 'Telefone'],
      clientes.map((c) => [
        c.nome,
        c.status,
        String(debitoCliente(c)),
        String(c.diasAtraso ?? 0),
        c.email,
        c.telefone,
      ])
    );
  };

  const handleExportTopDevedores = () => {
    if (!topDevedores.length) return;
    downloadCsv(
      'top_devedores.csv',
      ['Nome', 'Valor Corrigido', 'Dias Atraso', 'Telefone'],
      topDevedores.map((c) => [
        c.nome,
        String(debitoCliente(c)),
        String(c.diasAtraso ?? 0),
        c.telefone,
      ])
    );
  };

  const handleExportIndicacoes = () => {
    if (!membros) return;
    downloadCsv(
      'indicacoes.csv',
      ['Nome', 'Rede', 'Nível', 'Status', 'Valor', 'Bônus'],
      membros.map((m) => [
        m.clienteNome,
        m.redeId,
        String(m.nivel),
        m.status,
        String(m.clienteValor),
        String(m.clienteBonusAcumulado),
      ])
    );
  };

  /** Exporta CSV do relatório atualmente aberto no dialog */
  const handleExportRelatorio = (formato: string) => {
    if (!previewRelatorio) return;
    const agora = new Date().toISOString().slice(0, 10);

    switch (previewRelatorio) {
      case 'inadimplencia': {
        if (!clientes) return;
        const inad = clientes.filter((c) => c.status === 'vencido');
        downloadCsv(`inadimplencia_${agora}.csv`,
          ['Nome', 'Valor', 'Dias Atraso', 'Telefone', 'Email', 'Último Contato'],
          inad.map((c) => [c.nome, String(debitoCliente(c)), String(c.diasAtraso ?? 0), c.telefone, c.email, c.ultimoContato ?? ''])
        );
        break;
      }
      case 'fluxo-caixa': {
        if (!fluxoCaixaPreview) return;
        downloadCsv(`fluxo_caixa_${agora}.csv`,
          ['Mês', 'Entradas', 'Saídas', 'Saldo'],
          fluxoCaixaPreview.meses.map((m) => [m.mes, String(m.entradas), String(m.saidas), String(m.entradas - m.saidas)])
        );
        break;
      }
      case 'performance-rede': {
        if (!membros) return;
        downloadCsv(`performance_rede_${agora}.csv`,
          ['Nome', 'Rede', 'Nível', 'Status', 'Valor Carteira', 'Bônus Acumulado', 'Score'],
          membros.map((m) => [m.clienteNome, m.redeId, String(m.nivel), m.status, String(m.clienteValor), String(m.clienteBonusAcumulado), String(m.clienteScoreInterno)])
        );
        break;
      }
      case 'comissoes': {
        if (!clientes) return;
        const comB = clientes.filter((c) => c.bonusAcumulado > 0).sort((a, b) => b.bonusAcumulado - a.bonusAcumulado);
        downloadCsv(`comissoes_${agora}.csv`,
          ['Nome', 'Email', 'Telefone', 'Status', 'Bônus Acumulado'],
          comB.map((c) => [c.nome, c.email, c.telefone, c.status, String(c.bonusAcumulado)])
        );
        break;
      }
      case 'clientes-inativos': {
        if (!inativosPreview) return;
        const inat = clientes?.filter((c) => {
          if (!c.ultimoContato) return true;
          return new Date(c.ultimoContato) < new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        }) ?? [];
        downloadCsv(`clientes_inativos_${agora}.csv`,
          ['Nome', 'Telefone', 'Email', 'Status', 'Valor', 'Último Contato'],
          inat.map((c) => [c.nome, c.telefone, c.email, c.status, String(debitoCliente(c)), c.ultimoContato ?? 'Nunca'])
        );
        break;
      }
      case 'analise-credito': {
        if (!analises) return;
        downloadCsv(`analise_credito_${agora}.csv`,
          ['Cliente', 'CPF', 'Valor Solicitado', 'Renda Mensal', 'Score Serasa', 'Score Interno', 'Status', 'Data Solicitação'],
          analises.map((a) => [a.clienteNome, a.cpf, String(a.valorSolicitado), String(a.rendaMensal), String(a.scoreSerasa), String(a.scoreInterno), a.status, a.dataSolicitacao])
        );
        break;
      }
    }
    toast.success('Relatório exportado com sucesso!');
  };

  const now = new Date();
  const mesAno = now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).toUpperCase();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Relatórios</h1>
        <p className="text-muted-foreground mt-1">
          Gere e exporte relatórios gerenciais e operacionais
        </p>
      </div>

      {/* Relatórios Gerenciais */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Relatórios Gerenciais</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {relatoriosGerenciais.map((relatorio) => (
            <Card
              key={relatorio.id}
              className="hover:shadow-lg transition-shadow cursor-pointer"
            >
              <CardHeader>
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                    <relatorio.icon className="w-6 h-6 text-primary" />
                  </div>
                  <div className="flex-1">
                    <CardTitle className="text-base">{relatorio.titulo}</CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                      {relatorio.descricao}
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Button
                  className="w-full bg-primary hover:bg-primary/90"
                  onClick={() => handleGerarRelatorio(relatorio.id)}
                >
                  Gerar Relatório
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Relatórios Rápidos */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Relatórios Rápidos</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Clientes por Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Em dia:</span>
                  <span className="font-semibold">
                    {loading ? '...' : clientesPorStatus.emDia}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>À vencer:</span>
                  <span className="font-semibold">
                    {loading ? '...' : clientesPorStatus.aVencer}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Vencidos:</span>
                  <span className="font-semibold text-red-600">
                    {loading ? '...' : clientesPorStatus.vencidos}
                  </span>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full mt-3"
                onClick={handleExportClientesPorStatus}
                disabled={loading}
              >
                <Download className="w-3 h-3 mr-1" />
                Exportar
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Valores por Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Em dia:</span>
                  <span className="font-semibold">
                    {loading ? '...' : formatCurrency(valoresPorStatus.emDia)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>À vencer:</span>
                  <span className="font-semibold">
                    {loading ? '...' : formatCurrency(valoresPorStatus.aVencer)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Vencidos:</span>
                  <span className="font-semibold text-red-600">
                    {loading ? '...' : formatCurrency(valoresPorStatus.vencidos)}
                  </span>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full mt-3"
                onClick={handleExportClientesPorStatus}
                disabled={loading}
              >
                <Download className="w-3 h-3 mr-1" />
                Exportar
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Top 5 Devedores
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-xs">
                {loading ? (
                  <p className="text-muted-foreground text-center py-2">Carregando...</p>
                ) : topDevedores.length === 0 ? (
                  <p className="text-muted-foreground text-center py-2">Nenhum devedor</p>
                ) : (
                  topDevedores.map((c) => (
                    <div key={c.id} className="flex justify-between">
                      <span className="truncate mr-2">{c.nome}</span>
                      <span className="font-semibold whitespace-nowrap">
                        {formatCurrency(debitoCliente(c))}
                      </span>
                    </div>
                  ))
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full mt-3"
                onClick={handleExportTopDevedores}
                disabled={loading || topDevedores.length === 0}
              >
                <Download className="w-3 h-3 mr-1" />
                Exportar
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Indicações do Mês
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Total:</span>
                  <span className="font-semibold">
                    {loading ? '...' : indicacoesMes.total}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Convertidas:</span>
                  <span className="font-semibold">
                    {loading ? '...' : indicacoesMes.convertidas}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Taxa:</span>
                  <span className="font-semibold text-green-600">
                    {loading ? '...' : `${indicacoesMes.taxa}%`}
                  </span>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full mt-3"
                onClick={handleExportIndicacoes}
                disabled={loading}
              >
                <Download className="w-3 h-3 mr-1" />
                Exportar
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Modal de Preview */}
      <Dialog open={!!previewRelatorio} onOpenChange={() => setPreviewRelatorio(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {relatoriosGerenciais.find((r) => r.id === previewRelatorio)?.titulo}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="bg-muted p-4 rounded-lg">
              <h3 className="font-semibold mb-1">
                {relatoriosGerenciais.find((r) => r.id === previewRelatorio)?.titulo?.toUpperCase()} - {mesAno}
              </h3>
              <p className="text-sm text-muted-foreground">
                Gerado em: {now.toLocaleDateString('pt-BR')} {now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>

            {loading ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="w-6 h-6 animate-spin mr-2" />
                <span>Carregando dados...</span>
              </div>
            ) : (
              <>
                {/* ═══ INADIMPLÊNCIA ═══ */}
                {previewRelatorio === 'inadimplencia' && inadimplenciaPreview && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-muted p-3 rounded">
                        <div className="text-sm text-muted-foreground">Total de clientes</div>
                        <div className="text-xl font-bold">{inadimplenciaPreview.totalClientes.toLocaleString('pt-BR')}</div>
                      </div>
                      <div className="bg-muted p-3 rounded">
                        <div className="text-sm text-muted-foreground">Inadimplentes</div>
                        <div className="text-xl font-bold text-red-600">{inadimplenciaPreview.qtdInadimplentes} ({inadimplenciaPreview.taxaInadimplencia}%)</div>
                      </div>
                      <div className="bg-muted p-3 rounded">
                        <div className="text-sm text-muted-foreground">Valor total em atraso</div>
                        <div className="text-xl font-bold">{formatCurrency(inadimplenciaPreview.valorEmAtraso)}</div>
                      </div>
                      <div className="bg-muted p-3 rounded">
                        <div className="text-sm text-muted-foreground">Média de dias em atraso</div>
                        <div className="text-xl font-bold">{inadimplenciaPreview.mediaDiasAtraso} dias</div>
                      </div>
                    </div>
                    <div>
                      <h4 className="font-semibold mb-2">Top devedores:</h4>
                      {inadimplenciaPreview.top5.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Nenhum inadimplente</p>
                      ) : (
                        <ol className="space-y-1 text-sm">
                          {inadimplenciaPreview.top5.map((c, i) => (
                            <li key={c.id}>{i + 1}. {c.nome} - {formatCurrency(debitoCliente(c))} ({c.diasAtraso ?? 0} dias)</li>
                          ))}
                        </ol>
                      )}
                    </div>
                  </div>
                )}

                {/* ═══ FLUXO DE CAIXA ═══ */}
                {previewRelatorio === 'fluxo-caixa' && fluxoCaixaPreview && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-4">
                      <div className="bg-muted p-3 rounded">
                        <div className="text-sm text-muted-foreground">Total Entradas</div>
                        <div className="text-xl font-bold text-green-600">{formatCurrency(fluxoCaixaPreview.totalEntradas)}</div>
                      </div>
                      <div className="bg-muted p-3 rounded">
                        <div className="text-sm text-muted-foreground">Total Saídas (Desembolsos)</div>
                        <div className="text-xl font-bold text-red-600">{formatCurrency(fluxoCaixaPreview.totalSaidas)}</div>
                      </div>
                      <div className="bg-muted p-3 rounded">
                        <div className="text-sm text-muted-foreground">Saldo (6 meses)</div>
                        <div className={`text-xl font-bold ${fluxoCaixaPreview.saldo >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatCurrency(fluxoCaixaPreview.saldo)}
                        </div>
                      </div>
                    </div>
                    <div>
                      <h4 className="font-semibold mb-2">Detalhamento Mensal:</h4>
                      <div className="border rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-muted">
                            <tr>
                              <th className="text-left p-2">Mês</th>
                              <th className="text-right p-2">Entradas (Recebimentos)</th>
                              <th className="text-right p-2">Saídas (Empréstimos)</th>
                              <th className="text-right p-2">Saldo</th>
                            </tr>
                          </thead>
                          <tbody>
                            {fluxoCaixaPreview.meses.map((m, i) => (
                              <tr key={i} className="border-t">
                                <td className="p-2 font-medium">{m.mes}</td>
                                <td className="p-2 text-right text-green-600">{formatCurrency(m.entradas)}</td>
                                <td className="p-2 text-right text-red-600">{formatCurrency(m.saidas)}</td>
                                <td className={`p-2 text-right font-semibold ${m.entradas - m.saidas >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                  {formatCurrency(m.entradas - m.saidas)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {/* ═══ PERFORMANCE DA REDE ═══ */}
                {previewRelatorio === 'performance-rede' && redePreview && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="bg-muted p-3 rounded">
                        <div className="text-sm text-muted-foreground">Total Membros</div>
                        <div className="text-xl font-bold">{redePreview.total}</div>
                      </div>
                      <div className="bg-muted p-3 rounded">
                        <div className="text-sm text-muted-foreground">Ativos</div>
                        <div className="text-xl font-bold text-green-600">{redePreview.ativos}</div>
                      </div>
                      <div className="bg-muted p-3 rounded">
                        <div className="text-sm text-muted-foreground">Bloqueados</div>
                        <div className="text-xl font-bold text-red-600">{redePreview.bloqueados}</div>
                      </div>
                      <div className="bg-muted p-3 rounded">
                        <div className="text-sm text-muted-foreground">Redes Ativas</div>
                        <div className="text-xl font-bold">{redePreview.redesCount}</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="bg-muted p-3 rounded">
                        <div className="text-sm text-muted-foreground">Total Bônus Gerado</div>
                        <div className="text-xl font-bold">{formatCurrency(redePreview.totalBonus)}</div>
                      </div>
                      <div className="bg-muted p-3 rounded">
                        <div className="text-sm text-muted-foreground">Total Carteira</div>
                        <div className="text-xl font-bold">{formatCurrency(redePreview.totalCarteira)}</div>
                      </div>
                      <div className="bg-muted p-3 rounded">
                        <div className="text-sm text-muted-foreground">Nível Máximo</div>
                        <div className="text-xl font-bold">{redePreview.nivelMax}</div>
                      </div>
                    </div>
                    <div>
                      <h4 className="font-semibold mb-2">Top Indicadores por Bônus:</h4>
                      {redePreview.topIndicadores.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Nenhum indicador com bônus</p>
                      ) : (
                        <ol className="space-y-1 text-sm">
                          {redePreview.topIndicadores.map((m, i) => (
                            <li key={m.id}>{i + 1}. {m.clienteNome} - {formatCurrency(m.clienteBonusAcumulado)} (Rede: {m.redeId.slice(0, 8)}...)</li>
                          ))}
                        </ol>
                      )}
                    </div>
                  </div>
                )}

                {/* ═══ COMISSÕES A PAGAR ═══ */}
                {previewRelatorio === 'comissoes' && comissoesPreview && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-muted p-3 rounded">
                        <div className="text-sm text-muted-foreground">Indicadores com Bônus</div>
                        <div className="text-xl font-bold">{comissoesPreview.total}</div>
                      </div>
                      <div className="bg-muted p-3 rounded">
                        <div className="text-sm text-muted-foreground">Total a Pagar</div>
                        <div className="text-xl font-bold text-orange-600">{formatCurrency(comissoesPreview.totalBruto)}</div>
                      </div>
                    </div>
                    <div>
                      <h4 className="font-semibold mb-2">Detalhamento:</h4>
                      {comissoesPreview.top5.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Nenhuma comissão pendente</p>
                      ) : (
                        <div className="border rounded-lg overflow-hidden">
                          <table className="w-full text-sm">
                            <thead className="bg-muted">
                              <tr>
                                <th className="text-left p-2">#</th>
                                <th className="text-left p-2">Nome</th>
                                <th className="text-left p-2">Status</th>
                                <th className="text-right p-2">Bônus Acumulado</th>
                              </tr>
                            </thead>
                            <tbody>
                              {comissoesPreview.top5.map((c, i) => (
                                <tr key={c.id} className="border-t">
                                  <td className="p-2">{i + 1}</td>
                                  <td className="p-2 font-medium">{c.nome}</td>
                                  <td className="p-2">{c.status === 'em_dia' ? '🟢 Em dia' : c.status === 'a_vencer' ? '🟡 À vencer' : '🔴 Vencido'}</td>
                                  <td className="p-2 text-right font-semibold">{formatCurrency(c.bonusAcumulado)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ═══ CLIENTES INATIVOS ═══ */}
                {previewRelatorio === 'clientes-inativos' && inativosPreview && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="bg-muted p-3 rounded">
                        <div className="text-sm text-muted-foreground">Total Inativos</div>
                        <div className="text-xl font-bold text-orange-600">{inativosPreview.total}</div>
                      </div>
                      <div className="bg-muted p-3 rounded">
                        <div className="text-sm text-muted-foreground">Sem Contato</div>
                        <div className="text-xl font-bold text-red-600">{inativosPreview.semContato}</div>
                      </div>
                      <div className="bg-muted p-3 rounded">
                        <div className="text-sm text-muted-foreground">Contato &gt;30 dias</div>
                        <div className="text-xl font-bold text-yellow-600">{inativosPreview.comContatoAntigo}</div>
                      </div>
                      <div className="bg-muted p-3 rounded">
                        <div className="text-sm text-muted-foreground">Valor em carteira</div>
                        <div className="text-xl font-bold">{formatCurrency(inativosPreview.valorTotal)}</div>
                      </div>
                    </div>
                    <div>
                      <h4 className="font-semibold mb-2">Top 10 inativos (por valor):</h4>
                      {inativosPreview.lista.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Todos os clientes foram contatados recentemente</p>
                      ) : (
                        <div className="border rounded-lg overflow-hidden">
                          <table className="w-full text-sm">
                            <thead className="bg-muted">
                              <tr>
                                <th className="text-left p-2">Nome</th>
                                <th className="text-left p-2">Telefone</th>
                                <th className="text-left p-2">Último Contato</th>
                                <th className="text-right p-2">Valor</th>
                              </tr>
                            </thead>
                            <tbody>
                              {inativosPreview.lista.map((c) => (
                                <tr key={c.id} className="border-t">
                                  <td className="p-2 font-medium">{c.nome}</td>
                                  <td className="p-2">{c.telefone}</td>
                                  <td className="p-2">{c.ultimoContato ? new Date(c.ultimoContato).toLocaleDateString('pt-BR') : 'Nunca'}</td>
                                  <td className="p-2 text-right font-semibold">{formatCurrency(debitoCliente(c))}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ═══ ANÁLISE DE CRÉDITO ═══ */}
                {previewRelatorio === 'analise-credito' && creditoPreview && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="bg-muted p-3 rounded">
                        <div className="text-sm text-muted-foreground">Total Solicitações</div>
                        <div className="text-xl font-bold">{creditoPreview.total}</div>
                      </div>
                      <div className="bg-muted p-3 rounded">
                        <div className="text-sm text-muted-foreground">Aprovadas</div>
                        <div className="text-xl font-bold text-green-600">{creditoPreview.aprovadas}</div>
                      </div>
                      <div className="bg-muted p-3 rounded">
                        <div className="text-sm text-muted-foreground">Recusadas</div>
                        <div className="text-xl font-bold text-red-600">{creditoPreview.recusadas}</div>
                      </div>
                      <div className="bg-muted p-3 rounded">
                        <div className="text-sm text-muted-foreground">Taxa Aprovação</div>
                        <div className="text-xl font-bold">{creditoPreview.taxaAprovacao}%</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="bg-muted p-3 rounded">
                        <div className="text-sm text-muted-foreground">Pendentes + Em Análise</div>
                        <div className="text-xl font-bold text-yellow-600">{creditoPreview.pendentes + creditoPreview.emAnalise}</div>
                      </div>
                      <div className="bg-muted p-3 rounded">
                        <div className="text-sm text-muted-foreground">Valor Aprovado</div>
                        <div className="text-xl font-bold text-green-600">{formatCurrency(creditoPreview.valorAprovado)}</div>
                      </div>
                      <div className="bg-muted p-3 rounded">
                        <div className="text-sm text-muted-foreground">Valor Recusado</div>
                        <div className="text-xl font-bold text-red-600">{formatCurrency(creditoPreview.valorRecusado)}</div>
                      </div>
                    </div>
                    <div>
                      <h4 className="font-semibold mb-2">Últimas Solicitações:</h4>
                      {creditoPreview.recentes.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Nenhuma solicitação encontrada</p>
                      ) : (
                        <div className="border rounded-lg overflow-hidden">
                          <table className="w-full text-sm">
                            <thead className="bg-muted">
                              <tr>
                                <th className="text-left p-2">Cliente</th>
                                <th className="text-left p-2">Valor</th>
                                <th className="text-left p-2">Status</th>
                                <th className="text-left p-2">Data</th>
                              </tr>
                            </thead>
                            <tbody>
                              {creditoPreview.recentes.map((a) => (
                                <tr key={a.id} className="border-t">
                                  <td className="p-2 font-medium">{a.clienteNome}</td>
                                  <td className="p-2">{formatCurrency(a.valorSolicitado)}</td>
                                  <td className="p-2">
                                    {a.status === 'aprovado' ? '🟢 Aprovado' : a.status === 'recusado' ? '🔴 Recusado' : a.status === 'em_analise' ? '🟡 Em análise' : '⏳ Pendente'}
                                  </td>
                                  <td className="p-2">{new Date(a.dataSolicitacao).toLocaleDateString('pt-BR')}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Botões de Ação */}
            <div className="flex gap-2 pt-4 border-t">
              <Button
                className="flex-1 bg-primary hover:bg-primary/90"
                disabled={loading}
                onClick={() => handleExportRelatorio('csv')}
              >
                <Download className="w-4 h-4 mr-2" />
                Exportar CSV
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setPreviewRelatorio(null)}
              >
                Fechar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
