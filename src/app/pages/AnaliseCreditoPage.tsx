/**
 * @module AnaliseCreditoPage
 * @description Análise de crédito e score dos clientes.
 *
 * Lista solicitações de crédito pendentes com score interno,
 * histórico financeiro e parecer do analista. Permite aprovar,
 * reprovar ou solicitar documentação adicional.
 *
 * @route /clientes/analise-credito
 * @access Protegido — perfis admin, gerente, analista
 * @see mockClientes
 */
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Search, CheckCircle, XCircle, Clock, AlertTriangle, FileText } from 'lucide-react';


interface AnaliseCredito {
  id: string;
  clienteNome: string;
  cpf: string;
  valorSolicitado: number;
  rendaMensal: number;
  scoreSerasa: number;
  scoreInterno: number;
  status: 'pendente' | 'aprovado' | 'recusado' | 'em_analise';
  dataSolicitacao: string;
  motivo?: string;
}

const mockAnalises: AnaliseCredito[] = [
  { id: 'a1', clienteNome: 'Marcos Ribeiro', cpf: '111.222.333-44', valorSolicitado: 15000, rendaMensal: 5500, scoreSerasa: 720, scoreInterno: 0, status: 'pendente', dataSolicitacao: '2026-02-23' },
  { id: 'a2', clienteNome: 'Julia Ferreira', cpf: '222.333.444-55', valorSolicitado: 8000, rendaMensal: 3200, scoreSerasa: 680, scoreInterno: 0, status: 'em_analise', dataSolicitacao: '2026-02-22' },
  { id: 'a3', clienteNome: 'Rafael Costa', cpf: '333.444.555-66', valorSolicitado: 25000, rendaMensal: 8500, scoreSerasa: 800, scoreInterno: 0, status: 'aprovado', dataSolicitacao: '2026-02-21' },
  { id: 'a4', clienteNome: 'Camila Duarte', cpf: '444.555.666-77', valorSolicitado: 12000, rendaMensal: 2800, scoreSerasa: 420, scoreInterno: 0, status: 'recusado', dataSolicitacao: '2026-02-20', motivo: 'Score abaixo do mínimo + comprometimento de renda > 40%' },
  { id: 'a5', clienteNome: 'Daniel Almeida', cpf: '555.666.777-88', valorSolicitado: 6000, rendaMensal: 4200, scoreSerasa: 650, scoreInterno: 0, status: 'pendente', dataSolicitacao: '2026-02-23' },
];

export default function AnaliseCreditoPage() {
  const [selectedAnalise, setSelectedAnalise] = useState<AnaliseCredito | null>(null);
  const [filtroStatus, setFiltroStatus] = useState('todos');

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const getStatusBadge = (status: string) => {
    const configs: Record<string, { label: string; className: string }> = {
      pendente: { label: 'Pendente', className: 'bg-yellow-100 text-yellow-800' },
      em_analise: { label: 'Em Análise', className: 'bg-blue-100 text-blue-800' },
      aprovado: { label: 'Aprovado', className: 'bg-green-100 text-green-800' },
      recusado: { label: 'Recusado', className: 'bg-red-100 text-red-800' },
    };
    const c = configs[status];
    return <Badge className={c.className}>{c.label}</Badge>;
  };

  const filtered = mockAnalises.filter(a => filtroStatus === 'todos' || a.status === filtroStatus);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Análise de Crédito</h1>
          <p className="text-muted-foreground mt-1">{filtered.length} solicitação(ões) encontrada(s)</p>
        </div>
        <Button className="bg-primary hover:bg-primary/90">Nova Análise</Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
            <Select value={filtroStatus} onValueChange={setFiltroStatus}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="em_analise">Em Análise</SelectItem>
                <SelectItem value="aprovado">Aprovado</SelectItem>
                <SelectItem value="recusado">Recusado</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex-1 min-w-64">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Buscar por nome ou CPF..." className="pl-10" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cards Métricas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-6 text-center"><Clock className="w-8 h-8 mx-auto text-yellow-500 mb-2" /><div className="text-2xl font-bold">2</div><p className="text-sm text-muted-foreground">Pendentes</p></CardContent></Card>
        <Card><CardContent className="pt-6 text-center"><AlertTriangle className="w-8 h-8 mx-auto text-blue-500 mb-2" /><div className="text-2xl font-bold">1</div><p className="text-sm text-muted-foreground">Em Análise</p></CardContent></Card>
        <Card><CardContent className="pt-6 text-center"><CheckCircle className="w-8 h-8 mx-auto text-green-500 mb-2" /><div className="text-2xl font-bold">1</div><p className="text-sm text-muted-foreground">Aprovados</p></CardContent></Card>
        <Card><CardContent className="pt-6 text-center"><XCircle className="w-8 h-8 mx-auto text-red-500 mb-2" /><div className="text-2xl font-bold">1</div><p className="text-sm text-muted-foreground">Recusados</p></CardContent></Card>
      </div>

      {/* Tabela */}
      <Card>
        <CardContent className="pt-6">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 font-medium text-muted-foreground">Cliente</th>
                  <th className="text-left py-3 font-medium text-muted-foreground">CPF</th>
                  <th className="text-right py-3 font-medium text-muted-foreground">Valor Solicitado</th>
                  <th className="text-right py-3 font-medium text-muted-foreground">Renda</th>
                  <th className="text-center py-3 font-medium text-muted-foreground">Score Serasa</th>
                  <th className="text-center py-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-center py-3 font-medium text-muted-foreground">Data</th>
                  <th className="text-center py-3 font-medium text-muted-foreground">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => (
                  <tr key={a.id} className="border-b hover:bg-muted/50">
                    <td className="py-3 font-medium">{a.clienteNome}</td>
                    <td className="py-3 text-muted-foreground">{a.cpf}</td>
                    <td className="py-3 text-right font-medium">{formatCurrency(a.valorSolicitado)}</td>
                    <td className="py-3 text-right">{formatCurrency(a.rendaMensal)}</td>
                    <td className="py-3 text-center">
                      <span className={`font-bold ${a.scoreSerasa >= 700 ? 'text-green-600' : a.scoreSerasa >= 500 ? 'text-yellow-600' : 'text-red-600'}`}>
                        {a.scoreSerasa}
                      </span>
                    </td>
                    <td className="py-3 text-center">{getStatusBadge(a.status)}</td>
                    <td className="py-3 text-center text-muted-foreground">{new Date(a.dataSolicitacao).toLocaleDateString('pt-BR')}</td>
                    <td className="py-3 text-center">
                      <Button size="sm" variant="outline" onClick={() => setSelectedAnalise(a)}>
                        <FileText className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Modal Detalhes */}
      <Dialog open={!!selectedAnalise} onOpenChange={() => setSelectedAnalise(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Análise - {selectedAnalise?.clienteNome}</DialogTitle>
          </DialogHeader>
          {selectedAnalise && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><span className="text-sm text-muted-foreground">CPF</span><p className="font-medium">{selectedAnalise.cpf}</p></div>
                <div><span className="text-sm text-muted-foreground">Renda</span><p className="font-medium">{formatCurrency(selectedAnalise.rendaMensal)}</p></div>
                <div><span className="text-sm text-muted-foreground">Valor Solicitado</span><p className="font-medium">{formatCurrency(selectedAnalise.valorSolicitado)}</p></div>
                <div><span className="text-sm text-muted-foreground">Comprometimento</span><p className="font-medium">{((selectedAnalise.valorSolicitado / 12) / selectedAnalise.rendaMensal * 100).toFixed(1)}%</p></div>
                <div><span className="text-sm text-muted-foreground">Score Serasa</span><p className="font-bold text-lg">{selectedAnalise.scoreSerasa}</p></div>
                <div><span className="text-sm text-muted-foreground">Status</span><div className="mt-1">{getStatusBadge(selectedAnalise.status)}</div></div>
              </div>
              {selectedAnalise.motivo && (
                <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                  <p className="text-sm text-red-800"><strong>Motivo da Recusa:</strong> {selectedAnalise.motivo}</p>
                </div>
              )}
              {selectedAnalise.status === 'pendente' && (
                <div className="flex gap-3">
                  <Button className="flex-1 bg-green-600 hover:bg-green-700">Aprovar</Button>
                  <Button className="flex-1" variant="destructive">Recusar</Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
