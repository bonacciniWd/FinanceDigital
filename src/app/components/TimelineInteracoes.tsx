/**
 * @module TimelineInteracoes
 * @description Componente reutilizável que renderiza a timeline unificada de
 * interações de um cliente, com botões para registrar manualmente (ligação,
 * visita, e-mail, observação) e exportar o histórico em markdown.
 *
 * Recebe `clienteId` e (opcionalmente) dados do cliente para o export.
 */
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  MessageSquare, Phone, MapPin, Mail, ArrowRightLeft, Handshake,
  CheckCircle2, XCircle, Banknote, StickyNote, Loader2, Plus,
  Download, Copy, Trash2,
} from 'lucide-react';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from './ui/dialog';
import { useAuth } from '../contexts/AuthContext';
import {
  useTimelineInteracoes,
  useRegistrarInteracao,
  useDeletarInteracao,
} from '../hooks/useTimelineInteracoes';
import {
  exportarTimelineMarkdown,
  type TimelineItem,
  type TimelineTipo,
} from '../services/timelineInteracoesService';

interface Props {
  clienteId: string;
  cliente?: { nome: string; telefone: string };
  /** Limita altura do scroll; default 480px */
  maxHeight?: number;
}

const TIPO_META: Record<TimelineTipo, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  whatsapp:        { label: 'WhatsApp',        icon: MessageSquare,   color: 'text-green-600' },
  ligacao:         { label: 'Ligação',         icon: Phone,           color: 'text-blue-600' },
  visita:          { label: 'Visita',          icon: MapPin,          color: 'text-purple-600' },
  email:           { label: 'E-mail',          icon: Mail,            color: 'text-cyan-600' },
  mudanca_etapa:   { label: 'Etapa',           icon: ArrowRightLeft,  color: 'text-amber-600' },
  acordo_criado:   { label: 'Acordo criado',   icon: Handshake,       color: 'text-emerald-600' },
  acordo_quebrado: { label: 'Acordo quebrado', icon: XCircle,         color: 'text-red-600' },
  acordo_quitado:  { label: 'Acordo quitado',  icon: CheckCircle2,    color: 'text-emerald-700' },
  pagamento:       { label: 'Pagamento',       icon: Banknote,        color: 'text-green-700' },
  observacao:      { label: 'Observação',      icon: StickyNote,      color: 'text-slate-600' },
};

type TipoManual = Extract<TimelineTipo, 'ligacao' | 'visita' | 'email' | 'observacao'>;

export default function TimelineInteracoes({ clienteId, cliente, maxHeight = 480 }: Props) {
  const { user } = useAuth();
  const { data: itens = [], isLoading } = useTimelineInteracoes(clienteId);
  const registrar = useRegistrarInteracao();
  const deletar = useDeletarInteracao();

  const [openNew, setOpenNew] = useState(false);
  const [novoTipo, setNovoTipo] = useState<TipoManual>('ligacao');
  const [novoTitulo, setNovoTitulo] = useState('');
  const [novaDescricao, setNovaDescricao] = useState('');
  const [filtroTipo, setFiltroTipo] = useState<TimelineTipo | 'todos'>('todos');

  const itensFiltrados = useMemo(() => {
    if (filtroTipo === 'todos') return itens;
    return itens.filter((i) => i.tipo === filtroTipo);
  }, [itens, filtroTipo]);

  const podeApagar = user?.role === 'admin' || user?.role === 'gerencia';

  const submitNovo = async () => {
    if (!novoTitulo.trim()) {
      toast.error('Informe um título.');
      return;
    }
    try {
      await registrar.mutateAsync({
        cliente_id: clienteId,
        tipo: novoTipo,
        titulo: novoTitulo.trim(),
        descricao: novaDescricao.trim() || undefined,
      });
      toast.success('Interação registrada.');
      setOpenNew(false);
      setNovoTitulo('');
      setNovaDescricao('');
      setNovoTipo('ligacao');
    } catch (err) {
      toast.error(`Erro ao registrar: ${(err as Error).message}`);
    }
  };

  const handleExport = () => {
    const md = exportarTimelineMarkdown(
      cliente ?? { nome: 'Cliente', telefone: '' },
      itensFiltrados,
    );
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `timeline-${cliente?.nome ?? clienteId}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopy = async () => {
    const md = exportarTimelineMarkdown(
      cliente ?? { nome: 'Cliente', telefone: '' },
      itensFiltrados,
    );
    try {
      await navigator.clipboard.writeText(md);
      toast.success('Timeline copiada (markdown).');
    } catch {
      toast.error('Não foi possível copiar.');
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={filtroTipo} onValueChange={(v) => setFiltroTipo(v as TimelineTipo | 'todos')}>
          <SelectTrigger className="w-44 h-9 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os eventos</SelectItem>
            {(Object.keys(TIPO_META) as TimelineTipo[]).map((t) => (
              <SelectItem key={t} value={t}>{TIPO_META[t].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" onClick={() => setOpenNew(true)}>
          <Plus className="w-4 h-4 mr-1" /> Registrar interação
        </Button>
        <Button size="sm" variant="outline" onClick={handleCopy} disabled={itensFiltrados.length === 0}>
          <Copy className="w-4 h-4 mr-1" /> Copiar
        </Button>
        <Button size="sm" variant="outline" onClick={handleExport} disabled={itensFiltrados.length === 0}>
          <Download className="w-4 h-4 mr-1" /> Exportar .md
        </Button>
        <span className="ml-auto text-xs text-muted-foreground">{itensFiltrados.length} eventos</span>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : itensFiltrados.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            Nenhuma interação registrada.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2 overflow-y-auto pr-2" style={{ maxHeight }}>
          {itensFiltrados.map((it) => (
            <TimelineRow key={it.id} item={it} onDelete={podeApagar ? () => deletar.mutate(it.id) : undefined} />
          ))}
        </div>
      )}

      <Dialog open={openNew} onOpenChange={setOpenNew}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar interação manual</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium block mb-1">Tipo</label>
              <Select value={novoTipo} onValueChange={(v) => setNovoTipo(v as TipoManual)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ligacao">Ligação</SelectItem>
                  <SelectItem value="visita">Visita</SelectItem>
                  <SelectItem value="email">E-mail</SelectItem>
                  <SelectItem value="observacao">Observação</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium block mb-1">Título</label>
              <Input value={novoTitulo} onChange={(e) => setNovoTitulo(e.target.value)} placeholder="Ex: Tentativa de contato sem retorno" />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1">Descrição (opcional)</label>
              <Textarea value={novaDescricao} onChange={(e) => setNovaDescricao(e.target.value)} rows={4} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenNew(false)}>Cancelar</Button>
            <Button onClick={submitNovo} disabled={registrar.isPending}>
              {registrar.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TimelineRow({ item, onDelete }: { item: TimelineItem; onDelete?: () => void }) {
  const meta = TIPO_META[item.tipo];
  const Icon = meta.icon;
  return (
    <Card>
      <CardContent className="p-3 flex items-start gap-3">
        <div className={`w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0 ${meta.color}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-[10px]">{meta.label}</Badge>
            <span className="text-xs text-muted-foreground">
              {new Date(item.created_at).toLocaleString('pt-BR')}
            </span>
          </div>
          <div className="text-sm font-medium mt-0.5">{item.titulo}</div>
          {item.descricao && (
            <div className="text-xs text-muted-foreground mt-1 whitespace-pre-line break-words">{item.descricao}</div>
          )}
        </div>
        {onDelete && (
          <Button size="sm" variant="ghost" onClick={onDelete} className="h-7 w-7 p-0">
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
