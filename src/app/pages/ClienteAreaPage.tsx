/**
 * @module ClienteAreaPage
 * @description Área de autoatendimento do cliente (portal do cliente).
 *
 * Visão do cliente sobre seus empréstimos, parcelas, boletos
 * e histórico de pagamentos. Botões de compartilhamento,
 * chat com atendente e download de documentos.
 *
 * @route /area-cliente
 * @access Protegido — perfil cliente
 * @see mockClientes, mockEmprestimos
 */
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Share2, MessageSquare, FileText, User } from 'lucide-react';
import { useClientes } from '../hooks/useClientes';

export default function ClienteAreaPage() {
  const { data: clientes = [] } = useClientes();
  // Simular cliente logado (primeiro da lista)
  const cliente = clientes[0];

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('pt-BR');
  };

  const historicoTransacoes = [
    { data: '2026-06-15', descricao: 'Parcela 5/12', valor: 500, status: 'Pago' },
    { data: '2026-05-15', descricao: 'Parcela 4/12', valor: 500, status: 'Pago' },
    { data: '2026-04-15', descricao: 'Parcela 3/12', valor: 500, status: 'Pago' },
    { data: '2026-03-15', descricao: 'Parcela 2/12', valor: 500, status: 'Pago' },
    { data: '2026-02-15', descricao: 'Parcela 1/12', valor: 500, status: 'Pago' },
  ];

  return (
    <div className="min-h-screen bg-muted">
      {/* Header */}
      <header className="bg-primary text-primary-foreground p-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-secondary rounded flex items-center justify-center font-bold text-lg">
              F
            </div>
            <span className="font-semibold text-lg">FintechFlow</span>
          </div>
          <div className="flex items-center gap-4">
            <span>Olá, {cliente.nome}!</span>
            <Button variant="ghost" size="sm" className="text-primary-foreground hover:text-primary-foreground hover:bg-primary-foreground/20">
              Sair
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Cards Principais */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="w-5 h-5" />
                Meus Dados
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <div className="text-sm text-muted-foreground">Nome</div>
                <div className="font-medium">{cliente.nome}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Email</div>
                <div className="font-medium">{cliente.email}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Telefone</div>
                <div className="font-medium">{cliente.telefone}</div>
              </div>
              <Button variant="outline" className="w-full mt-4">
                Editar Dados
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Meus Empréstimos
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Total:</span>
                  <span className="font-semibold text-lg">
                    {formatCurrency(cliente.valor)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Próxima parcela:</span>
                  <span className="font-medium">{formatDate(cliente.vencimento)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Status:</span>
                  <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                    ✅ Em dia
                  </Badge>
                </div>
              </div>
              <Button className="w-full mt-4 bg-primary hover:bg-primary/90">
                Ver Detalhes
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Indicar Amigos */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Share2 className="w-5 h-5" />
              Indicar Amigos
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-secondary/10 border-2 border-secondary rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="font-semibold">Compartilhe seu link de indicação</div>
                  <div className="text-sm text-muted-foreground">
                    Ganhe bônus para cada amigo aprovado!
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={`https://fintechflow.com/indicacao/${cliente.id}`}
                  readOnly
                  className="flex-1 px-3 py-2 border rounded-md bg-card"
                />
                <Button className="bg-secondary hover:bg-secondary/90">
                  <Share2 className="w-4 h-4 mr-2" />
                  Compartilhar
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="bg-muted p-4 rounded-lg text-center">
                <div className="text-2xl font-bold text-secondary">
                  {cliente.indicou?.length || 0}
                </div>
                <div className="text-sm text-muted-foreground">Seus indicados</div>
              </div>
              <div className="bg-muted p-4 rounded-lg text-center">
                <div className="text-2xl font-bold text-green-600">
                  {formatCurrency(cliente.bonusAcumulado)}
                </div>
                <div className="text-sm text-muted-foreground">Bônus acumulado</div>
              </div>
              <div className="bg-muted p-4 rounded-lg text-center">
                <Button
                  className="w-full bg-primary hover:bg-primary/90"
                  onClick={() => alert('Função de visualização da rede em desenvolvimento')}
                >
                  Ver Rede
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Chat com Suporte */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5" />
              Chat com Suporte
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-muted p-8 rounded-lg text-center">
              <MessageSquare className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-4">
                Precisa de ajuda? Nossa equipe está pronta para atendê-lo!
              </p>
              <Button className="bg-secondary hover:bg-secondary/90">
                Abrir Chat
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Extrato de Pagamentos */}
        <Card>
          <CardHeader>
            <CardTitle>Extrato de Pagamentos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-medium">Data</th>
                    <th className="text-left py-3 px-4 font-medium">Descrição</th>
                    <th className="text-left py-3 px-4 font-medium">Valor</th>
                    <th className="text-left py-3 px-4 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {historicoTransacoes.map((transacao, index) => (
                    <tr key={index} className="border-b hover:bg-muted/50">
                      <td className="py-3 px-4">{formatDate(transacao.data)}</td>
                      <td className="py-3 px-4">{transacao.descricao}</td>
                      <td className="py-3 px-4 font-medium">
                        {formatCurrency(transacao.valor)}
                      </td>
                      <td className="py-3 px-4">
                        <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                          {transacao.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
