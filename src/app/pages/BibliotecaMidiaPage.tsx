/**
 * @page BibliotecaMidiaPage
 * @description Biblioteca de mídias (Cloudinary) — galeria de imagens/vídeos
 * promocionais usados nos status do WhatsApp.
 *
 * Funcionalidades:
 *   - Upload assinado direto ao Cloudinary (sem expor secret).
 *   - Cadastro automático em `midia_assets` após upload.
 *   - Filtro por tipo (promocional, status_template).
 *   - Edição de título/caption/descrição.
 *   - Toggle ativo/inativo.
 *   - Exclusão (soft → ativo=false, recomendado).
 */
import { useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import { Switch } from '../components/ui/switch';
import { Progress } from '../components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';
import { ImagePlus, Trash2, Pencil, Video as VideoIcon, Image as ImageIcon, Sparkles } from 'lucide-react';
import {
  listMidiaAssets,
  createMidiaAsset,
  updateMidiaAsset,
  deleteMidiaAsset,
  type MidiaAsset,
  type MidiaTipo,
} from '../services/midiaAssetsService';
import { uploadSigned, videoThumbUrl } from '../services/cloudinaryService';
import { generateImageWithGemini } from '../services/geminiImageService';

const TIPOS: { value: MidiaTipo; label: string }[] = [
  { value: 'promocional', label: 'Promocional' },
  { value: 'status_template', label: 'Template de Status' },
  { value: 'lembrete_cobranca', label: 'Lembrete de Cobrança (IA)' },
];

export default function BibliotecaMidiaPage() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [filtroTipo, setFiltroTipo] = useState<MidiaTipo | 'todos'>('todos');
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [novoTitulo, setNovoTitulo] = useState('');
  const [novoTipo, setNovoTipo] = useState<MidiaTipo>('promocional');
  const [novoCaption, setNovoCaption] = useState('');
  const [editing, setEditing] = useState<MidiaAsset | null>(null);
  const [deleting, setDeleting] = useState<MidiaAsset | null>(null);
  const [geminiPrompt, setGeminiPrompt] = useState('');
  const [geminiTitulo, setGeminiTitulo] = useState('');
  const [geminiCaption, setGeminiCaption] = useState('');
  const [geminiTipo, setGeminiTipo] = useState<MidiaTipo>('promocional');

  const { data: assets = [], isLoading } = useQuery({
    queryKey: ['midia-assets', filtroTipo],
    queryFn: () => listMidiaAssets(filtroTipo === 'todos' ? undefined : { tipo: filtroTipo }),
  });

  const createMut = useMutation({
    mutationFn: createMidiaAsset,
    onSuccess: () => {
      toast.success('Mídia cadastrada na biblioteca');
      qc.invalidateQueries({ queryKey: ['midia-assets'] });
      setPendingFile(null);
      setNovoTitulo('');
      setNovoCaption('');
      setUploadProgress(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<MidiaAsset> }) =>
      updateMidiaAsset(id, patch),
    onSuccess: () => {
      toast.success('Mídia atualizada');
      qc.invalidateQueries({ queryKey: ['midia-assets'] });
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: deleteMidiaAsset,
    onSuccess: () => {
      toast.success('Mídia removida');
      qc.invalidateQueries({ queryKey: ['midia-assets'] });
      setDeleting(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const geminiMut = useMutation({
    mutationFn: generateImageWithGemini,
    onSuccess: () => {
      toast.success('Imagem gerada e salva na biblioteca');
      qc.invalidateQueries({ queryKey: ['midia-assets'] });
      setGeminiPrompt('');
      setGeminiTitulo('');
      setGeminiCaption('');
    },
    onError: (e: Error) => toast.error(`Falha Gemini: ${e.message}`),
  });

  const handlePickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith('image/') && !f.type.startsWith('video/')) {
      toast.error('Apenas imagens e vídeos são suportados');
      return;
    }
    const limitMB = f.type.startsWith('video/') ? 100 : 10;
    if (f.size > limitMB * 1024 * 1024) {
      toast.error(`Arquivo excede ${limitMB} MB`);
      return;
    }
    setPendingFile(f);
    if (!novoTitulo) setNovoTitulo(f.name.replace(/\.[^.]+$/, ''));
  };

  const handleUpload = async () => {
    if (!pendingFile || !novoTitulo.trim()) {
      toast.error('Selecione um arquivo e dê um título');
      return;
    }
    try {
      setUploadProgress(0);
      const result = await uploadSigned(pendingFile, {
        folder: 'marketing-assets',
        tags: [novoTipo],
        onProgress: setUploadProgress,
      });
      const isVideo = result.resource_type === 'video';
      await createMut.mutateAsync({
        tipo: novoTipo,
        formato: isVideo ? 'video' : 'image',
        public_id: result.public_id,
        secure_url: result.secure_url,
        thumb_url: isVideo ? videoThumbUrl(result.secure_url) : result.secure_url,
        duration_s: result.duration ? Math.round(result.duration) : null,
        width: result.width ?? null,
        height: result.height ?? null,
        bytes: result.bytes ?? null,
        titulo: novoTitulo.trim(),
        caption: novoCaption.trim() || null,
      });
    } catch (e) {
      setUploadProgress(null);
      toast.error((e as Error).message ?? 'Falha no upload');
    }
  };

  const filtered = useMemo(
    () => (filtroTipo === 'todos' ? assets : assets.filter((a) => a.tipo === filtroTipo)),
    [assets, filtroTipo]
  );

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Biblioteca de Mídia</h1>
        <p className="text-muted-foreground">
          Imagens e vídeos hospedados no Cloudinary, usados nos status do WhatsApp e em campanhas.
        </p>
      </div>

      {/* Gemini auto-gen card */}
      <Card className="border-purple-300/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-500" />
            Gerar imagem com IA (Gemini)
          </CardTitle>
          <CardDescription>
            Descreva a imagem desejada. O Gemini gera, salvamos no Cloudinary e cadastramos na biblioteca automaticamente.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Prompt</Label>
            <Textarea
              value={geminiPrompt}
              onChange={(e) => setGeminiPrompt(e.target.value)}
              placeholder="Ex: arte minimalista, fundo gradiente roxo, ícone de cofrinho, frase 'Quitação com desconto', estilo flat, alta resolução"
              rows={3}
            />
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <Label>Título</Label>
              <Input value={geminiTitulo} onChange={(e) => setGeminiTitulo(e.target.value)} placeholder="Promo Quitação IA" />
            </div>
            <div className="space-y-1">
              <Label>Tipo</Label>
              <Select value={geminiTipo} onValueChange={(v) => setGeminiTipo(v as MidiaTipo)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPOS.filter((t) => t.value !== 'lembrete_cobranca').map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Caption (opcional)</Label>
              <Input value={geminiCaption} onChange={(e) => setGeminiCaption(e.target.value)} />
            </div>
          </div>
          <Button
            onClick={() =>
              geminiMut.mutate({
                prompt: geminiPrompt.trim(),
                titulo: geminiTitulo.trim() || undefined,
                tipo: geminiTipo,
                caption: geminiCaption.trim() || undefined,
              })
            }
            disabled={geminiMut.isPending || geminiPrompt.trim().length < 4}
            className="bg-purple-600 hover:bg-purple-700"
          >
            <Sparkles className="h-4 w-4 mr-2" />
            {geminiMut.isPending ? 'Gerando…' : 'Gerar imagem'}
          </Button>
        </CardContent>
      </Card>

      {/* Upload card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ImagePlus className="h-5 w-5" />
            Nova mídia
          </CardTitle>
          <CardDescription>
            Faça upload direto ao Cloudinary. Limite: 10 MB (imagem) / 100 MB (vídeo).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Arquivo</Label>
              <Input
                ref={fileRef}
                type="file"
                accept="image/*,video/*"
                onChange={handlePickFile}
                disabled={uploadProgress !== null}
              />
              {pendingFile && (
                <p className="text-xs text-muted-foreground">
                  {pendingFile.name} — {(pendingFile.size / 1024 / 1024).toFixed(2)} MB
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={novoTipo} onValueChange={(v) => setNovoTipo(v as MidiaTipo)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPOS.filter((t) => t.value !== 'lembrete_cobranca').map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Título</Label>
            <Input value={novoTitulo} onChange={(e) => setNovoTitulo(e.target.value)} placeholder="Ex: Promo Quitação Outubro" />
          </div>
          <div className="space-y-2">
            <Label>Legenda (caption do status)</Label>
            <Textarea value={novoCaption} onChange={(e) => setNovoCaption(e.target.value)} placeholder="Texto opcional que vai junto no status do WhatsApp" rows={2} />
          </div>
          {uploadProgress !== null && (
            <div className="space-y-1">
              <Progress value={uploadProgress} />
              <p className="text-xs text-muted-foreground">Enviando… {uploadProgress}%</p>
            </div>
          )}
          <Button
            onClick={handleUpload}
            disabled={!pendingFile || !novoTitulo.trim() || uploadProgress !== null}
          >
            {uploadProgress !== null ? 'Enviando…' : 'Fazer upload'}
          </Button>
        </CardContent>
      </Card>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <Label>Filtrar:</Label>
        <Select value={filtroTipo} onValueChange={(v) => setFiltroTipo(v as MidiaTipo | 'todos')}>
          <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            {TIPOS.map((t) => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Grid */}
      {isLoading ? (
        <p className="text-muted-foreground">Carregando…</p>
      ) : filtered.length === 0 ? (
        <p className="text-muted-foreground italic">Nenhuma mídia ainda.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((m) => (
            <Card key={m.id} className={!m.ativo ? 'opacity-60' : ''}>
              <div className="aspect-square bg-muted flex items-center justify-center overflow-hidden rounded-t-lg">
                {m.formato === 'video' ? (
                  <div className="relative w-full h-full">
                    {m.thumb_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.thumb_url} alt={m.titulo} className="w-full h-full object-cover" />
                    ) : (
                      <VideoIcon className="h-10 w-10 text-muted-foreground m-auto" />
                    )}
                    <Badge className="absolute top-2 right-2" variant="secondary">
                      {m.duration_s ? `${m.duration_s}s` : 'Vídeo'}
                    </Badge>
                  </div>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.thumb_url ?? m.secure_url} alt={m.titulo} className="w-full h-full object-cover" />
                )}
              </div>
              <CardContent className="p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium truncate" title={m.titulo}>{m.titulo}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      {m.formato === 'video' ? <VideoIcon className="h-3 w-3" /> : <ImageIcon className="h-3 w-3" />}
                      {TIPOS.find((t) => t.value === m.tipo)?.label ?? m.tipo}
                    </p>
                  </div>
                  <Switch
                    checked={m.ativo}
                    onCheckedChange={(checked) => updateMut.mutate({ id: m.id, patch: { ativo: checked } })}
                  />
                </div>
                {m.caption && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{m.caption}</p>
                )}
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => setEditing(m)}>
                    <Pencil className="h-3 w-3 mr-1" /> Editar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setDeleting(m)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar mídia</DialogTitle>
            <DialogDescription>Atualize título, descrição e legenda.</DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Título</Label>
                <Input
                  value={editing.titulo}
                  onChange={(e) => setEditing({ ...editing, titulo: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Descrição (uso interno)</Label>
                <Textarea
                  rows={2}
                  value={editing.descricao ?? ''}
                  onChange={(e) => setEditing({ ...editing, descricao: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Legenda do status</Label>
                <Textarea
                  rows={2}
                  value={editing.caption ?? ''}
                  onChange={(e) => setEditing({ ...editing, caption: e.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button
              onClick={() =>
                editing &&
                updateMut.mutate({
                  id: editing.id,
                  patch: {
                    titulo: editing.titulo,
                    descricao: editing.descricao,
                    caption: editing.caption,
                  },
                })
              }
              disabled={updateMut.isPending}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover mídia?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleting?.titulo}" será removida do catálogo. O arquivo no Cloudinary não é apagado automaticamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleting && deleteMut.mutate(deleting.id)}>
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
