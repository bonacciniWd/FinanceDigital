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
import { useCardsCobranca } from '../hooks/useKanbanCobranca';

export default function DashboardCobrancaPage() {
  const navigate = useNavigate();
  const { data: allClientes = [] } = useClientes();
  const { data: emprestimos = [] } = useEmprestimos();
  const { data: cardsCobranca = [] } = useCardsCobranca();

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  // ── Derivar dados reais dos empréstimos ──────────────────
  const dados = useMemo(() => {
    // Empréstimos inadimplentes
    const inadimplentes = emprestimos.filter(e => e.status === 'inadimplente');
    const ativos = emprestimos.filter(e => e.status === 'ativo');

    // Set de clientes inadimplentes (via empréstimos)
    const clienteIdsInadimplentes = new Set(inadimplentes.map(e => e.clienteId));
    const clientesInadimplentes = allClientes.filter(c => clienteIdsInadimplentes.has(c.id));

    // Valor total em atraso = soma do saldo devedor dos inadimplentes
    // (parcelas restantes * valor_parcela)
    const valorTotalAtraso = inadimplentes.reduce((acc, e) => {
      const restantes = e.parcelas - e.parcelasPagas;
      return acc + (restantes * e.valorParcela);
    }, 0);

    // Valor total da carteira ativa (ativos + inadimplentes)
    const valorCarteira = [...ativos, ...inadimplentes].reduce((acc, e) => {
      const restantes = e.parcelas - e.parcelasPagas;
      return acc + (restantes * e.valorParcela);
    }, 0);

    // Dias de atraso real por cliente (baseado em próximoVencimento dos inadimplentes)
    const today = new Date();
    const clientesDados = clientesInadimplentes.map(c => {
      const empsCliente = inadimplentes.filter(e => e.clienteId === c.id);
      const totalDevido = empsCliente.reduce((s, e) => s + ((e.parcelas - e.parcelasPagas) * e.valorParcela), 0);

      // Dias de atraso = max entre todos os empréstimos inadimplentes do cliente
      const diasAtraso = empsCliente.reduce((max, e) => {
        const venc = new Date(e.proximoVencimento);
        const dias = Math.max(0, Math.floor((today.getTime() - venc.getTime()) / (1000 * 60 * 60 * 24)));
        return Math.max(max, dias);
      }, 0);

      return { ...c, diasAtrasoReal: diasAtraso, valorDevido: totalDevido, qtdEmprestimos: empsCliente.length };
    }).sort((a, b) => b.diasAtrasoReal - a.diasAtrasoReal);

    const mediaDiasAtraso = clientesDados.length > 0
      ? Math.round(clientesDados.reduce((acc, c) => acc + c.diasAtrasoReal, 0) / clientesDados.length)
      : 0;

    // Kanban: negociações ativas e recuperação
    const emNegociacao = cardsCobranca.filter(c => c.etapa === 'negociacao');
    const emAcordo = cardsCobranca.filter(c => c.etapa === 'acordo');
    const pagos = cardsCobranca.filter(c => c.etapa === 'pago');
    const negociacoesAtivas = emNegociacao.length + emAcordo.length;
    const valorNegociacao = emNegociacao.reduce((s, c) => s + c.valorDivida, 0);
    const valorAcordos = emAcordo.reduce((s, c) => s + c.valorDivida, 0);
    const valorRecuperado = pagos.reduce((s, c) => s + c.valorDivida, 0);
    const taxaRecuperacao = (valorTotalAtraso + valorRecuperado) > 0
      ? Math.round((valorRecuperado / (valorTotalAtraso + valorRecuperado)) * 100)
      : 0;

    return {
      totalInadimplentes: clientesDados.length,
      totalEmpInadimplentes: inadimplentes.length,
      valorTotalAtraso,
      valorCarteira,
      mediaDiasAtraso,
      negociacoesAtivas,
      valorNegociacao,
      valorAcordos,
      valorRecuperado,
      taxaRecuperacao,
      clientesDados,
    };
  }, [allClientes, emprestimos, cardsCobranca]);

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
            <p className="text-xs text-muted-foreground mt-1">{formatCurrency(dados.valorNegociacao + dados.valorAcordos)}</p>
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

      {/* Botões de Ação */}
      <div className="flex gap-4">
        <Button className="bg-secondary hover:bg-secondary/90" onClick={() => navigate('/kanban/cobranca')}>
          <HandshakeIcon className="w-4 h-4 mr-2" />
          Abrir Kanban de Cobrança
        </Button>
        <Button variant="outline" onClick={() => navigate('/clientes/emprestimos-ativos')}>
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
