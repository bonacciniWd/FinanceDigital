/**
 * @module KanbanAnalisePage
 * @description Kanban de análise de crédito.
 *
 * Board com colunas: Nova Solicitação, Em Análise, Aguardando
 * Documentos, Aprovado, Reprovado. Cards mostram solicitante,
 * valor e score. Ícones de status e tempo em cada etapa.
 *
 * @route /kanban/analise
 * @access Protegido — perfis admin, gerente, analista
 */
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Search, Clock, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { Input } from '../components/ui/input';

const columns = [
  { id: 'nova', title: 'NOVA SOLICITAÇÃO', color: 'bg-blue-100 text-slate-900 border-blue-300', items: [
    { id: 1, nome: 'Marcos Ribeiro', valor: 15000, data: '23/02', score: 720 },
    { id: 2, nome: 'Daniel Almeida', valor: 6000, data: '23/02', score: 650 },
  ]},
  { id: 'documentacao', title: 'DOCUMENTAÇÃO', color: 'bg-yellow-100 text-slate-900 border-yellow-300', items: [
    { id: 3, nome: 'Julia Ferreira', valor: 8000, data: '22/02', score: 680 },
  ]},
  { id: 'analise', title: 'EM ANÁLISE', color: 'bg-purple-100 text-slate-900 border-purple-300', items: [
    { id: 4, nome: 'Lucia Martins', valor: 20000, data: '21/02', score: 740 },
    { id: 5, nome: 'Thiago Rocha', valor: 10000, data: '20/02', score: 590 },
  ]},
  { id: 'aprovado', title: 'APROVADO', color: 'bg-green-100 text-slate-900 border-green-300', items: [
    { id: 6, nome: 'Rafael Costa', valor: 25000, data: '21/02', score: 800 },
  ]},
  { id: 'recusado', title: 'RECUSADO', color: 'bg-red-100 text-slate-900 border-red-300', items: [
    { id: 7, nome: 'Camila Duarte', valor: 12000, data: '20/02', score: 420 },
  ]},
];

export default function KanbanAnalisePage() {
  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Kanban - Análise de Crédito</h1>
          <p className="text-muted-foreground mt-1">Acompanhe o fluxo de análise de crédito</p>
        </div>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar..." className="pl-10" />
        </div>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {columns.map(col => (
          <div key={col.id} className="flex-shrink-0 w-72">
            <Card className={`${col.color} border-2`}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold">{col.title}</CardTitle>
                  <Badge variant="secondary" className="font-semibold">{col.items.length}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {col.items.map(item => (
                  <Card key={item.id} className="bg-card hover:shadow-md transition-shadow cursor-grab active:cursor-grabbing">
                    <CardContent className="p-4 space-y-2">
                      <div className="font-semibold text-sm">{item.nome}</div>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{formatCurrency(item.valor)}</span>
                        <span>{item.data}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className={`text-xs font-bold ${item.score >= 700 ? 'text-green-600' : item.score >= 500 ? 'text-yellow-600' : 'text-red-600'}`}>
                          Score: {item.score}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </CardContent>
            </Card>
          </div>
        ))}
      </div>
    </div>
  );
}
