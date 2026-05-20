/**
 * @module CobrancaAgendamentoPage
 * @description Centro de controle de cobrança automática inteligente (hub unificado).
 *
 * Aba "Templates": CRUD de templates de mensagens (re-aproveita TemplatesMensagensPage).
 *
 * Aba "Regras": CRUD em `cobranca_agendamentos` — define janela de envio
 * (horário, dias da semana, timezone), limites globais e por cliente,
 * faixa de dias de atraso, template e instância WhatsApp.
 *
 * Aba "Fila": lista `cobranca_fila` com status, contadores e ações
 * (cancelar item pendente). A edge function `processar-fila-cobranca`
 * consome a fila respeitando janela + limites.
 */
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';
import {
  Plus, Edit, Trash2, Power, Clock, Loader2, AlertCircle,
  CheckCircle2, XCircle, RefreshCw, MessageSquare, HelpCircle, Users,
} from 'lucide-react';
import TemplatesMensagensPage from './TemplatesMensagensPage';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Switch } from '../components/ui/switch';
import { Checkbox } from '../components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '../components/ui/dialog';
import {
  useCobrancaAgendamentos, useCobrancaFila, useCriarAgendamento,
  useUpdateAgendamento, useDeletarAgendamento, useCancelarItemFila,
  useEnfileirarLote,
} from '../hooks/useCobrancaAgendamento';
import { useTemplates } from '../hooks/useTemplates';
import { useInstancias } from '../hooks/useWhatsapp';
import { useCardsCobranca } from '../hooks/useKanbanCobranca';
import { useParcelas, useParcelasVencidas } from '../hooks/useParcelas';
import { useClientes } from '../hooks/useClientes';
import { useAuth } from '../contexts/AuthContext';
import { todayISO, formatDateBR } from '../lib/date-utils';
import type { CobrancaAgendamento, CobrancaFilaStatus } from '../services/cobrancaAgendamentoService';

const DIAS_SEMANA = [
  { v: 1, l: 'Seg' }, { v: 2, l: 'Ter' }, { v: 3, l: 'Qua' },
  { v: 4, l: 'Qui' }, { v: 5, l: 'Sex' }, { v: 6, l: 'Sáb' }, { v: 7, l: 'Dom' },
];

const STATUS_META: Record<CobrancaFilaStatus, { label: string; color: string }> = {
  pendente:     { label: 'Pendente',     color: 'bg-amber-100 text-amber-800' },
  enviando:     { label: 'Enviando',     color: 'bg-blue-100 text-blue-800' },
  enviado:      { label: 'Enviado',      color: 'bg-green-100 text-green-800' },
  falha:        { label: 'Falha',        color: 'bg-red-100 text-red-800' },
  cancelado:    { label: 'Cancelado',    color: 'bg-slate-100 text-slate-700' },
  fora_horario: { label: 'Fora janela',  color: 'bg-orange-100 text-orange-800' },
};

export default function CobrancaAgendamentoPage() {
  const { user } = useAuth();
  const podeEditar = user?.role === 'admin' || user?.role === 'gerencia';
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') ?? 'templates';
  const setTab = (v: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', v);
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <header>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Clock className="w-6 h-6 text-primary" /> Automação de Cobrança
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Hub unificado: gerencie <b>templates</b>, configure <b>regras</b> de disparo automático e acompanhe a <b>fila</b>.
        </p>
      </header>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="regras">Regras</TabsTrigger>
          <TabsTrigger value="fila">Fila</TabsTrigger>
        </TabsList>
        <TabsContent value="templates" className="mt-4">
          <TemplatesMensagensPage />
        </TabsContent>
        <TabsContent value="regras" className="mt-4">
          <RegrasTab podeEditar={podeEditar} />
        </TabsContent>
        <TabsContent value="fila" className="mt-4">
          <FilaTab podeEditar={podeEditar} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Aba Regras
// ---------------------------------------------------------------------------
function RegrasTab({ podeEditar }: { podeEditar: boolean }) {
  const { data: regras = [], isLoading } = useCobrancaAgendamentos();
  const update = useUpdateAgendamento();
  const deletar = useDeletarAgendamento();
  const [editing, setEditing] = useState<CobrancaAgendamento | null>(null);
  const [novo, setNovo] = useState(false);
  const [picker, setPicker] = useState<CobrancaAgendamento | null>(null);

  const toggleAtivo = (r: CobrancaAgendamento) => {
    update.mutate(
      { id: r.id, patch: { ativo: !r.ativo } },
      {
        onSuccess: () => toast.success(`Regra ${!r.ativo ? 'ativada' : 'pausada'}.`),
        onError: (e) => toast.error((e as Error).message),
      },
    );
  };

  const onDelete = (r: CobrancaAgendamento) => {
    if (!confirm(`Excluir regra "${r.nome}"?`)) return;
    deletar.mutate(r.id, {
      onSuccess: () => toast.success('Regra removida.'),
      onError: (e) => toast.error((e as Error).message),
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        {podeEditar && (
          <Button onClick={() => setNovo(true)} size="sm">
            <Plus className="w-4 h-4 mr-1" /> Nova regra
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : regras.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            Nenhuma regra cadastrada. Crie regras para automatizar as cobranças.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {regras.map((r) => (
            <Card key={r.id} className={r.ativo ? 'border-green-300' : 'opacity-70'}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">{r.nome}</CardTitle>
                  <Badge variant={r.ativo ? 'default' : 'outline'}>
                    {r.ativo ? 'Ativa' : 'Pausada'}
                  </Badge>
                </div>
                {r.descricao && (
                  <p className="text-xs text-muted-foreground">{r.descricao}</p>
                )}
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                <div>Atraso: <b>{r.dias_atraso_min}–{r.dias_atraso_max}</b> dias</div>
                <div>Janela: <b>{r.horario_inicio}–{r.horario_fim}</b> ({r.timezone})</div>
                <div>
                  Dias:{' '}
                  {DIAS_SEMANA.filter((d) => r.dias_semana?.includes(d.v)).map((d) => d.l).join(', ')}
                </div>
                <div>
                  Limites: máx <b>{r.max_disparos_por_dia_cli}</b>/cli/dia · {r.intervalo_min_horas}h entre envios
                </div>
                <div>
                  Delay entre envios: <b>{r.intervalo_entre_envios_seg ?? 60}s</b>
                </div>
                <div>Disparos totais: <b>{r.total_disparos}</b></div>
                {podeEditar && (
                  <div className="space-y-1 pt-2 border-t">
                    <Button size="sm" variant="default" className="w-full h-7" onClick={() => setPicker(r)}>
                      <Users className="w-3 h-3 mr-1" /> Selecionar clientes do Kanban
                    </Button>
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" className="flex-1 h-7" onClick={() => toggleAtivo(r)}>
                        <Power className="w-3 h-3 mr-1" />
                        {r.ativo ? 'Pausar' : 'Ativar'}
                      </Button>
                      <Button size="sm" variant="outline" className="h-7" onClick={() => setEditing(r)}>
                        <Edit className="w-3 h-3" />
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-red-600" onClick={() => onDelete(r)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {(novo || editing) && (
        <RegraDialog
          regra={editing ?? undefined}
          onClose={() => { setNovo(false); setEditing(null); }}
        />
      )}

      {picker && (
        <KanbanClientPicker
          regra={picker}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}

function RegraDialog({ regra, onClose }: { regra?: CobrancaAgendamento; onClose: () => void }) {
  const { data: templates = [] } = useTemplates();
  const { data: instancias = [] } = useInstancias();
  const criar = useCriarAgendamento();
  const update = useUpdateAgendamento();
  const [ajudaOpen, setAjudaOpen] = useState(!regra);

  const [form, setForm] = useState({
    nome: regra?.nome ?? '',
    descricao: regra?.descricao ?? '',
    ativo: regra?.ativo ?? false,
    prioridade: regra?.prioridade ?? 0,
    dias_atraso_min: regra?.dias_atraso_min ?? 0,
    dias_atraso_max: regra?.dias_atraso_max ?? 7,
    template_id: regra?.template_id ?? '',
    instancia_id: regra?.instancia_id ?? '',
    horario_inicio: regra?.horario_inicio ?? '09:00:00',
    horario_fim: regra?.horario_fim ?? '18:00:00',
    timezone: regra?.timezone ?? 'America/Sao_Paulo',
    dias_semana: regra?.dias_semana ?? [1, 2, 3, 4, 5],
    intervalo_min_horas: regra?.intervalo_min_horas ?? 24,
    intervalo_entre_envios_seg: regra?.intervalo_entre_envios_seg ?? 60,
    max_disparos_por_dia_cli: regra?.max_disparos_por_dia_cli ?? 1,
    max_disparos_por_hora: regra?.max_disparos_por_hora ?? 100,
    max_disparos_por_dia: regra?.max_disparos_por_dia ?? 500,
  });

  const toggleDia = (v: number) => {
    setForm((f) => ({
      ...f,
      dias_semana: f.dias_semana.includes(v)
        ? f.dias_semana.filter((d) => d !== v)
        : [...f.dias_semana, v].sort(),
    }));
  };

  const salvar = async () => {
    if (!form.nome.trim()) return toast.error('Informe um nome.');
    if (form.dias_atraso_min > form.dias_atraso_max) return toast.error('Atraso mín > máx.');
    const payload = {
      ...form,
      template_id: form.template_id || null,
      instancia_id: form.instancia_id || null,
    } as Partial<CobrancaAgendamento> & { nome: string };
    try {
      if (regra) {
        await update.mutateAsync({ id: regra.id, patch: payload });
        toast.success('Regra atualizada.');
      } else {
        await criar.mutateAsync(payload);
        toast.success('Regra criada.');
      }
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const saving = criar.isPending || update.isPending;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="min-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>{regra ? 'Editar regra' : 'Nova regra'}</DialogTitle>
            <Button size="sm" variant="ghost" onClick={() => setAjudaOpen(true)}>
              <HelpCircle className="w-4 h-4 mr-1" /> O que é cada campo?
            </Button>
          </div>
          <DialogDescription className="text-xs">
            Configure quando, como e para quem o sistema envia cobranças automáticas.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Prioridade</Label>
              <Input type="number" value={form.prioridade} onChange={(e) => setForm({ ...form, prioridade: +e.target.value })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <Textarea rows={2} value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Atraso mínimo (dias)</Label>
              <Input type="number" value={form.dias_atraso_min} onChange={(e) => setForm({ ...form, dias_atraso_min: +e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Atraso máximo (dias)</Label>
              <Input type="number" value={form.dias_atraso_max} onChange={(e) => setForm({ ...form, dias_atraso_max: +e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Template</Label>
              <Select value={form.template_id ?? ''} onValueChange={(v) => setForm({ ...form, template_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Instância WhatsApp</Label>
              <Select value={form.instancia_id ?? ''} onValueChange={(v) => setForm({ ...form, instancia_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {instancias.map((i) => {
                    const label = i.instance_name || `Instância ${i.id.slice(0, 8)}`;
                    const sub = i.phone_number ? ` — ${i.phone_number}` : '';
                    return (
                      <SelectItem key={i.id} value={i.id}>{label}{sub}</SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Início</Label>
              <Input type="time" step={1} value={form.horario_inicio.slice(0, 8)} onChange={(e) => setForm({ ...form, horario_inicio: e.target.value.length === 5 ? `${e.target.value}:00` : e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Fim</Label>
              <Input type="time" step={1} value={form.horario_fim.slice(0, 8)} onChange={(e) => setForm({ ...form, horario_fim: e.target.value.length === 5 ? `${e.target.value}:00` : e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Timezone</Label>
              <Input value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Dias da semana</Label>
            <div className="flex gap-1 flex-wrap">
              {DIAS_SEMANA.map((d) => (
                <Button
                  key={d.v}
                  type="button"
                  size="sm"
                  variant={form.dias_semana.includes(d.v) ? 'default' : 'outline'}
                  onClick={() => toggleDia(d.v)}
                  className="h-7"
                >
                  {d.l}
                </Button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Intervalo mín. entre envios ao mesmo cliente (h)</Label>
              <Input type="number" value={form.intervalo_min_horas} onChange={(e) => setForm({ ...form, intervalo_min_horas: +e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Delay entre disparos consecutivos (segundos)</Label>
              <Input type="number" min={0} max={3600} value={form.intervalo_entre_envios_seg} onChange={(e) => setForm({ ...form, intervalo_entre_envios_seg: +e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Máx. disparos por cliente/dia</Label>
              <Input type="number" value={form.max_disparos_por_dia_cli} onChange={(e) => setForm({ ...form, max_disparos_por_dia_cli: +e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Máx. disparos globais/hora</Label>
              <Input type="number" value={form.max_disparos_por_hora} onChange={(e) => setForm({ ...form, max_disparos_por_hora: +e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Máx. disparos globais/dia</Label>
              <Input type="number" value={form.max_disparos_por_dia} onChange={(e) => setForm({ ...form, max_disparos_por_dia: +e.target.value })} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={form.ativo} onCheckedChange={(v) => setForm({ ...form, ativo: v })} />
            <Label>Ativa</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
        <AjudaRegraDialog open={ajudaOpen} onClose={() => setAjudaOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Popup de ajuda — explica cada campo
// ---------------------------------------------------------------------------
function AjudaRegraDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const itens: Array<{ t: string; d: string }> = [
    { t: 'Nome', d: 'Identificação curta da regra. Ex.: "Cobrança N1 (1-7 dias)".' },
    { t: 'Prioridade', d: 'Quando várias regras se aplicam ao mesmo cliente, a de maior prioridade vence.' },
    { t: 'Descrição', d: 'Texto livre para documentar o objetivo da regra.' },
    { t: 'Atraso mínimo / máximo (dias)', d: 'Faixa de atraso (em dias) que torna o cliente elegível. Ex.: 1–7 = primeira semana atrasada.' },
    { t: 'Template', d: 'Mensagem que será enviada. Tem versão masculina/feminina e suporta variáveis ({nome}, {valor}, {data}…).' },
    { t: 'Instância WhatsApp', d: 'Qual conexão (número) será usada para disparar. Recomenda-se uma instância dedicada para cobrança.' },
    { t: 'Início / Fim', d: 'Janela horária permitida para envios (no fuso definido). Fora dela, o item fica em “fora_horario”.' },
    { t: 'Timezone', d: 'Fuso para interpretar a janela. Padrão: America/Sao_Paulo.' },
    { t: 'Dias da semana', d: 'Dias em que a regra pode disparar (segunda–domingo). Marque os permitidos.' },
    { t: 'Intervalo mín. entre envios ao mesmo cliente (h)', d: 'Tempo mínimo (em horas) entre dois envios para o mesmo cliente. Evita spam.' },
    { t: 'Delay entre disparos consecutivos (s)', d: 'Pausa em segundos entre cada disparo da fila (anti-ban WhatsApp). Recomendado: 30–120s.' },
    { t: 'Máx. disparos por cliente/dia', d: 'Quantas mensagens, no máximo, esta regra envia para um mesmo cliente em um dia.' },
    { t: 'Máx. disparos globais / hora', d: 'Teto total da regra por hora (todos os clientes somados).' },
    { t: 'Máx. disparos globais / dia', d: 'Teto total da regra por dia (todos os clientes somados).' },
    { t: 'Ativa', d: 'Liga ou pausa a regra. Mantém as configurações, mas não dispara enquanto estiver pausada.' },
  ];
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="min-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><HelpCircle className="w-5 h-5 text-primary" /> O que cada campo significa</DialogTitle>
          <DialogDescription>Referência rápida para configurar uma regra de cobrança automática.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 text-sm">
          {itens.map((it) => (
            <div key={it.t} className="border-l-2 border-primary/40 pl-3 py-1">
              <div className="font-medium">{it.t}</div>
              <div className="text-muted-foreground text-xs">{it.d}</div>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Entendi</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Picker de clientes do Kanban Cobrança para enfileirar disparos manualmente
// ---------------------------------------------------------------------------
function KanbanClientPicker({ regra, onClose }: { regra: CobrancaAgendamento; onClose: () => void }) {
  const { data: cards = [], isLoading } = useCardsCobranca();
  const { data: templates = [] } = useTemplates();
  const { data: parcelasPendentes = [] } = useParcelas('pendente');
  const { data: parcelasVencidasList = [] } = useParcelasVencidas();
  const { data: clientes = [] } = useClientes();
  const enfileirar = useEnfileirarLote();
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [filtroEtapa, setFiltroEtapa] = useState<string>('todos');

  const todayStr = useMemo(() => todayISO(), []);

  /**
   * Mapa por clienteId com:
   *   • proxima        – próxima parcela em aberto (futura ou, se não houver, a vencida mais antiga)
   *   • vencidas       – lista de parcelas vencidas (status='vencida' ou data < hoje)
   *   • diasAtrasoReal – atraso real (em dias) da parcela mais antiga vencida
   *   • venceHoje      – true se a próxima parcela vence hoje E não há nenhuma vencida
   *   • totalEmprestimo– soma dos valores ORIGINAIS de todas as parcelas em aberto (futuras+vencidas)
   *
   * Fonte de verdade: parcelas (mesmo cálculo da KanbanCobrancaPage para "VENCE HOJE").
   */
  type ParcInfo = {
    proxima: typeof parcelasPendentes[number] | null;
    vencidas: typeof parcelasPendentes;
    diasAtrasoReal: number;
    venceHoje: boolean;
  };
  const parcelasInfoByCliente = useMemo(() => {
    const map = new Map<string, ParcInfo>();
    const all = [...parcelasPendentes, ...parcelasVencidasList].filter((p) => !p.congelada);
    const byCliente = new Map<string, typeof all>();
    for (const p of all) {
      const arr = byCliente.get(p.clienteId) ?? [];
      arr.push(p);
      byCliente.set(p.clienteId, arr);
    }
    for (const [cid, parts] of byCliente) {
      const sorted = [...parts].sort((a, b) => a.dataVencimento.localeCompare(b.dataVencimento));
      const vencidas = sorted.filter((p) => p.status === 'vencida' || p.dataVencimento < todayStr);
      const futuras = sorted.filter((p) => p.status !== 'vencida' && p.dataVencimento >= todayStr);
      const proxima = futuras[0] ?? vencidas[0] ?? null;
      const venceHoje = futuras[0]?.dataVencimento === todayStr && vencidas.length === 0;
      let diasAtrasoReal = 0;
      if (vencidas[0]) {
        const d = new Date(vencidas[0].dataVencimento + 'T00:00:00');
        const h = new Date(todayStr + 'T00:00:00');
        diasAtrasoReal = Math.max(0, Math.floor((h.getTime() - d.getTime()) / 86400000));
      }
      map.set(cid, { proxima, vencidas, diasAtrasoReal, venceHoje });
    }
    return map;
  }, [parcelasPendentes, parcelasVencidasList, todayStr]);

  // ETAPAS consideradas "finais" para fins de filtro "vence hoje" (espelha KanbanCobrancaPage)
  const ETAPAS_FINAIS = useMemo(
    () => new Set(['pago', 'perdido', 'arquivado', 'contatado', 'negociacao', 'acordo']),
    [],
  );

  const elegiveis = useMemo(() => {
    return cards.filter((c) => {
      if (c.etapa === 'pago' || c.etapa === 'arquivado') return false;
      if (!c.clienteTelefone) return false;
      if (filtroEtapa === 'todos') return true;
      // "A vencer" no picker = mesma semântica da coluna "VENCE HOJE" do Kanban:
      //   • etapa não está em estágios finais
      //   • próxima parcela vence HOJE
      //   • cliente NÃO tem parcelas vencidas
      if (filtroEtapa === 'a_vencer') {
        if (ETAPAS_FINAIS.has(c.etapa)) return false;
        const info = parcelasInfoByCliente.get(c.clienteId);
        return !!info?.venceHoje;
      }
      return c.etapa === filtroEtapa;
    });
  }, [cards, filtroEtapa, parcelasInfoByCliente, ETAPAS_FINAIS]);

  const template = templates.find((t) => t.id === regra.template_id);

  const toggle = (id: string) => {
    setSelecionados((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };
  const toggleAll = () => {
    if (selecionados.size === elegiveis.length) setSelecionados(new Set());
    else setSelecionados(new Set(elegiveis.map((c) => c.id)));
  };

  const confirmar = async () => {
    if (!regra.instancia_id) return toast.error('Defina uma instância WhatsApp na regra antes de enfileirar.');
    if (!template) return toast.error('Defina um template na regra antes de enfileirar.');
    if (selecionados.size === 0) return toast.error('Selecione ao menos um cliente.');

    const fmtBRL = (n: number) =>
      n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const itens = elegiveis
      .filter((c) => selecionados.has(c.id))
      .map((c) => {
        const nome = (c.clienteNome ?? '').split(' ')[0] || (c.clienteNome ?? '');
        const cliente = clientes.find((cl) => cl.id === c.clienteId);
        const sexo = (cliente?.sexo === 'feminino' ? 'feminino' : 'masculino') as 'masculino' | 'feminino';
        const info = parcelasInfoByCliente.get(c.clienteId);
        const proxima = info?.proxima ?? null;
        // {valor}: se houver vencidas, soma das vencidas (valor original); senão, somente próxima parcela
        const valorRef = info && info.vencidas.length > 0
          ? info.vencidas.reduce((s, p) => s + p.valor, 0)
          : (proxima?.valor ?? 0);
        const vars: Record<string, string> = {
          nome,
          valor: fmtBRL(valorRef),
          data: proxima ? formatDateBR(proxima.dataVencimento) : '',
          numeroParcela: String(proxima?.numero ?? ''),
          parcela: String(proxima?.numero ?? ''),
          diasAtraso: String(info?.diasAtrasoReal ?? Math.max(0, c.diasAtraso || 0)),
        };
        const base = sexo === 'feminino'
          ? (template.mensagemFeminino || template.mensagemMasculino || '')
          : (template.mensagemMasculino || template.mensagemFeminino || '');
        const msg = base.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
        return {
          cliente_id: c.clienteId,
          telefone: c.clienteTelefone ?? '',
          mensagem: msg,
        };
      });
    try {
      const r = await enfileirar.mutateAsync({
        agendamento_id: regra.id,
        template_id: regra.template_id,
        instancia_id: regra.instancia_id,
        itens,
      });
      toast.success(`${r.inseridos} disparo(s) enfileirado(s).`);
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="min-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Selecionar clientes do Kanban Cobrança</DialogTitle>
          <DialogDescription>
            Regra: <b>{regra.nome}</b> — serão enfileirados respeitando janela de horário, intervalo e limites configurados.
          </DialogDescription>
        </DialogHeader>

        {!regra.template_id || !regra.instancia_id ? (
          <div className="p-3 rounded bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 text-sm flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5" />
            <span>Esta regra ainda não tem <b>template</b> e/ou <b>instância WhatsApp</b> definidos. Edite a regra antes de enfileirar.</span>
          </div>
        ) : null}

        <div className="flex items-center gap-2">
          <Select value={filtroEtapa} onValueChange={setFiltroEtapa}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas as etapas</SelectItem>
              <SelectItem value="a_vencer">Vence hoje (a vencer)</SelectItem>
              <SelectItem value="vencido">Vencido</SelectItem>
              <SelectItem value="contatado">Contatado</SelectItem>
              <SelectItem value="negociacao">Negociação</SelectItem>
              <SelectItem value="acordo">Acordo</SelectItem>
              <SelectItem value="perdido">Perdido</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={toggleAll}>
            {selecionados.size === elegiveis.length && elegiveis.length > 0 ? 'Desmarcar todos' : 'Marcar todos visíveis'}
          </Button>
          <span className="text-sm text-muted-foreground ml-auto">
            {selecionados.size} de {elegiveis.length} selecionado(s)
          </span>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin" /></div>
        ) : elegiveis.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-8">Nenhum cliente elegível encontrado.</div>
        ) : (
          <div className="max-h-[40vh] overflow-y-auto border rounded divide-y">
            {elegiveis.map((c) => (
              <label key={c.id} className="flex items-center gap-3 px-3 py-2 hover:bg-muted/50 cursor-pointer">
                <Checkbox checked={selecionados.has(c.id)} onCheckedChange={() => toggle(c.id)} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{c.clienteNome}</div>
                  <div className="text-xs text-muted-foreground truncate">{c.clienteTelefone}{c.diasAtraso > 0 ? ` — ${c.diasAtraso}d atraso` : ''}</div>
                </div>
                <Badge variant="outline" className="text-[10px]">{c.etapa}</Badge>
              </label>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={confirmar} disabled={enfileirar.isPending || !regra.template_id || !regra.instancia_id || selecionados.size === 0}>
            {enfileirar.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            Enfileirar {selecionados.size} disparo(s)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Aba Fila
// ---------------------------------------------------------------------------
function FilaTab({ podeEditar }: { podeEditar: boolean }) {
  const [statusFiltro, setStatusFiltro] = useState<CobrancaFilaStatus | 'todos'>('todos');
  const filtros = statusFiltro === 'todos' ? undefined : { status: [statusFiltro] };
  const { data: itens = [], isLoading, refetch } = useCobrancaFila(filtros);
  const cancelar = useCancelarItemFila();

  const counts = useMemo(() => {
    const out: Record<CobrancaFilaStatus, number> = {
      pendente: 0, enviando: 0, enviado: 0, falha: 0, cancelado: 0, fora_horario: 0,
    };
    for (const i of itens) out[i.status] = (out[i.status] ?? 0) + 1;
    return out;
  }, [itens]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
        {(Object.keys(STATUS_META) as CobrancaFilaStatus[]).map((s) => (
          <Card key={s} className="cursor-pointer hover:border-primary" onClick={() => setStatusFiltro(s)}>
            <CardContent className="p-3">
              <div className="text-xs text-muted-foreground">{STATUS_META[s].label}</div>
              <div className="text-xl font-bold">{counts[s]}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <Select value={statusFiltro} onValueChange={(v) => setStatusFiltro(v as CobrancaFilaStatus | 'todos')}>
          <SelectTrigger className="w-48 h-9 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            {(Object.keys(STATUS_META) as CobrancaFilaStatus[]).map((s) => (
              <SelectItem key={s} value={s}>{STATUS_META[s].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4 mr-1" /> Atualizar
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : itens.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            Nenhum item na fila.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left p-2">Status</th>
                  <th className="text-left p-2">Agendado para</th>
                  <th className="text-left p-2">Telefone</th>
                  <th className="text-left p-2">Mensagem</th>
                  <th className="text-left p-2">Tent.</th>
                  <th className="text-left p-2">Erro</th>
                  {podeEditar && <th className="p-2" />}
                </tr>
              </thead>
              <tbody>
                {itens.map((it) => {
                  const meta = STATUS_META[it.status];
                  return (
                    <tr key={it.id} className="border-t">
                      <td className="p-2">
                        <Badge variant="outline" className={`text-[10px] ${meta.color}`}>
                          {meta.label}
                        </Badge>
                      </td>
                      <td className="p-2 whitespace-nowrap">
                        {new Date(it.agendado_para).toLocaleString('pt-BR')}
                      </td>
                      <td className="p-2 whitespace-nowrap">{it.telefone}</td>
                      <td className="p-2 max-w-md truncate" title={it.mensagem}>
                        <MessageSquare className="w-3 h-3 inline mr-1" />
                        {it.mensagem.slice(0, 60)}{it.mensagem.length > 60 ? '…' : ''}
                      </td>
                      <td className="p-2">{it.tentativas}</td>
                      <td className="p-2 text-red-600 max-w-[180px] truncate" title={it.ultimo_erro ?? ''}>
                        {it.ultimo_erro ? (
                          <><AlertCircle className="w-3 h-3 inline mr-1" />{it.ultimo_erro.slice(0, 30)}</>
                        ) : it.status === 'enviado' ? (
                          <CheckCircle2 className="w-3 h-3 text-green-600 inline" />
                        ) : null}
                      </td>
                      {podeEditar && (
                        <td className="p-2">
                          {(it.status === 'pendente' || it.status === 'fora_horario') && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 text-xs"
                              onClick={() => cancelar.mutate(it.id)}
                            >
                              <XCircle className="w-3 h-3 mr-1" /> Cancelar
                            </Button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
