/**
 * @page AgendadorStatusPage
 * @description Agendador semanal de posts em status do WhatsApp.
 *
 * UI:
 *   - Tabela com colunas dia da semana × horários cadastrados.
 *   - Form para criar novo slot (dia, hora:minuto, instância, mídia).
 *   - Toggle ativo/inativo.
 *   - Histórico das últimas execuções (status_post_log).
 *
 * O cron `cron-post-status` processa os slots a cada 15 min.
 */
import { useMemo, useState } from 'react';
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
import { Badge } from '../components/ui/badge';
import { Switch } from '../components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { Textarea } from '../components/ui/textarea';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../components/ui/tabs';
import { Trash2, CalendarClock, CheckCircle2, AlertCircle, Sparkles, Image as ImageIcon } from 'lucide-react';
import {
  listSchedule,
  createSlot,
  updateSlot,
  deleteSlot,
  listLog,
} from '../services/statusScheduleService';
import { listMidiaAssets } from '../services/midiaAssetsService';
import { getInstancias } from '../services/whatsappService';

const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

export default function AgendadorStatusPage() {
  const qc = useQueryClient();
  const [novoDia, setNovoDia] = useState<number>(1);
  const [novaHora, setNovaHora] = useState<number>(9);
  const [novoMinuto, setNovoMinuto] = useState<number>(0);
  const [novaInstancia, setNovaInstancia] = useState<string>('');
  const [novaMidia, setNovaMidia] = useState<string>('');
  const [modo, setModo] = useState<'biblioteca' | 'auto'>('biblioteca');
  const [novoPrompt, setNovoPrompt] = useState('');
  const [novoCaption, setNovoCaption] = useState('');
  const [regenerarSempre, setRegenerarSempre] = useState(true);

  const { data: schedule = [] } = useQuery({ queryKey: ['status-schedule'], queryFn: listSchedule });
  const { data: midias = [] } = useQuery({
    queryKey: ['midia-assets', 'ativos'],
    queryFn: () => listMidiaAssets({ ativo: true }),
  });
  const { data: instancias = [] } = useQuery({
    queryKey: ['whatsapp-instancias'],
    queryFn: getInstancias,
  });
  const { data: log = [] } = useQuery({ queryKey: ['status-post-log'], queryFn: () => listLog(30) });

  const createMut = useMutation({
    mutationFn: createSlot,
    onSuccess: () => {
      toast.success('Agendamento criado');
      qc.invalidateQueries({ queryKey: ['status-schedule'] });
      setNovaMidia('');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof updateSlot>[1] }) => updateSlot(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['status-schedule'] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: deleteSlot,
    onSuccess: () => {
      toast.success('Agendamento removido');
      qc.invalidateQueries({ queryKey: ['status-schedule'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const grouped = useMemo(() => {
    const g: Record<number, typeof schedule> = {};
    for (const s of schedule) {
      g[s.dia_semana] ??= [];
      g[s.dia_semana].push(s);
    }
    return g;
  }, [schedule]);

  const handleCreate = () => {
    if (!novaInstancia) {
      toast.error('Selecione a instância');
      return;
    }
    if (modo === 'biblioteca' && !novaMidia) {
      toast.error('Selecione uma mídia da biblioteca');
      return;
    }
    if (modo === 'auto' && novoPrompt.trim().length < 4) {
      toast.error('Informe um prompt para o Gemini');
      return;
    }
    createMut.mutate({
      dia_semana: novoDia,
      hora: novaHora,
      minuto: novoMinuto,
      instancia_id: novaInstancia,
      midia_asset_id: modo === 'biblioteca' ? novaMidia : null,
      auto_generate: modo === 'auto',
      prompt_ia: modo === 'auto' ? novoPrompt.trim() : null,
      provedor_ia: 'gemini',
      regenerar_a_cada_post: regenerarSempre,
      caption_override: novoCaption.trim() || null,
      ativo: true,
    });
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Agendador de Status</h1>
        <p className="text-muted-foreground">
          Defina dia e horário para postar mídias automaticamente nos status do WhatsApp.
        </p>
      </div>

      <Tabs defaultValue="schedule">
        <TabsList>
          <TabsTrigger value="schedule">Agenda</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="schedule" className="space-y-6">
          {/* Novo slot */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarClock className="h-5 w-5" />
                Novo agendamento
              </CardTitle>
              <CardDescription>
                O cron varre a cada 15 min e publica os slots devidos no status do WhatsApp.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Tabs value={modo} onValueChange={(v) => setModo(v as 'biblioteca' | 'auto')}>
                <TabsList>
                  <TabsTrigger value="biblioteca">
                    <ImageIcon className="h-4 w-4 mr-1" /> Da biblioteca
                  </TabsTrigger>
                  <TabsTrigger value="auto">
                    <Sparkles className="h-4 w-4 mr-1 text-purple-500" /> Gerar com IA (Gemini)
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="biblioteca" className="pt-3">
                  <div className="space-y-1">
                    <Label>Mídia</Label>
                    <Select value={novaMidia} onValueChange={setNovaMidia}>
                      <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                      <SelectContent>
                        {midias.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            [{m.formato}] {m.titulo}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </TabsContent>

                <TabsContent value="auto" className="pt-3 space-y-3">
                  <div className="space-y-1">
                    <Label>Prompt para o Gemini</Label>
                    <Textarea
                      rows={3}
                      value={novoPrompt}
                      onChange={(e) => setNovoPrompt(e.target.value)}
                      placeholder="Ex: post de status motivacional para clientes, fundo gradiente azul, frase 'Hoje é o melhor dia para quitar', ícones financeiros, estilo flat"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <Switch checked={regenerarSempre} onCheckedChange={setRegenerarSempre} />
                    <Label className="cursor-pointer" onClick={() => setRegenerarSempre((v) => !v)}>
                      Gerar imagem nova a cada post (recomendado)
                    </Label>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Quando o cron executar este slot, vai chamar o Gemini com este prompt,
                    salvar no Cloudinary e postar.
                  </p>
                </TabsContent>
              </Tabs>

              <div className="grid gap-3 md:grid-cols-4">
                <div className="space-y-1">
                  <Label>Dia</Label>
                  <Select value={String(novoDia)} onValueChange={(v) => setNovoDia(Number(v))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DIAS.map((d, i) => (
                        <SelectItem key={i} value={String(i)}>{d}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Hora</Label>
                  <Input type="number" min={0} max={23} value={novaHora} onChange={(e) => setNovaHora(Number(e.target.value))} />
                </div>
                <div className="space-y-1">
                  <Label>Minuto</Label>
                  <Input type="number" min={0} max={59} value={novoMinuto} onChange={(e) => setNovoMinuto(Number(e.target.value))} />
                </div>
                <div className="space-y-1">
                  <Label>Instância WhatsApp</Label>
                  <Select value={novaInstancia} onValueChange={setNovaInstancia}>
                    <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                    <SelectContent>
                      {instancias.map((i) => (
                        <SelectItem key={i.id} value={i.id}>
                          {i.instance_name} ({i.status})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <Label>Legenda do status (opcional)</Label>
                <Input value={novoCaption} onChange={(e) => setNovoCaption(e.target.value)} placeholder="Texto que vai junto no status" />
              </div>
              <Button onClick={handleCreate} disabled={createMut.isPending}>
                {createMut.isPending ? 'Salvando…' : 'Adicionar agendamento'}
              </Button>
            </CardContent>
          </Card>

          {/* Tabela por dia */}
          {DIAS.map((diaNome, idx) => {
            const slots = grouped[idx] ?? [];
            if (slots.length === 0) return null;
            return (
              <Card key={idx}>
                <CardHeader>
                  <CardTitle>{diaNome}</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Horário</TableHead>
                        <TableHead>Mídia</TableHead>
                        <TableHead>Instância</TableHead>
                        <TableHead>Último post</TableHead>
                        <TableHead className="text-right">Ativo</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {slots.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell className="font-mono">
                            {String(s.hora).padStart(2, '0')}:{String(s.minuto).padStart(2, '0')}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {s.auto_generate ? (
                                <>
                                  <Sparkles className="h-4 w-4 text-purple-500" />
                                  <span className="truncate max-w-[200px] text-xs italic" title={s.prompt_ia ?? ''}>
                                    IA: {s.prompt_ia?.slice(0, 40) ?? '—'}…
                                  </span>
                                  <Badge variant="outline" className="border-purple-300 text-purple-700">
                                    {s.provedor_ia}
                                  </Badge>
                                </>
                              ) : (
                                <>
                                  {s.midia?.thumb_url && (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={s.midia.thumb_url} alt="" className="h-8 w-8 rounded object-cover" />
                                  )}
                                  <span className="truncate max-w-[180px]">{s.midia?.titulo ?? '—'}</span>
                                  <Badge variant="outline">{s.midia?.formato}</Badge>
                                </>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">{s.instancia?.instance_name ?? '—'}</TableCell>
                          <TableCell className="text-xs">
                            {s.ultimo_post_em ? (
                              <span className="flex items-center gap-1">
                                {s.ultimo_post_status === 'sucesso' ? (
                                  <CheckCircle2 className="h-3 w-3 text-green-600" />
                                ) : (
                                  <AlertCircle className="h-3 w-3 text-destructive" />
                                )}
                                {new Date(s.ultimo_post_em).toLocaleString('pt-BR')}
                              </span>
                            ) : (
                              <span className="text-muted-foreground italic">nunca</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Switch
                              checked={s.ativo}
                              onCheckedChange={(checked) =>
                                updateMut.mutate({ id: s.id, patch: { ativo: checked } })
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Button size="sm" variant="ghost" onClick={() => deleteMut.mutate(s.id)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            );
          })}
          {schedule.length === 0 && (
            <p className="text-muted-foreground italic">Nenhum agendamento cadastrado.</p>
          )}
        </TabsContent>

        <TabsContent value="historico">
          <Card>
            <CardHeader>
              <CardTitle>Últimas execuções</CardTitle>
              <CardDescription>30 eventos mais recentes do cron de status.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Quando</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Erro / Resposta</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {log.map((l: any) => (
                    <TableRow key={l.id}>
                      <TableCell className="text-xs">{new Date(l.posted_at).toLocaleString('pt-BR')}</TableCell>
                      <TableCell>
                        <Badge variant={l.status === 'sucesso' ? 'default' : l.status === 'erro' ? 'destructive' : 'secondary'}>
                          {l.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs max-w-md truncate" title={l.erro_msg ?? l.evolution_response ?? ''}>
                        {l.erro_msg ?? l.evolution_response ?? '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
