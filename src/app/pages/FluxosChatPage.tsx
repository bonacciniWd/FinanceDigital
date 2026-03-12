/**
 * @module FluxosChatPage
 * @description Editor de fluxos automáticos de chatbot WhatsApp.
 *
 * Interface para criar e gerenciar fluxos de conversa automatizados.
 * Cada fluxo possui etapas (mensagem, condição, ação) configuráveis.
 * Dados reais via Supabase — sem mock.
 *
 * @route /comunicacao/fluxos-chat
 * @access Protegido — perfis admin, gerente
 */
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  GitBranch, Play, Pause, Plus, Settings, ArrowRight, MessageSquare,
  Clock, Users, Trash2, Copy, Loader2, AlertCircle, Zap, Pencil,
} from 'lucide-react';
import {
  useFluxosComEtapas,
  useCriarFluxo,
  useAtualizarFluxo,
  useDeletarFluxo,
  useToggleFluxoStatus,
  useDuplicarFluxo,
  useCriarEtapa,
  useDeletarEtapa,
} from '../hooks/useFluxosChatbot';
import type { FluxoChatbotComEtapas, FluxoChatbotInsert } from '../lib/database.types';

export default function FluxosChatPage() {
  const navigate = useNavigate();
  const [showNewFluxo, setShowNewFluxo] = useState(false);
  const [editingFluxo, setEditingFluxo] = useState<FluxoChatbotComEtapas | null>(null);
  const [showEtapas, setShowEtapas] = useState<FluxoChatbotComEtapas | null>(null);
  const [newEtapaConteudo, setNewEtapaConteudo] = useState('');
  const [newFluxoForm, setNewFluxoForm] = useState<FluxoChatbotInsert>({
    nome: '',
    descricao: '',
    departamento: 'geral',
    gatilho: 'palavra_chave',
    palavra_chave: '',
    status: 'rascunho',
  });

  // ── Hooks ──────────────────────────────────────────────
  const { data: fluxos = [], isLoading } = useFluxosComEtapas();
  const criarFluxo = useCriarFluxo();
  const atualizarFluxo = useAtualizarFluxo();
  const deletarFluxo = useDeletarFluxo();
  const toggleStatus = useToggleFluxoStatus();
  const duplicarFluxo = useDuplicarFluxo();
  const criarEtapa = useCriarEtapa();
  const deletarEtapa = useDeletarEtapa();

  // ── Métricas ───────────────────────────────────────────
  const totalAtivos = fluxos.filter((f) => f.status === 'ativo').length;
  const totalDisparos = fluxos.reduce((acc, f) => acc + (f.disparos || 0), 0);
  const totalRespostas = fluxos.reduce((acc, f) => acc + (f.respostas || 0), 0);
  const totalConversoes = fluxos.reduce((acc, f) => acc + (f.conversoes || 0), 0);
  const taxaResposta = totalDisparos > 0 ? ((totalRespostas / totalDisparos) * 100).toFixed(1) : '0';

  // ── Handlers ───────────────────────────────────────────
  const handleCriar = async () => {
    try {
      await criarFluxo.mutateAsync(newFluxoForm);
      setShowNewFluxo(false);
      setNewFluxoForm({
        nome: '',
        descricao: '',
        departamento: 'geral',
        gatilho: 'palavra_chave',
        palavra_chave: '',
        status: 'rascunho',
      });
    } catch (err) {
      console.error('Erro ao criar fluxo:', err);
    }
  };

  const handleAddEtapa = async () => {
    if (!showEtapas || !newEtapaConteudo.trim()) return;
    try {
      await criarEtapa.mutateAsync({
        fluxo_id: showEtapas.id,
        ordem: (showEtapas.fluxos_chatbot_etapas?.length || 0),
        tipo: 'mensagem',
        conteudo: newEtapaConteudo,
      });
      setNewEtapaConteudo('');
      // Atualizar showEtapas recarregando
      setShowEtapas(null);
    } catch (err) {
      console.error('Erro ao criar etapa:', err);
    }
  };

  const getStatusBadge = (status: string) => {
    const configs: Record<string, { label: string; className: string }> = {
      ativo: { label: 'Ativo', className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
      inativo: { label: 'Inativo', className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' },
      rascunho: { label: 'Rascunho', className: 'bg-muted text-muted-foreground' },
    };
    const c = configs[status] || configs.rascunho;
    return <Badge className={c.className}>{c.label}</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Fluxos de Chat</h1>
          <p className="text-muted-foreground mt-1">Crie e gerencie fluxos de atendimento automatizados</p>
        </div>
        <Dialog open={showNewFluxo} onOpenChange={setShowNewFluxo}>
          <DialogTrigger asChild>
            <Button className="bg-primary hover:bg-primary/90">
              <Plus className="w-4 h-4 mr-2" />Novo Fluxo
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Criar Novo Fluxo</DialogTitle>
              <DialogDescription>Configure o fluxo de chatbot automatizado</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <label className="text-sm font-medium">Nome</label>
                <Input
                  placeholder="ex: Cobrança Amigável"
                  value={newFluxoForm.nome}
                  onChange={(e) => setNewFluxoForm({ ...newFluxoForm, nome: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Descrição</label>
                <Textarea
                  placeholder="Descreva o objetivo do fluxo..."
                  value={newFluxoForm.descricao || ''}
                  onChange={(e) => setNewFluxoForm({ ...newFluxoForm, descricao: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Departamento</label>
                  <Select
                    value={newFluxoForm.departamento}
                    onValueChange={(v) => setNewFluxoForm({ ...newFluxoForm, departamento: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="geral">Geral</SelectItem>
                      <SelectItem value="cobranca">Cobrança</SelectItem>
                      <SelectItem value="comercial">Comercial</SelectItem>
                      <SelectItem value="atendimento">Atendimento</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">Gatilho</label>
                  <Select
                    value={newFluxoForm.gatilho}
                    onValueChange={(v) => setNewFluxoForm({ ...newFluxoForm, gatilho: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="palavra_chave">Palavra-chave</SelectItem>
                      <SelectItem value="agendado">Agendado (cron)</SelectItem>
                      <SelectItem value="evento">Evento do sistema</SelectItem>
                      <SelectItem value="manual">Manual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {newFluxoForm.gatilho === 'palavra_chave' && (
                <div>
                  <label className="text-sm font-medium">Palavras-chave (separadas por vírgula)</label>
                  <Input
                    placeholder="oi, olá, bom dia, ajuda"
                    value={newFluxoForm.palavra_chave || ''}
                    onChange={(e) => setNewFluxoForm({ ...newFluxoForm, palavra_chave: e.target.value })}
                  />
                </div>
              )}
              {newFluxoForm.gatilho === 'agendado' && (
                <div>
                  <label className="text-sm font-medium">Expressão Cron</label>
                  <Input
                    placeholder="0 9 * * 1-5"
                    value={newFluxoForm.cron_expression || ''}
                    onChange={(e) => setNewFluxoForm({ ...newFluxoForm, cron_expression: e.target.value })}
                  />
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowNewFluxo(false)}>Cancelar</Button>
              <Button onClick={handleCriar} disabled={criarFluxo.isPending || !newFluxoForm.nome}>
                {criarFluxo.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Criar Fluxo
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Cards métricas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Fluxos Ativos</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-green-600">{totalAtivos}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total Disparos</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{totalDisparos}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Taxa de Resposta</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{taxaResposta}%</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Conversões</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-secondary">{totalConversoes}</div></CardContent>
        </Card>
      </div>

      {/* Etapas Dialog */}
      {showEtapas && (
        <Dialog open={!!showEtapas} onOpenChange={() => setShowEtapas(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Etapas: {showEtapas.nome}</DialogTitle>
              <DialogDescription>Gerencie as etapas do fluxo</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-4 max-h-[400px] overflow-y-auto">
              {(showEtapas.fluxos_chatbot_etapas || [])
                .sort((a, b) => a.ordem - b.ordem)
                .map((etapa, idx) => (
                  <div key={etapa.id} className="flex items-start gap-3 p-3 border rounded-lg">
                    <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center shrink-0">
                      <span className="text-sm font-bold text-primary">{idx + 1}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <Badge variant="secondary" className="text-[10px] mb-1">{etapa.tipo}</Badge>
                      <p className="text-sm">{etapa.conteudo}</p>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="shrink-0 text-destructive"
                      onClick={() => deletarEtapa.mutate({ id: etapa.id, fluxoId: showEtapas.id })}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              {(showEtapas.fluxos_chatbot_etapas || []).length === 0 && (
                <div className="text-center text-muted-foreground py-6 text-sm">
                  Nenhuma etapa configurada. Adicione a primeira!
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Textarea
                placeholder="Conteúdo da nova etapa..."
                value={newEtapaConteudo}
                onChange={(e) => setNewEtapaConteudo(e.target.value)}
                className="flex-1"
                rows={2}
              />
              <Button
                onClick={handleAddEtapa}
                disabled={criarEtapa.isPending || !newEtapaConteudo.trim()}
                className="self-end"
              >
                {criarEtapa.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Lista de Fluxos */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : fluxos.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Zap className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="font-semibold text-lg mb-2">Nenhum fluxo criado</h3>
            <p className="text-muted-foreground mb-4">Crie fluxos automáticos para responder clientes no WhatsApp</p>
            <Button onClick={() => setShowNewFluxo(true)}>
              <Plus className="w-4 h-4 mr-2" />Criar Primeiro Fluxo
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {fluxos.map((fluxo) => (
            <Card key={fluxo.id} className="hover:shadow-md transition-shadow">
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center shrink-0">
                      <GitBranch className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="font-semibold text-lg">{fluxo.nome}</h3>
                        {getStatusBadge(fluxo.status)}
                        <Badge variant="outline" className="text-xs">{fluxo.departamento}</Badge>
                      </div>
                      {fluxo.descricao && (
                        <p className="text-sm text-muted-foreground mb-3">{fluxo.descricao}</p>
                      )}
                      <div className="flex items-center gap-6 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <MessageSquare className="w-3 h-3" />{fluxo.disparos || 0} disparos
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" />{fluxo.respostas || 0} respostas
                        </span>
                        <span className="flex items-center gap-1">
                          <ArrowRight className="w-3 h-3" />{fluxo.conversoes || 0} conversões
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />{fluxo.fluxos_chatbot_etapas?.length || 0} etapas
                        </span>
                        {fluxo.palavra_chave && (
                          <span className="flex items-center gap-1">
                            <Zap className="w-3 h-3" />"{fluxo.palavra_chave}"
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {fluxo.status === 'ativo' ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => toggleStatus.mutate({ id: fluxo.id, statusAtual: fluxo.status })}
                        disabled={toggleStatus.isPending}
                      >
                        <Pause className="w-4 h-4 mr-1" />Pausar
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        className="bg-green-600 hover:bg-green-700"
                        onClick={() => toggleStatus.mutate({ id: fluxo.id, statusAtual: fluxo.status })}
                        disabled={toggleStatus.isPending}
                      >
                        <Play className="w-4 h-4 mr-1" />Ativar
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setShowEtapas(fluxo)}
                    >
                      <Settings className="w-4 h-4 mr-1" />Etapas
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-primary text-primary hover:bg-primary/10"
                      onClick={() => navigate(`/chat/fluxos/${fluxo.id}/editor`)}
                    >
                      <Pencil className="w-4 h-4 mr-1" />Editor Visual
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => duplicarFluxo.mutate(fluxo.id)}
                      disabled={duplicarFluxo.isPending}
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => {
                        if (confirm(`Deletar fluxo "${fluxo.nome}"?`)) {
                          deletarFluxo.mutate(fluxo.id);
                        }
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
