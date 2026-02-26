/**
 * @module FluxosChatPage
 * @description Editor de fluxos automáticos de chatbot.
 *
 * Interface visual para criar e gerenciar fluxos de conversa
 * automatizados. Cada fluxo possui nós (mensagem, condição,
 * ação) conectados por arestas. Suporta ativar/desativar
 * fluxos e visualizar métricas de execução.
 *
 * @route /comunicacao/fluxos-chat
 * @access Protegido — perfis admin, gerente
 */
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { GitBranch, Play, Pause, Plus, Settings, ArrowRight, MessageSquare, Clock, Users } from 'lucide-react';

interface FluxoChat {
  id: string;
  nome: string;
  descricao: string;
  status: 'ativo' | 'pausado' | 'rascunho';
  disparos: number;
  respostas: number;
  conversoes: number;
  ultimaExecucao: string;
  etapas: number;
}

const mockFluxos: FluxoChat[] = [
  { id: 'f1', nome: 'Cobrança Amigável', descricao: 'Fluxo de 3 etapas para cobrança amigável de parcelas em atraso', status: 'ativo', disparos: 245, respostas: 128, conversoes: 45, ultimaExecucao: '2026-02-23T08:00:00', etapas: 3 },
  { id: 'f2', nome: 'Boas-vindas Novo Cliente', descricao: 'Mensagem personalizada por sexo para novos clientes aprovados', status: 'ativo', disparos: 75, respostas: 68, conversoes: 68, ultimaExecucao: '2026-02-22T12:00:00', etapas: 2 },
  { id: 'f3', nome: 'Lembrete de Vencimento', descricao: 'Disparo automático 3 dias antes do vencimento', status: 'ativo', disparos: 312, respostas: 89, conversoes: 210, ultimaExecucao: '2026-02-23T07:00:00', etapas: 2 },
  { id: 'f4', nome: 'Negociação Automática', descricao: 'Fluxo de negociação com ofertas progressivas', status: 'pausado', disparos: 56, respostas: 32, conversoes: 12, ultimaExecucao: '2026-02-18T10:00:00', etapas: 5 },
  { id: 'f5', nome: 'Reativação de Clientes', descricao: 'Contato com clientes inativos há mais de 60 dias', status: 'rascunho', disparos: 0, respostas: 0, conversoes: 0, ultimaExecucao: '-', etapas: 4 },
];

export default function FluxosChatPage() {
  const getStatusBadge = (status: string) => {
    const configs: Record<string, { label: string; className: string }> = {
      ativo: { label: 'Ativo', className: 'bg-green-100 text-green-800' },
      pausado: { label: 'Pausado', className: 'bg-yellow-100 text-yellow-800' },
      rascunho: { label: 'Rascunho', className: 'bg-muted text-muted-foreground' },
    };
    const c = configs[status];
    return <Badge className={c.className}>{c.label}</Badge>;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Fluxos de Chat</h1>
          <p className="text-muted-foreground mt-1">Crie e gerencie fluxos de atendimento automatizados</p>
        </div>
        <Button className="bg-primary hover:bg-primary/90">
          <Plus className="w-4 h-4 mr-2" />Novo Fluxo
        </Button>
      </div>

      {/* Cards métricas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Fluxos Ativos</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-green-600">{mockFluxos.filter(f => f.status === 'ativo').length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Disparos Hoje</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">632</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Taxa de Resposta</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">45.2%</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Conversões</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-secondary">335</div></CardContent>
        </Card>
      </div>

      {/* Lista de Fluxos */}
      <div className="space-y-4">
        {mockFluxos.map(fluxo => (
          <Card key={fluxo.id} className="hover:shadow-md transition-shadow">
            <CardContent className="pt-6">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                    <GitBranch className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="font-semibold text-lg">{fluxo.nome}</h3>
                      {getStatusBadge(fluxo.status)}
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">{fluxo.descricao}</p>
                    <div className="flex items-center gap-6 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" />{fluxo.disparos} disparos</span>
                      <span className="flex items-center gap-1"><Users className="w-3 h-3" />{fluxo.respostas} respostas</span>
                      <span className="flex items-center gap-1"><ArrowRight className="w-3 h-3" />{fluxo.conversoes} conversões</span>
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{fluxo.etapas} etapas</span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  {fluxo.status === 'ativo' ? (
                    <Button size="sm" variant="outline"><Pause className="w-4 h-4 mr-1" />Pausar</Button>
                  ) : fluxo.status === 'pausado' ? (
                    <Button size="sm" className="bg-green-600 hover:bg-green-700"><Play className="w-4 h-4 mr-1" />Ativar</Button>
                  ) : null}
                  <Button size="sm" variant="outline"><Settings className="w-4 h-4" /></Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
