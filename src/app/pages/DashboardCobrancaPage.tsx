/**
 * @module DashboardCobrancaPage
 * @description Dashboard de cobrança com indicadores de inadimplência.
 *
 * Mostra total em atraso, parcelas vencidas, acordos realizados
 * e taxa de recuperação. Lista clientes com maior atraso e
 * ações rápidas de contato (WhatsApp, telefone).
 *
 * @route /dashboard/cobranca
 * @access Protegido — perfis admin, gerente, cobrador
 * @see mockClientes, mockParcelas
 */
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Alert, AlertDescription } from '../components/ui/alert';
import { AlertTriangle, MessageSquare, HandshakeIcon } from 'lucide-react';
import { useClientes } from '../hooks/useClientes';
import { StatusBadge } from '../components/StatusBadge';

export default function DashboardCobrancaPage() {
  const { data: allClientes = [] } = useClientes();
  // Filtrar apenas clientes inadimplentes
  const clientesInadimplentes = allClientes.filter((c) => c.status === 'vencido');

  const totalInadimplentes = clientesInadimplentes.length;
  const valorTotal = clientesInadimplentes.reduce((acc, c) => acc + c.valor, 0);
  const mediaDiasAtraso = Math.round(
    clientesInadimplentes.reduce((acc, c) => acc + (c.diasAtraso || 0), 0) / totalInadimplentes
  );
  const negociacoesAtivas = 23; // Mock

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  return (
    <div className="space-y-6">
      {/* Título */}
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Dashboard - Cobrança</h1>
        <p className="text-muted-foreground mt-1">Gestão de clientes inadimplentes</p>
      </div>

      {/* Alerta de perfil */}
      <Alert className="border-accent bg-accent/10">
        <AlertTriangle className="h-4 w-4 text-accent" />
        <AlertDescription className="text-accent">
          <strong>ATENÇÃO:</strong> Você está no perfil COBRANÇA - Visualizando apenas clientes INADIMPLENTES
        </AlertDescription>
      </Alert>

      {/* Cards de Métricas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Inadimplentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalInadimplentes}</div>
            <p className="text-xs text-muted-foreground mt-1">clientes</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Valor Total
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(valorTotal)}</div>
            <p className="text-xs text-muted-foreground mt-1">em atraso</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Média Dias Atraso
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{mediaDiasAtraso}</div>
            <p className="text-xs text-muted-foreground mt-1">dias</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Negociações Ativas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{negociacoesAtivas}</div>
            <p className="text-xs text-muted-foreground mt-1">em andamento</p>
          </CardContent>
        </Card>
      </div>

      {/* Botões de Ação */}
      <div className="flex gap-4">
        <Button className="bg-secondary hover:bg-secondary/90">
          <HandshakeIcon className="w-4 h-4 mr-2" />
          Iniciar Negociação
        </Button>
        <Button variant="outline">
          <MessageSquare className="w-4 h-4 mr-2" />
          Enviar Lembrete em Massa
        </Button>
      </div>

      {/* Lista de Clientes Vencidos */}
      <Card>
        <CardHeader>
          <CardTitle>Clientes Inadimplentes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4 font-medium">Cliente</th>
                  <th className="text-left py-3 px-4 font-medium">Dias Atraso</th>
                  <th className="text-left py-3 px-4 font-medium">Valor</th>
                  <th className="text-left py-3 px-4 font-medium">Último Contato</th>
                  <th className="text-left py-3 px-4 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {clientesInadimplentes.map((cliente) => (
                  <tr key={cliente.id} className="border-b hover:bg-muted/50">
                    <td className="py-3 px-4">
                      <div>
                        <div className="font-medium">{cliente.nome}</div>
                        <div className="text-sm text-muted-foreground">
                          {cliente.email}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                        {cliente.diasAtraso} dias
                      </span>
                    </td>
                    <td className="py-3 px-4 font-medium">
                      {formatCurrency(cliente.valor)}
                    </td>
                    <td className="py-3 px-4 text-sm text-muted-foreground">
                      {cliente.ultimoContato || 'Nenhum'}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline">
                          <MessageSquare className="w-4 h-4 mr-1" />
                          WhatsApp
                        </Button>
                        <Button size="sm" className="bg-secondary hover:bg-secondary/90">
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
        </CardContent>
      </Card>
    </div>
  );
}
