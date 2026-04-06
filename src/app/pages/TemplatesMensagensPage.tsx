
/**
 * @module TemplatesMensagensPage
 * @description Gestão de templates de mensagens com suporte a gênero.
 *
 * CRUD real de templates para WhatsApp e e-mail via Supabase.
 * Cada template possui versão masculina (`mensagemMasculino`) e feminina
 * (`mensagemFeminino`) com variáveis dinâmicas ({nome}, {valor}, {vencimento}).
 * Pré-visualização em tempo real e categorização por tipo.
 *
 * @route /comunicacao/templates
 * @access Protegido — perfis admin, gerente
 */
import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Switch } from '../components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Plus, Edit, Eye, Copy, MessageSquare, Loader2 } from 'lucide-react';
import { useTemplates, useCreateTemplate, useUpdateTemplate, useToggleTemplateAtivo } from '../hooks/useTemplates';
import type { TemplateWhatsApp } from '../lib/view-types';
import type { TemplateCategoria } from '../lib/database.types';

type FormData = {
  nome: string;
  categoria: TemplateCategoria | '';
  mensagemMasculino: string;
  mensagemFeminino: string;
  tipoNotificacao: string;
};

const EMPTY_FORM: FormData = { nome: '', categoria: '', mensagemMasculino: '', mensagemFeminino: '', tipoNotificacao: '' };

const TIPOS_NOTIFICACAO: Record<string, string> = {
  '': 'Nenhum (manual)',
  lembrete_3dias: 'Lembrete — 3 dias antes',
  lembrete_vespera: 'Lembrete — véspera do vencimento',
  vencida_ontem: 'Cobrança — vencida ontem',
  vencida_3dias: 'Cobrança — 3 dias de atraso',
  vencida_7dias: 'Cobrança — 7 dias de atraso',
  vencida_15dias: 'Cobrança — 15 dias de atraso',
  vencida_30dias: 'Cobrança — 30 dias de atraso',
  aprovacao: 'Aprovação de crédito',
};

/** Extrai variáveis do tipo {xxx} das mensagens */
function extractVariables(msgM: string, msgF: string): string[] {
  const regex = /\{(\w+)\}/g;
  const vars = new Set<string>();
  let m: RegExpExecArray | null;
  for (const msg of [msgM, msgF]) {
    while ((m = regex.exec(msg)) !== null) vars.add(m[1]);
  }
  return Array.from(vars);
}

export default function TemplatesMensagensPage() {
  const { data: templates = [] } = useTemplates();
  const createTemplate = useCreateTemplate();
  const updateTemplate = useUpdateTemplate();
  const toggleAtivo = useToggleTemplateAtivo();

  const [selectedTemplate, setSelectedTemplate] = useState<TemplateWhatsApp | null>(null);
  const [previewSexo, setPreviewSexo] = useState<'masculino' | 'feminino'>('masculino');

  // Modal create/edit
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);

  const isSaving = createTemplate.isPending || updateTemplate.isPending;

  const openCreateModal = useCallback(() => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  }, []);

  const openEditModal = useCallback((t: TemplateWhatsApp) => {
    setEditingId(t.id);
    setForm({
      nome: t.nome,
      categoria: t.categoria,
      mensagemMasculino: t.mensagemMasculino,
      mensagemFeminino: t.mensagemFeminino,
      tipoNotificacao: t.tipoNotificacao ?? '',
    });
    setModalOpen(true);
  }, []);

  const handleCopy = useCallback((t: TemplateWhatsApp) => {
    const variaveis = extractVariables(t.mensagemMasculino, t.mensagemFeminino);
    createTemplate.mutate({
      nome: `${t.nome} (cópia)`,
      categoria: t.categoria,
      mensagem_masculino: t.mensagemMasculino,
      mensagem_feminino: t.mensagemFeminino,
      variaveis,
      ativo: false,
    });
  }, [createTemplate]);

  const handleSave = useCallback(() => {
    if (!form.nome || !form.categoria || !form.mensagemMasculino || !form.mensagemFeminino) return;
    const variaveis = extractVariables(form.mensagemMasculino, form.mensagemFeminino);
    const tipoNotif = form.tipoNotificacao || null;

    if (editingId) {
      updateTemplate.mutate(
        {
          id: editingId,
          data: {
            nome: form.nome,
            categoria: form.categoria as TemplateCategoria,
            mensagem_masculino: form.mensagemMasculino,
            mensagem_feminino: form.mensagemFeminino,
            variaveis,
            tipo_notificacao: tipoNotif,
          },
        },
        { onSuccess: () => { setModalOpen(false); setEditingId(null); setForm(EMPTY_FORM); } },
      );
    } else {
      createTemplate.mutate(
        {
          nome: form.nome,
          categoria: form.categoria as TemplateCategoria,
          mensagem_masculino: form.mensagemMasculino,
          mensagem_feminino: form.mensagemFeminino,
          variaveis,
          tipo_notificacao: tipoNotif,
        },
        { onSuccess: () => { setModalOpen(false); setForm(EMPTY_FORM); } },
      );
    }
  }, [form, editingId, createTemplate, updateTemplate]);

  const handleToggleAtivo = useCallback((t: TemplateWhatsApp) => {
    toggleAtivo.mutate({ id: t.id, ativo: !t.ativo });
  }, [toggleAtivo]);

  const getCategoryBadge = (cat: string) => {
    const configs: Record<string, { label: string; className: string }> = {
      cobranca: { label: 'Cobrança', className: 'bg-red-100 text-red-800' },
      boas_vindas: { label: 'Boas-vindas', className: 'bg-green-100 text-green-800' },
      lembrete: { label: 'Lembrete', className: 'bg-yellow-100 text-yellow-800' },
      negociacao: { label: 'Negociação', className: 'bg-purple-100 text-purple-800' },
    };
    const c = configs[cat];
    if (!c) return <Badge variant="outline">{cat}</Badge>;
    return <Badge className={c.className}>{c.label}</Badge>;
  };

  const previewMessage = (template: TemplateWhatsApp, sexo: 'masculino' | 'feminino') => {
    let msg = sexo === 'masculino' ? template.mensagemMasculino : template.mensagemFeminino;
    msg = msg
      .replace(/\{nome\}/g, 'João Silva')
      .replace(/\{valor\}/g, 'R$ 500,00')
      .replace(/\{data\}/g, '15/03/2026')
      .replace(/\{numeroParcela\}/g, '3')
      .replace(/\{totalParcelas\}/g, '12')
      .replace(/\{diasAtraso\}/g, '7')
      .replace(/\{parcelasPagas\}/g, '4')
      .replace(/\{desconto\}/g, '20');
    return msg;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Templates de Mensagens</h1>
          <p className="text-muted-foreground mt-1">Mensagens personalizadas por sexo para WhatsApp e Chat</p>
        </div>
        <Button className="bg-primary hover:bg-primary/90" onClick={openCreateModal}>
          <Plus className="w-4 h-4 mr-2" />Novo Template
        </Button>
      </div>

      {/* Info sobre personalização por sexo */}
      <Card className="border-secondary bg-secondary/5">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <MessageSquare className="w-5 h-5 text-secondary shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-primary">Templates com personalização por gênero</p>
              <p className="text-sm text-muted-foreground mt-1">
                Cada template possui duas versões: uma para clientes <strong>masculinos</strong> (Sr.) e outra para <strong>femininas</strong> (Sra.). 
                O sistema seleciona automaticamente a versão correta baseado no campo "Sexo" do cadastro do cliente.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lista de Templates */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {templates.map(template => (
          <Card key={template.id} className="hover:shadow-md transition-shadow">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <CardTitle className="text-base">{template.nome}</CardTitle>
                    {getCategoryBadge(template.categoria)}
                    {template.tipoNotificacao && (
                      <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                        ⚡ {TIPOS_NOTIFICACAO[template.tipoNotificacao] ?? template.tipoNotificacao}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant="outline" className="text-xs">Variáveis: {template.variaveis.join(', ')}</Badge>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{template.ativo ? 'Ativo' : 'Inativo'}</span>
                  <Switch checked={template.ativo} onCheckedChange={() => handleToggleAtivo(template)} />
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <div className="p-3 bg-blue-50 rounded-lg">
                  <div className="flex items-center gap-1 mb-1">
                    <span className="text-xs font-medium text-blue-700">♂ Masculino</span>
                  </div>
                  <p className="text-sm text-blue-900">{template.mensagemMasculino}</p>
                </div>
                <div className="p-3 bg-pink-50 rounded-lg">
                  <div className="flex items-center gap-1 mb-1">
                    <span className="text-xs font-medium text-pink-700">♀ Feminino</span>
                  </div>
                  <p className="text-sm text-pink-900">{template.mensagemFeminino}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="flex-1" onClick={() => setSelectedTemplate(template)}>
                  <Eye className="w-4 h-4 mr-1" />Preview
                </Button>
                <Button size="sm" variant="outline" onClick={() => openEditModal(template)}>
                  <Edit className="w-4 h-4" />
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleCopy(template)}>
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Modal Preview */}
      <Dialog open={!!selectedTemplate} onOpenChange={() => setSelectedTemplate(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Preview: {selectedTemplate?.nome}</DialogTitle></DialogHeader>
          {selectedTemplate && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <Button size="sm" variant={previewSexo === 'masculino' ? 'default' : 'outline'} onClick={() => setPreviewSexo('masculino')}>
                  ♂ Masculino
                </Button>
                <Button size="sm" variant={previewSexo === 'feminino' ? 'default' : 'outline'} onClick={() => setPreviewSexo('feminino')}>
                  ♀ Feminino
                </Button>
              </div>
              {/* Simulação WhatsApp */}
              <div className="bg-muted rounded-lg p-4">
                <div className="flex justify-end">
                  <div className="bg-green-100 dark:bg-green-900/30 rounded-lg p-3 max-w-[85%] shadow-sm">
                    <p className="text-sm">{previewMessage(selectedTemplate, previewSexo)}</p>
                    <div className="flex items-center justify-end gap-1 mt-1">
                      <span className="text-[10px] text-muted-foreground">14:30</span>
                      <span className="text-blue-500 text-xs">✓✓</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal Criar / Editar Template */}
      <Dialog open={modalOpen} onOpenChange={(open) => { if (!open) { setModalOpen(false); setEditingId(null); setForm(EMPTY_FORM); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editingId ? 'Editar Template' : 'Novo Template'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Nome do Template</Label>
                <Input
                  placeholder="Ex: Cobrança 2ª via"
                  value={form.nome}
                  onChange={(e) => setForm(prev => ({ ...prev, nome: e.target.value }))}
                />
              </div>
              <div>
                <Label>Categoria</Label>
                <Select value={form.categoria} onValueChange={(v) => setForm(prev => ({ ...prev, categoria: v as TemplateCategoria }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cobranca">Cobrança</SelectItem>
                    <SelectItem value="boas_vindas">Boas-vindas</SelectItem>
                    <SelectItem value="lembrete">Lembrete</SelectItem>
                    <SelectItem value="negociacao">Negociação</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Notificação Automática</Label>
              <Select value={form.tipoNotificacao} onValueChange={(v) => setForm(prev => ({ ...prev, tipoNotificacao: v === '_none' ? '' : v }))}>
                <SelectTrigger><SelectValue placeholder="Nenhum (manual)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Nenhum (manual)</SelectItem>
                  <SelectItem value="lembrete_3dias">⏰ Lembrete — 3 dias antes</SelectItem>
                  <SelectItem value="lembrete_vespera">⚠️ Lembrete — véspera do vencimento</SelectItem>
                  <SelectItem value="vencida_ontem">🔴 Cobrança — vencida ontem</SelectItem>
                  <SelectItem value="vencida_3dias">🟠 Cobrança — 3 dias de atraso</SelectItem>
                  <SelectItem value="vencida_7dias">🟠 Cobrança — 7 dias de atraso</SelectItem>
                  <SelectItem value="vencida_15dias">🔴 Cobrança — 15 dias de atraso</SelectItem>
                  <SelectItem value="vencida_30dias">⛔ Cobrança — 30 dias de atraso</SelectItem>
                  <SelectItem value="aprovacao">✅ Aprovação de crédito</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Vincular a uma automação faz o sistema usar este template automaticamente. Apenas 1 template ativo por tipo.
              </p>
            </div>
            <div>
              <Label>Mensagem Masculino (Sr.)</Label>
              <Textarea
                placeholder="Use {nome}, {valor}, {data} como variáveis..."
                rows={3}
                value={form.mensagemMasculino}
                onChange={(e) => setForm(prev => ({ ...prev, mensagemMasculino: e.target.value }))}
              />
            </div>
            <div>
              <Label>Mensagem Feminino (Sra.)</Label>
              <Textarea
                placeholder="Use {nome}, {valor}, {data} como variáveis..."
                rows={3}
                value={form.mensagemFeminino}
                onChange={(e) => setForm(prev => ({ ...prev, mensagemFeminino: e.target.value }))}
              />
            </div>
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-xs font-medium text-muted-foreground mb-1">Variáveis disponíveis:</p>
              <p className="text-xs text-muted-foreground">
                {'{nome}'} — nome do cliente · {'{valor}'} — valor da parcela · {'{data}'} — data de vencimento · {'{numeroParcela}'} — nº da parcela
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {'{diasAtraso}'} — dias em atraso · {'{totalParcelas}'} — total de parcelas do empréstimo · {'{parcelasPagas}'} — parcelas já pagas
              </p>
            </div>
            <div className="flex gap-3">
              <Button
                className="flex-1 bg-primary hover:bg-primary/90"
                onClick={handleSave}
                disabled={isSaving || !form.nome || !form.categoria || !form.mensagemMasculino || !form.mensagemFeminino}
              >
                {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {editingId ? 'Atualizar Template' : 'Salvar Template'}
              </Button>
              <Button className="flex-1" variant="outline" onClick={() => { setModalOpen(false); setEditingId(null); setForm(EMPTY_FORM); }}>
                Cancelar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
