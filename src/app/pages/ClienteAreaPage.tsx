/**
 * @module ClienteAreaPage
 * @description Área de autoatendimento / portal do cliente.
 *
 * Mostra dados reais do cliente selecionado: empréstimos ativos,
 * parcelas (extrato), indicados e bônus. Dados via Supabase hooks.
 * Como o sistema não possui login de cliente, um seletor permite
 * ao admin/operador visualizar a área de qualquer cliente.
 *
 * @route /cliente
 * @access Protegido — admin, gerência
 */
import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Share2, MessageSquare, FileText, User, Loader2, Copy, Check } from 'lucide-react';
import { useClientes } from '../hooks/useClientes';
import { useEmprestimosByCliente } from '../hooks/useEmprestimos';
import { useParcelasByCliente } from '../hooks/useParcelas';
import { useIndicados } from '../hooks/useClientes';
import { toast } from 'sonner';

export default function ClienteAreaPage() {
  const { data: clientes = [], isLoading: loadingClientes } = useClientes();
  const [selectedClienteId, setSelectedClienteId] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const navigate = useNavigate();

  // Auto-select first client when data loads
  const clienteId = selectedClienteId || clientes[0]?.id || '';
  const cliente = useMemo(() => clientes.find((c) => c.id === clienteId), [clientes, clienteId]);

  const { data: emprestimos = [] } = useEmprestimosByCliente(clienteId || undefined);
  const { data: parcelas = [] } = useParcelasByCliente(clienteId || undefined);
  const { data: indicados = [] } = useIndicados(clienteId || undefined);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('pt-BR');

  const statusBadge = (status: string) => {
    const map: Record<string, { label: string; className: string }> = {
      em_dia: { label: '✅ Em dia', className: 'bg-green-100 text-green-800' },
      a_vencer: { label: '⏳ A vencer', className: 'bg-yellow-100 text-yellow-800' },
      vencido: { label: '🔴 Vencido', className: 'bg-red-100 text-red-800' },
      paga: { label: 'Pago', className: 'bg-green-100 text-green-800' },
      pendente: { label: 'Pendente', className: 'bg-yellow-100 text-yellow-800' },
      vencida: { label: 'Vencida', className: 'bg-red-100 text-red-800' },
      cancelada: { label: 'Cancelada', className: 'bg-gray-100 text-gray-800' },
    };
    const s = map[status] || { label: status, className: '' };
    return <Badge className={`${s.className} hover:${s.className}`}>{s.label}</Badge>;
  };

  const totalEmprestado = emprestimos.reduce((sum, e) => sum + e.valor, 0);
  const emprestimosAtivos = emprestimos.filter((e) => e.status === 'ativo');
  const proximaParcela = parcelas
    .filter((p) => p.status === 'pendente')
    .sort((a, b) => a.dataVencimento.localeCompare(b.dataVencimento))[0];

  const handleCopyLink = () => {
    if (!cliente) return;
    navigator.clipboard.writeText(`https://fintechflow.com/indicacao/${cliente.id}`);
    setCopied(true);
    toast.success('Link copiado!');
    setTimeout(() => setCopied(false), 2000);
  };

  if (loadingClientes) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <span className="ml-3 text-muted-foreground">Carregando...</span>
      </div>
    );
  }

  if (!cliente) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Nenhum cliente encontrado.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted">
      {/* Header */}
      <header className="bg-primary text-primary-foreground p-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-secondary rounded flex items-center justify-center font-bold text-lg">
              F
            </div>
            <span className="font-semibold text-lg">FinanceDigital</span>
          </div>
          <div className="flex items-center gap-4">
            <Select value={clienteId} onValueChange={setSelectedClienteId}>
              <SelectTrigger className="w-64 bg-primary-foreground/10 border-primary-foreground/20 text-primary-foreground">
                <SelectValue placeholder="Selecionar cliente" />
              </SelectTrigger>
              <SelectContent>
                {clientes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
                Dados do Cliente
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
              {cliente.cpf && (
                <div>
                  <div className="text-sm text-muted-foreground">CPF</div>
                  <div className="font-medium">{cliente.cpf}</div>
                </div>
              )}
              <div>
                <div className="text-sm text-muted-foreground">Status</div>
                <div className="mt-1">{statusBadge(cliente.status)}</div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Empréstimos
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {emprestimos.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">Nenhum empréstimo registrado.</p>
              ) : (
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Total emprestado:</span>
                    <span className="font-semibold text-lg">{formatCurrency(totalEmprestado)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Ativos:</span>
                    <span className="font-medium">{emprestimosAtivos.length}</span>
                  </div>
                  {proximaParcela && (
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Próx. vencimento:</span>
                      <span className="font-medium">{formatDate(proximaParcela.dataVencimento)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Situação:</span>
                    {statusBadge(cliente.status)}
                  </div>

                  {/* Lista resumida */}
                  <div className="space-y-2 pt-2 border-t">
                    {emprestimos.map((e) => (
                      <div key={e.id} className="flex justify-between items-center text-sm">
                        <span className="text-muted-foreground">
                          {formatCurrency(e.valor)} — {e.parcelasPagas}/{e.parcelas} pagas
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {e.status === 'ativo' ? '🟢 Ativo' : e.status === 'quitado' ? '✅ Quitado' : '🔴 Inadimplente'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Indicar Amigos */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Share2 className="w-5 h-5" />
              Indicações
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-secondary/10 border-2 border-secondary rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="font-semibold">Link de indicação</div>
                  <div className="text-sm text-muted-foreground">
                    Compartilhe para indicar novos clientes
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={`https://fintechflow.com/indicacao/${cliente.id}`}
                  readOnly
                  className="flex-1 px-3 py-2 border rounded-md bg-card text-sm"
                />
                <Button className="bg-secondary hover:bg-secondary/90" onClick={handleCopyLink}>
                  {copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
                  {copied ? 'Copiado!' : 'Copiar'}
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="bg-muted p-4 rounded-lg text-center">
                <div className="text-2xl font-bold text-secondary">
                  {indicados.length}
                </div>
                <div className="text-sm text-muted-foreground">Indicados</div>
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
                  onClick={() => navigate('/indicacoes')}
                >
                  Ver Rede
                </Button>
              </div>
            </div>

            {/* Lista de indicados */}
            {indicados.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-foreground">Indicados:</h4>
                {indicados.map((ind) => (
                  <div key={ind.id} className="flex items-center justify-between p-2 bg-card rounded border text-sm">
                    <span className="font-medium">{ind.nome}</span>
                    {statusBadge(ind.status)}
                  </div>
                ))}
              </div>
            )}
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
                Abrir conversa com este cliente no chat de atendimento.
              </p>
              <Button
                className="bg-secondary hover:bg-secondary/90"
                onClick={() => navigate(`/chat?phone=${encodeURIComponent(cliente.telefone)}`)}
              >
                Abrir Chat
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Extrato de Parcelas */}
        <Card>
          <CardHeader>
            <CardTitle>Extrato de Parcelas</CardTitle>
          </CardHeader>
          <CardContent>
            {parcelas.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Nenhuma parcela registrada.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-4 font-medium">Nº</th>
                      <th className="text-left py-3 px-4 font-medium">Vencimento</th>
                      <th className="text-left py-3 px-4 font-medium">Valor</th>
                      <th className="text-left py-3 px-4 font-medium">Pagamento</th>
                      <th className="text-left py-3 px-4 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parcelas.map((p) => (
                      <tr key={p.id} className="border-b hover:bg-muted/50">
                        <td className="py-3 px-4">#{p.numero}</td>
                        <td className="py-3 px-4">{formatDate(p.dataVencimento)}</td>
                        <td className="py-3 px-4 font-medium">{formatCurrency(p.valor)}</td>
                        <td className="py-3 px-4">
                          {p.dataPagamento ? formatDate(p.dataPagamento) : '—'}
                        </td>
                        <td className="py-3 px-4">{statusBadge(p.status)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
