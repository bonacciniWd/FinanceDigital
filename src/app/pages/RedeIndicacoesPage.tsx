/**
 * @module RedeIndicacoesPage
 * @description Painel da rede de indicações e afiliados.
 *
 * Visualização hierárquica da rede, métricas de indicações
 * (total, convertidas, pendentes) e ranking dos melhores
 * indicadores. Alertas para indicações com problemas.
 *
 * @route /rede
 * @access Protegido — todos os perfis autenticados
 * @see mockClientes
 */
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Alert, AlertDescription } from '../components/ui/alert';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { AlertTriangle, User, DollarSign } from 'lucide-react';
import { useClientes } from '../hooks/useClientes';
import { StatusBadge } from '../components/StatusBadge';

export default function RedeIndicacoesPage() {
  const { data: allClientes = [] } = useClientes();

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  // Encontrar cliente com rede (exemplo: João Silva)
  const clienteTop = allClientes.find((c) => c.id === '1');
  const indicadosNivel1 = allClientes.filter((c) => clienteTop?.indicou?.includes(c.id));

  // Cliente com problema (Ana Costa - ID 4) está vencido
  const clienteProblema = allClientes.find((c) => c.id === '4');
  const redeComProblema = clienteProblema?.indicadoPor === '1';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Rede de Indicações</h1>
        <p className="text-muted-foreground mt-1">Visualize e gerencie a rede de indicações</p>
      </div>

      {/* Alerta de Bloqueio */}
      {redeComProblema && clienteProblema && (
        <Alert className="border-red-500 bg-red-50">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-800">
            <strong>⚠️ BLOQUEIO SOLIDÁRIO ATIVO</strong>
            <br />
            Cliente {clienteProblema.nome} está INADIMPLENTE
            <br />
            A rede inteira está com crédito BLOQUEADO
            <br />
            Para liberar, regularizar: {formatCurrency(clienteProblema.valor)}
          </AlertDescription>
          <div className="mt-3 flex gap-2">
            <Button size="sm" variant="outline">
              Ver Detalhes
            </Button>
            <Button size="sm" className="bg-red-600 hover:bg-red-700">
              Contatar Cliente
            </Button>
          </div>
        </Alert>
      )}

      {/* Mapa Visual da Rede */}
      <Card>
        <CardHeader>
          <CardTitle>Mapa da Rede - Visualização Hierárquica</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center">
            <div className="inline-block">
              {/* Nível 0 - Top */}
              {clienteTop && (
                <div className="flex flex-col items-center">
                  <div className="bg-card border-2 border-primary rounded-lg p-4 shadow-lg w-64">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 bg-primary text-primary-foreground rounded-full flex items-center justify-center font-semibold">
                        {clienteTop.nome.charAt(0)}
                      </div>
                      <div className="flex-1">
                        <div className="font-semibold">{clienteTop.nome}</div>
                        <div className="text-xs text-muted-foreground">{clienteTop.email}</div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <StatusBadge status={clienteTop.status} />
                      <span className="font-medium">{formatCurrency(clienteTop.valor)}</span>
                    </div>
                  </div>

                  {/* Linha conectora */}
                  <div className="w-0.5 h-8 bg-border" />

                  {/* Nível 1 - Indicados diretos */}
                  <div className="flex gap-8 relative">
                    {/* Linha horizontal conectora */}
                    {indicadosNivel1.length > 1 && (
                      <div
                        className="absolute top-0 h-0.5 bg-border"
                        style={{
                          left: '25%',
                          right: '25%',
                        }}
                      />
                    )}

                    {indicadosNivel1.map((cliente, index) => (
                      <div key={cliente.id} className="flex flex-col items-center">
                        {/* Linha vertical individual */}
                        <div className="w-0.5 h-8 bg-border" />

                        <div
                          className={`bg-card border-2 rounded-lg p-3 shadow w-56 ${
                            cliente.status === 'vencido'
                              ? 'border-red-500'
                              : cliente.status === 'a_vencer'
                              ? 'border-yellow-500'
                              : 'border-green-500'
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <div
                              className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold text-sm text-white ${
                                cliente.status === 'vencido'
                                  ? 'bg-red-500'
                                  : cliente.status === 'a_vencer'
                                  ? 'bg-yellow-500'
                                  : 'bg-green-500'
                              }`}
                            >
                              {cliente.nome.charAt(0)}
                            </div>
                            <div className="flex-1">
                              <div className="font-medium text-sm">{cliente.nome}</div>
                              <div className="text-xs text-muted-foreground">{cliente.email}</div>
                            </div>
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <StatusBadge status={cliente.status} />
                            <span className="font-medium">{formatCurrency(cliente.valor)}</span>
                          </div>
                        </div>

                        {/* Sub-nível (mock - apenas visual) */}
                        {index === 0 && (
                          <>
                            <div className="w-0.5 h-8 bg-border" />
                            <div className="bg-card border-2 border-green-500 rounded-lg p-2 shadow w-48 text-xs">
                              <div className="flex items-center gap-2 mb-1">
                                <div className="w-6 h-6 bg-green-500 text-white rounded-full flex items-center justify-center font-semibold text-xs">
                                  C
                                </div>
                                <div>
                                  <div className="font-medium">Cliente Sub</div>
                                  <div className="text-xs text-muted-foreground">cliente@email.com</div>
                                </div>
                              </div>
                              <div className="flex justify-between">
                                <Badge className="bg-green-100 text-green-800 hover:bg-green-100 text-xs">
                                  Em dia
                                </Badge>
                                <span className="font-medium">R$ 2k</span>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Legenda */}
          <div className="mt-8 pt-6 border-t flex items-center justify-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-green-500 rounded-full" />
              <span>🟢 Em dia</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-yellow-500 rounded-full" />
              <span>🟡 À vencer</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-red-500 rounded-full" />
              <span>🔴 Vencido</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabela de Bônus */}
      <Card>
        <CardHeader>
          <CardTitle>Bônus e Comissões por Indicação</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4 font-medium">Indicador</th>
                  <th className="text-left py-3 px-4 font-medium">Indicações</th>
                  <th className="text-left py-3 px-4 font-medium">Convertidas</th>
                  <th className="text-left py-3 px-4 font-medium">Bônus Acumulado</th>
                  <th className="text-left py-3 px-4 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {allClientes
                  .filter((c) => c.indicou && c.indicou.length > 0)
                  .map((cliente) => (
                    <tr key={cliente.id} className="border-b hover:bg-muted/50">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-muted-foreground" />
                          <span className="font-medium">{cliente.nome}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4">{cliente.indicou?.length || 0}</td>
                      <td className="py-3 px-4">
                        {Math.floor((cliente.indicou?.length || 0) * 0.7)}
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-semibold text-green-600">
                          {formatCurrency(cliente.bonusAcumulado)}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <Badge
                          className={
                            cliente.status === 'vencido'
                              ? 'bg-red-100 text-red-800 hover:bg-red-100'
                              : 'bg-green-100 text-green-800 hover:bg-green-100'
                          }
                        >
                          {cliente.status === 'vencido' ? 'Bloqueado 🔴' : 'Disponível'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Estatísticas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total de Indicações
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">47</div>
            <p className="text-xs text-muted-foreground mt-1">na rede</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Bônus Pagos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(12450)}</div>
            <p className="text-xs text-muted-foreground mt-1">no mês</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Redes Bloqueadas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">3</div>
            <p className="text-xs text-muted-foreground mt-1">ativas</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
