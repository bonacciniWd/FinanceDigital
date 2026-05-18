/**
 * @module EmprestimoMidiasPage
 * @description Galeria de mídias compartilhadas — imagens, vídeos, links,
 * observações e documentos vinculados a um ou mais empréstimos/clientes.
 *
 * Fonte: tabela `emprestimo_midias` + bucket `emprestimo-midias`.
 * Realtime: alterações propagadas em tempo real via `useEmprestimoMidias`.
 */
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Plus, Loader2, Image as ImageIcon, Video, FileText, Link as LinkIcon,
  StickyNote, Trash2, Tag, Filter, ExternalLink, Upload, Download,
} from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '../components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import {
  useEmprestimoMidias, useCriarMidia, useDeletarMidia,
} from '../hooks/useEmprestimoMidias';
import {
  uploadArquivo, publicUrl, type MidiaTipo, type EmprestimoMidia,
} from '../services/emprestimoMidiaService';
import { useClientes } from '../hooks/useClientes';
import { useAuth } from '../contexts/AuthContext';

const TIPO_META: Record<MidiaTipo, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  imagem:     { label: 'Imagem',     icon: ImageIcon, color: 'text-blue-600' },
  video:      { label: 'Vídeo',      icon: Video,     color: 'text-purple-600' },
  documento:  { label: 'Documento',  icon: FileText,  color: 'text-amber-700' },
  link:       { label: 'Link',       icon: LinkIcon,  color: 'text-cyan-600' },
  observacao: { label: 'Observação', icon: StickyNote, color: 'text-slate-600' },
};

export default function EmprestimoMidiasPage() {
  const { user } = useAuth();
  const [filtroTipo, setFiltroTipo] = useState<MidiaTipo | 'todos'>('todos');
  const [filtroTag, setFiltroTag] = useState('');
  const filtros = useMemo(
    () => ({
      tipo: filtroTipo === 'todos' ? undefined : filtroTipo,
      tag: filtroTag.trim() || undefined,
    }),
    [filtroTipo, filtroTag],
  );
  const { data: midias = [], isLoading } = useEmprestimoMidias(filtros);
  const deletar = useDeletarMidia();
  const [openNew, setOpenNew] = useState(false);

  const podeApagar = user?.role === 'admin' || user?.role === 'gerencia';

  const onDelete = (m: EmprestimoMidia) => {
    if (!confirm(`Excluir "${m.titulo}"?`)) return;
    deletar.mutate(m.id, {
      onSuccess: () => toast.success('Mídia removida.'),
      onError: (e) => toast.error((e as Error).message),
    });
  };

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ImageIcon className="w-6 h-6 text-primary" /> Mídias e Links Compartilhados
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Centralize imagens, vídeos, documentos, links e observações vinculados a
            múltiplos empréstimos ou clientes.
          </p>
        </div>
        <Button onClick={() => setOpenNew(true)}>
          <Plus className="w-4 h-4 mr-1" /> Nova mídia
        </Button>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <Filter className="w-4 h-4 text-muted-foreground" />
        <Select value={filtroTipo} onValueChange={(v) => setFiltroTipo(v as MidiaTipo | 'todos')}>
          <SelectTrigger className="w-40 h-9 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os tipos</SelectItem>
            {(Object.keys(TIPO_META) as MidiaTipo[]).map((t) => (
              <SelectItem key={t} value={t}>{TIPO_META[t].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          placeholder="Filtrar por tag"
          value={filtroTag}
          onChange={(e) => setFiltroTag(e.target.value)}
          className="h-9 max-w-xs"
        />
        <span className="ml-auto text-xs text-muted-foreground">{midias.length} itens</span>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : midias.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            Nenhuma mídia encontrada.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {midias.map((m) => (
            <MidiaCard key={m.id} midia={m} onDelete={podeApagar ? () => onDelete(m) : undefined} />
          ))}
        </div>
      )}

      {openNew && <NovaMidiaDialog onClose={() => setOpenNew(false)} />}
    </div>
  );
}

function MidiaCard({ midia, onDelete }: { midia: EmprestimoMidia; onDelete?: () => void }) {
  const meta = TIPO_META[midia.tipo];
  const Icon = meta.icon;
  const url = midia.storage_path ? publicUrl(midia.storage_path) : midia.url_externa;

  return (
    <Card>
      <CardContent className="p-0">
        {midia.tipo === 'imagem' && url ? (
          <a href={url} target="_blank" rel="noreferrer">
            <img src={url} alt={midia.titulo} className="w-full h-40 object-cover rounded-t" />
          </a>
        ) : midia.tipo === 'video' && url ? (
          <video src={url} controls className="w-full h-40 bg-black rounded-t" />
        ) : (
          <div className={`h-32 flex items-center justify-center bg-muted rounded-t ${meta.color}`}>
            <Icon className="w-10 h-10" />
          </div>
        )}
        <div className="p-3 space-y-2">
          <div className="flex items-start gap-2">
            <Badge variant="outline" className={`text-[10px] ${meta.color}`}>{meta.label}</Badge>
            <div className="text-sm font-medium flex-1 truncate" title={midia.titulo}>{midia.titulo}</div>
          </div>
          {midia.descricao && (
            <div className="text-xs text-muted-foreground line-clamp-3">{midia.descricao}</div>
          )}
          {midia.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {midia.tags.map((t) => (
                <Badge key={t} variant="secondary" className="text-[10px]">
                  <Tag className="w-2.5 h-2.5 mr-0.5" /> {t}
                </Badge>
              ))}
            </div>
          )}
          <div className="text-[10px] text-muted-foreground">
            {midia.emprestimo_ids?.length ?? 0} empréstimo(s) · {midia.cliente_ids?.length ?? 0} cliente(s)
          </div>
          <div className="flex gap-1 pt-1 border-t">
            {url && (
              <Button size="sm" variant="outline" className="flex-1 h-7" asChild>
                <a href={url} target="_blank" rel="noreferrer">
                  {midia.tipo === 'documento' ? (
                    <><Download className="w-3 h-3 mr-1" /> Abrir</>
                  ) : (
                    <><ExternalLink className="w-3 h-3 mr-1" /> Abrir</>
                  )}
                </a>
              </Button>
            )}
            {onDelete && (
              <Button size="sm" variant="outline" className="h-7 text-red-600" onClick={onDelete}>
                <Trash2 className="w-3 h-3" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function NovaMidiaDialog({ onClose }: { onClose: () => void }) {
  const criar = useCriarMidia();
  const { data: clientes = [] } = useClientes();

  const [tipo, setTipo] = useState<MidiaTipo>('imagem');
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [urlExterna, setUrlExterna] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [clienteIds, setClienteIds] = useState<string[]>([]);
  const [emprestimoIds] = useState<string[]>([]);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const precisaArquivo = tipo === 'imagem' || tipo === 'video' || tipo === 'documento';
  const precisaUrl = tipo === 'link';

  const submit = async () => {
    if (!titulo.trim()) return toast.error('Informe um título.');
    if (precisaArquivo && !arquivo) return toast.error('Selecione um arquivo.');
    if (precisaUrl && !urlExterna.trim()) return toast.error('Informe a URL.');

    try {
      setUploading(true);
      let storage_path: string | null = null;
      let mime_type: string | null = null;
      let tamanho_bytes: number | null = null;
      if (precisaArquivo && arquivo) {
        const up = await uploadArquivo(arquivo);
        storage_path = up.path;
        mime_type = arquivo.type;
        tamanho_bytes = arquivo.size;
      }
      const tags = tagsInput.split(',').map((t) => t.trim()).filter(Boolean);
      await criar.mutateAsync({
        tipo,
        titulo: titulo.trim(),
        descricao: descricao.trim() || undefined,
        storage_path,
        url_externa: precisaUrl ? urlExterna.trim() : null,
        mime_type,
        tamanho_bytes,
        emprestimo_ids: emprestimoIds,
        cliente_ids: clienteIds,
        tags,
      });
      toast.success('Mídia adicionada.');
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova mídia compartilhada</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Tipo</Label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as MidiaTipo)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(TIPO_META) as MidiaTipo[]).map((t) => (
                  <SelectItem key={t} value={t}>{TIPO_META[t].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Título</Label>
            <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} />
          </div>
          <div>
            <Label>Descrição</Label>
            <Textarea rows={3} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
          </div>
          {precisaArquivo && (
            <div>
              <Label>Arquivo</Label>
              <div className="flex items-center gap-2">
                <Input type="file" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
                {arquivo && (
                  <Badge variant="secondary">
                    <Upload className="w-3 h-3 mr-1" />
                    {(arquivo.size / 1024 / 1024).toFixed(2)} MB
                  </Badge>
                )}
              </div>
            </div>
          )}
          {precisaUrl && (
            <div>
              <Label>URL externa</Label>
              <Input value={urlExterna} onChange={(e) => setUrlExterna(e.target.value)} placeholder="https://..." />
            </div>
          )}
          <div>
            <Label>Tags (separadas por vírgula)</Label>
            <Input value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="ex: comprovante, contrato, garantia" />
          </div>
          <div>
            <Label>Vincular a clientes (opcional)</Label>
            <select
              multiple
              value={clienteIds}
              onChange={(e) => setClienteIds(Array.from(e.target.selectedOptions).map((o) => o.value))}
              className="w-full border rounded p-2 text-sm h-32"
            >
              {clientes.slice(0, 200).map((c) => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
            <p className="text-[10px] text-muted-foreground mt-1">Segure Cmd/Ctrl para selecionar vários.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={uploading || criar.isPending}>
            {(uploading || criar.isPending) && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
