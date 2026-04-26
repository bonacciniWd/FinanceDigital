/**
 * @module DashboardCobrancaPage
 * @description Dashboard de cobrança com indicadores de inadimplência.
 *
 * Dados derivados de empréstimos ativos/inadimplentes (fonte de verdade)
 * e do kanban de cobrança para métricas de negociação/recuperação.
 *
 * @route /dashboard/cobranca
 * @access Protegido — perfis admin, gerente, cobrador
 */
import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Alert, AlertDescription } from '../components/ui/alert';
import { AlertTriangle, MessageSquare, HandshakeIcon, TrendingUp, Banknote } from 'lucide-react';
import { useClientes } from '../hooks/useClientes';
import { useEmprestimos } from '../hooks/useEmprestimos';
import { useParcelas } from '../hooks/useParcelas';
import { useCardsCobranca } from '../hooks/useKanbanCobranca';
import { useAcordos } from '../hooks/useAcordos';
import { valorCorrigido } from '../lib/juros';
import { DashboardSkeleton } from '../components/DashboardSkeleton';

export default function DashboardCobrancaPage() {
  const navigate = useNavigate();
  const { data: allClientes = [], isLoading: loadingClientes } = useClientes();
  const { data: emprestimos = [], isLoading: loadingEmp } = useEmprestimos();
  const { data: allParcelas = [], isLoading: loadingParc } = useParcelas();
  const { data: cardsCobranca = [], isLoading: loadingCards } = useCardsCobranca();
  const { data: acordos = [], isLoading: loadingAcordos } = useAcordos();

  const isLoading = loadingClientes || loadingEmp || loadingParc || loadingCards || loadingAcordos;

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  // ── Derivar dados reais dos empréstimos + parcelas com juros ──
  const dados = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const MS_DIA = 86400000;

    // Clientes considerados ARQUIVADOS na régua de cobrança:
    //   - card no kanban com etapa 'arquivado' OU 'perdido'
    //   - card 'vencido' com diasAtraso > 365 (mesma convenção do KanbanCobrancaPage)
    const clienteIdsArquivados = new Set<string>(
      cardsCobranca
        .filter((c) => {
          if (c.etapa === 'arquivado' || c.etapa === 'perdido') return true;
          if (c.etapa === 'vencido' && (c.diasAtraso ?? 0) > 365) return true;
          return false;
        })
        .map((c) => c.clienteId)
        .filter(Boolean) as string[],
    );

    // Empréstimos ativos/inadimplentes excluindo clientes arquivados
    const emprestimosVivos = emprestimos.filter((e) => !clienteIdsArquivados.has(e.clienteId));
    const inadimplentes = emprestimosVivos.filter((e) => e.status === 'inadimplente');
    const ativos = emprestimosVivos.filter((e) => e.status === 'ativo');

    // Set de clientes inadimplentes (via empréstimos)
    const clienteIdsInadimplentes = new Set(inadimplentes.map((e) => e.clienteId));
    const clientesInadimplentes = allClientes.filter((c) => clienteIdsInadimplentes.has(c.id));

    // Parcelas pendentes/vencidas (não pagas) — exclui clientes arquivados
    // e parcelas com mais de 365 dias de atraso (juros congelados pela régua).
    const parcelasAbertas = allParcelas.filter((p) => {
      if (p.status === 'paga' || p.status === 'cancelada') return false;
      if (clienteIdsArquivados.has(p.clienteId)) return false;
      const diasAtraso = Math.floor((today.getTime() - new Date(p.dataVencimento).getTime()) / MS_DIA);
      if (diasAtraso > 365) return false;
      return true;
    });

    // Calcular valor corrigido de cada parcela (com juros automáticos, capados em 365d pelo lib)
    const valorCorrigidoParcela = (p: typeof parcelasAbertas[0]) => {
      const { total } = valorCorrigido(p.valorOriginal, p.dataVencimento, p.juros, p.multa, p.desconto);
      return total;
    };

    // Parcelas abertas por empréstimo
    const parcelasPorEmp = new Map<string, typeof parcelasAbertas>();
    for (const p of parcelasAbertas) {
      const arr = parcelasPorEmp.get(p.emprestimoId) ?? [];
      arr.push(p);
      parcelasPorEmp.set(p.emprestimoId, arr);
    }

    // Valor total em atraso = soma corrigida das parcelas abertas dos inadimplentes
    const valorTotalAtraso = inadimplentes.reduce((acc, e) => {
      const ps = parcelasPorEmp.get(e.id) ?? [];
      return acc + ps.reduce((s, p) => s + valorCorrigidoParcela(p), 0);
    }, 0);

    // Valor total da carteira ativa (ativos + inadimplentes)
    const valorCarteira = [...ativos, ...inadimplentes].reduce((acc, e) => {
      const ps = parcelasPorEmp.get(e.id) ?? [];
      return acc + ps.reduce((s, p) => s + valorCorrigidoParcela(p), 0);
    }, 0);

    // Dias de atraso real por cliente
    const clientesDados = clientesInadimplentes.map(c => {
      const empsCliente = inadimplentes.filter(e => e.clienteId === c.id);

      // Total devido = soma corrigida de todas as parcelas abertas desse cliente
      const totalDevido = empsCliente.reduce((s, e) => {
        const ps = parcelasPorEmp.get(e.id) ?? [];
        return s + ps.reduce((sum, p) => sum + valorCorrigidoParcela(p), 0);
      }, 0);

      // Dias de atraso = max entre todos os empréstimos inadimplentes do cliente (cap 365)
      const diasAtraso = empsCliente.reduce((max, e) => {
        const venc = new Date(e.proximoVencimento);
        const dias = Math.max(0, Math.floor((today.getTime() - venc.getTime()) / MS_DIA));
        return Math.max(max, Math.min(dias, 365));
      }, 0);

      return { ...c, diasAtrasoReal: diasAtraso, valorDevido: totalDevido, qtdEmprestimos: empsCliente.length };
    })
      .filter((c) => c.valorDevido > 0) // sem parcelas abertas elegíveis -> não conta
      .sort((a, b) => b.diasAtrasoReal - a.diasAtrasoReal);

    const mediaDiasAtraso = clientesDados.length > 0
      ? Math.round(clientesDados.reduce((acc, c) => acc + c.diasAtrasoReal, 0) / clientesDados.length)
      : 0;

    // Kanban: negociações ativas e recuperação
    const emNegociacao = cardsCobranca.filter(c => c.etapa === 'negociacao');
    const emAcordo = cardsCobranca.filter(c => c.etapa === 'acordo');
    const pagos = cardsCobranca.filter(c => c.etapa === 'pago');
    const negociacoesAtivas = emNegociacao.length;
    const valorNegociacao = emNegociacao.reduce((s, c) => s + c.valorDivida, 0);
    const valorRecuperado = pagos.reduce((s, c) => s + c.valorDivida, 0);
    const taxaRecuperacao = (valorTotalAtraso + valorRecuperado) > 0
      ? Math.round((valorRecuperado / (valorTotalAtraso + valorRecuperado)) * 100)
      : 0;

    // Acordos formais (separado de pagamento limpo)
    const acordosAtivos = acordos.filter(a => a.status === 'ativo');
    const acordosQuitados = acordos.filter(a => a.status === 'quitado');
    const valorTotalAcordos = acordosAtivos.reduce((s, a) => s + Number(a.valor_divida_original), 0);
    const valorEntradasPagas = acordosAtivos.filter(a => a.entrada_paga).reduce((s, a) => s + Number(a.valor_entrada), 0);
    const valorRecuperadoAcordos = acordosQuitados.reduce((s, a) => s + Number(a.valor_divida_original), 0);

    // ── Faturamento real por origem (parcelas pagas) ─────────────
    // Pagamento Limpo: parcelas pagas SEM acordo_id (faturamento direto)
    // Recuperação Acordo: parcelas pagas COM acordo_id (renegociação)
    const parcelasPagas = allParcelas.filter(p => p.status === 'paga');
    const valorPagamentoLimpo = parcelasPagas
      .filter(p => !p.acordoId)
      .reduce((s, p) => s + (p.valor || 0), 0);
    const valorRecuperadoViaParcelasAcordo = parcelasPagas
      .filter(p => !!p.acordoId)
      .reduce((s, p) => s + (p.valor || 0), 0);

    // Recuperação total via acordos = entradas + parcelas pagas vinculadas a acordos
    const valorRecuperadoLimpo = valorPagamentoLimpo;
    const valorRecuperadoAcordosTotal = valorRecuperadoViaParcelasAcordo + valorEntradasPagas;

    return {
      totalInadimplentes: clientesDados.length,
      totalEmpInadimplentes: inadimplentes.length,
      valorTotalAtraso,
      valorCarteira,
      mediaDiasAtraso,
      negociacoesAtivas,
      valorNegociacao,
      valorRecuperado,
      taxaRecuperacao,
      clientesDados,
      acordosAtivos: acordosAtivos.length,
      valorTotalAcordos,
      valorEntradasPagas,
      valorRecuperadoAcordos: valorRecuperadoAcordosTotal,
      valorRecuperadoLimpo,
    };
  }, [allClientes, emprestimos, allParcelas, cardsCobranca, acordos]);

  if (isLoading) {
    return <DashboardSkeleton kpis={4} />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Dashboard - Cobrança</h1>
        <p className="text-muted-foreground mt-1">Gestão de clientes inadimplentes · Dados em tempo real dos empréstimos</p>
      </div>

      <Alert className="border-accent bg-accent/10">
        <AlertTriangle className="h-4 w-4 text-accent" />
        <AlertDescription className="text-accent">
          <strong>ATENÇÃO:</strong> Você está no perfil COBRANÇA — {dados.totalEmpInadimplentes} empréstimo(s) inadimplente(s) de {dados.totalInadimplentes} cliente(s)
        </AlertDescription>
      </Alert>

      {/* Cards de Métricas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total em Atraso</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600 dark:text-red-400">{formatCurrency(dados.valorTotalAtraso)}</div>
            <p className="text-xs text-muted-foreground mt-1">{dados.totalInadimplentes} clientes · {dados.totalEmpInadimplentes} empréstimos</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Média Dias Atraso</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dados.mediaDiasAtraso}</div>
            <p className="text-xs text-muted-foreground mt-1">dias (baseado nos vencimentos)</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Negociações Ativas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">{dados.negociacoesAtivas}</div>
            <p className="text-xs text-muted-foreground mt-1">{formatCurrency(dados.valorNegociacao)} em negociação</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Taxa Recuperação</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">{dados.taxaRecuperacao}%</div>
            <p className="text-xs text-muted-foreground mt-1">recuperado: {formatCurrency(dados.valorRecuperado)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Separação: Pagamento Limpo vs Acordos */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border-green-200 dark:border-green-900/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-green-700 dark:text-green-400">Pagamento Limpo</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">{formatCurrency(dados.valorRecuperadoLimpo)}</div>
            <p className="text-xs text-muted-foreground mt-1">pago diretamente sem renegociação</p>
          </CardContent>
        </Card>

        <Card className="border-orange-200 dark:border-orange-900/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-orange-700 dark:text-orange-400">Acordos Ativos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">{dados.acordosAtivos}</div>
            <p className="text-xs text-muted-foreground mt-1">dívida: {formatCurrency(dados.valorTotalAcordos)} · entradas pagas: {formatCurrency(dados.valorEntradasPagas)}</p>
          </CardContent>
        </Card>

        <Card className="border-blue-200 dark:border-blue-900/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-blue-700 dark:text-blue-400">Recuperado via Acordos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{formatCurrency(dados.valorRecuperadoAcordos)}</div>
            <p className="text-xs text-muted-foreground mt-1">parcelas de acordo + entradas pagas</p>
          </CardContent>
        </Card>
      </div>

      {/* Botões de Ação */}
      <div className="flex gap-4">
        <Button className="bg-primary hover:bg-secondary/90" onClick={() => navigate('/kanban/cobranca')}>
          <HandshakeIcon className="w-4 h-4 mr-2" />
          Abrir Kanban de Cobrança
        </Button>
        <Button variant="default" onClick={() => navigate('/clientes/emprestimos')}>
          <Banknote className="w-4 h-4 mr-2" />
          Empréstimos Ativos
        </Button>
      </div>

      {/* Lista de Clientes Inadimplentes */}
      <Card>
        <CardHeader>
          <CardTitle>Clientes Inadimplentes</CardTitle>
        </CardHeader>
        <CardContent>
          {dados.clientesDados.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <TrendingUp className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="font-medium">Nenhum cliente inadimplente</p>
              <p className="text-sm mt-1">Todos os empréstimos estão em dia!</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-medium">Cliente</th>
                    <th className="text-left py-3 px-4 font-medium">Empréstimos</th>
                    <th className="text-left py-3 px-4 font-medium">Valor Devido</th>
                    <th className="text-left py-3 px-4 font-medium">Dias Atraso</th>
                    <th className="text-left py-3 px-4 font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {dados.clientesDados.map((cliente) => (
                    <tr key={cliente.id} className="border-b hover:bg-muted/50">
                      <td className="py-3 px-4">
                        <div>
                          <div className="font-medium">{cliente.nome}</div>
                          <div className="text-sm text-muted-foreground">{cliente.email}</div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant="secondary">{cliente.qtdEmprestimos}</Badge>
                      </td>
                      <td className="py-3 px-4 font-semibold text-red-600 dark:text-red-400">
                        {formatCurrency(cliente.valorDevido)}
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant="destructive">{cliente.diasAtrasoReal} dias</Badge>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => navigate(`/whatsapp?telefone=${encodeURIComponent(cliente.telefone)}`)}>
                            <MessageSquare className="w-4 h-4 mr-1" />
                            WhatsApp
                          </Button>
                          <Button size="sm" className="bg-secondary hover:bg-secondary/90" onClick={() => navigate('/kanban/cobranca')}>
                            <HandshakeIcon className="w-4 h-4 mr-1" />
                            Negociar
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
