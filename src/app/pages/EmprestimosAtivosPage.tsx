/**
 * @module EmprestimosAtivosPage
 * @description Listagem de empréstimos ativos com detalhamento.
 *
 * Tabela com todos os empréstimos em andamento: valor, parcelas
 * pagas/totais, taxa de juros, status e próximo vencimento.
 * Filtros por status (em dia, atrasado) e busca por cliente.
 *
 * @route /clientes/emprestimos-ativos
 * @access Protegido — todos os perfis autenticados
 * @see mockEmprestimos, mockClientes
 */
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Progress } from '../components/ui/progress';
import { Search, Eye, DollarSign, TrendingUp, AlertTriangle, CheckCircle } from 'lucide-react';
import { useEmprestimos } from '../hooks/useEmprestimos';

export default function EmprestimosAtivosPage() {
  const [selectedEmprestimo, setSelectedEmprestimo] = useState<any>(null);
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [searchTerm, setSearchTerm] = useState('');

  const { data: emprestimos = [], isLoading } = useEmprestimos();

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const filtered = emprestimos.filter(e => {
    const matchStatus = filtroStatus === 'todos' || e.status === filtroStatus;
    const matchSearch = !searchTerm || e.clienteNome?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchStatus && matchSearch;
  });

  const totalCarteira = emprestimos.reduce((acc, e) => acc + e.valor, 0);
  const totalAtivos = emprestimos.filter(e => e.status === 'ativo').length;
  const totalInadimplentes = emprestimos.filter(e => e.status === 'inadimplente').length;

  const getStatusBadge = (status: string) => {
    const configs: Record<string, { label: string; className: string }> = {
      ativo: { label: 'Ativo', className: 'bg-green-100 text-green-800' },
      quitado: { label: 'Quitado', className: 'bg-blue-100 text-blue-800' },
      inadimplente: { label: 'Inadimplente', className: 'bg-red-100 text-red-800' },
    };
    const c = configs[status];
    return <Badge className={c.className}>{c.label}</Badge>;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Empréstimos Ativos</h1>
          <p className="text-muted-foreground mt-1">Gerencie todos os empréstimos da carteira</p>
        </div>
        <Button className="bg-primary hover:bg-primary/90">Novo Empréstimo</Button>
      </div>

      {/* Cards Métricas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Carteira Total</CardTitle>
            <DollarSign className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{formatCurrency(totalCarteira)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Ativos</CardTitle>
            <CheckCircle className="w-4 h-4 text-green-500" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-green-600">{totalAtivos}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Inadimplentes</CardTitle>
            <AlertTriangle className="w-4 h-4 text-red-500" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-red-600">{totalInadimplentes}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Taxa Média</CardTitle>
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">2.8% a.m.</div></CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
            <Select value={filtroStatus} onValueChange={setFiltroStatus}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="ativo">Ativo</SelectItem>
                <SelectItem value="inadimplente">Inadimplente</SelectItem>
                <SelectItem value="quitado">Quitado</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex-1 min-w-64 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Buscar cliente..." className="pl-10" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabela */}
      <Card>
        <CardContent className="pt-6">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 font-medium text-muted-foreground">Cliente</th>
                  <th className="text-right py-3 font-medium text-muted-foreground">Valor</th>
                  <th className="text-center py-3 font-medium text-muted-foreground">Parcelas</th>
                  <th className="text-center py-3 font-medium text-muted-foreground">Progresso</th>
                  <th className="text-right py-3 font-medium text-muted-foreground">Valor Parcela</th>
                  <th className="text-center py-3 font-medium text-muted-foreground">Taxa</th>
                  <th className="text-center py-3 font-medium text-muted-foreground">Próx. Venc.</th>
                  <th className="text-center py-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-center py-3 font-medium text-muted-foreground">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => (
                  <tr key={e.id} className="border-b hover:bg-muted/50">
                    <td className="py-3 font-medium">{e.clienteNome}</td>
                    <td className="py-3 text-right">{formatCurrency(e.valor)}</td>
                    <td className="py-3 text-center">{e.parcelasPagas}/{e.parcelas}</td>
                    <td className="py-3 w-32">
                      <Progress value={(e.parcelasPagas / e.parcelas) * 100} className="h-2" />
                    </td>
                    <td className="py-3 text-right">{formatCurrency(e.valorParcela)}</td>
                    <td className="py-3 text-center">{e.taxaJuros}%</td>
                    <td className="py-3 text-center text-muted-foreground">{new Date(e.proximoVencimento).toLocaleDateString('pt-BR')}</td>
                    <td className="py-3 text-center">{getStatusBadge(e.status)}</td>
                    <td className="py-3 text-center">
                      <Button size="sm" variant="outline" onClick={() => setSelectedEmprestimo(e)}>
                        <Eye className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Modal */}
      <Dialog open={!!selectedEmprestimo} onOpenChange={() => setSelectedEmprestimo(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Empréstimo - {selectedEmprestimo?.clienteNome}</DialogTitle></DialogHeader>
          {selectedEmprestimo && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><span className="text-sm text-muted-foreground">Valor do Empréstimo</span><p className="font-bold text-lg">{formatCurrency(selectedEmprestimo.valor)}</p></div>
                <div><span className="text-sm text-muted-foreground">Parcelas</span><p className="font-bold text-lg">{selectedEmprestimo.parcelasPagas}/{selectedEmprestimo.parcelas}</p></div>
                <div><span className="text-sm text-muted-foreground">Valor da Parcela</span><p className="font-medium">{formatCurrency(selectedEmprestimo.valorParcela)}</p></div>
                <div><span className="text-sm text-muted-foreground">Taxa de Juros</span><p className="font-medium">{selectedEmprestimo.taxaJuros}% a.m.</p></div>
                <div><span className="text-sm text-muted-foreground">Data do Contrato</span><p className="font-medium">{new Date(selectedEmprestimo.dataContrato).toLocaleDateString('pt-BR')}</p></div>
                <div><span className="text-sm text-muted-foreground">Status</span><div className="mt-1">{getStatusBadge(selectedEmprestimo.status)}</div></div>
              </div>
              <Progress value={(selectedEmprestimo.parcelasPagas / selectedEmprestimo.parcelas) * 100} className="h-3" />
              <div className="flex gap-3">
                <Button className="flex-1 bg-secondary hover:bg-secondary/90">Ver Parcelas</Button>
                <Button className="flex-1" variant="outline">Histórico</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
