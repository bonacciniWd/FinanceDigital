/**
 * Card de configuração de comissões (nova arquitetura — 1.10.0).
 *
 * Substitui `ComissoesSemanaisCard`. Lê e edita `comissoes_config`,
 * com 3 seções:
 *
 *   1. Cobradores Kanban (N1 / N2 / N3 / N4) — múltiplos usuários por nível.
 *      Cada usuário tem seu próprio %, totalmente independente dos outros.
 *      N1/N2 usam (% acordos + % parcelas), N3/N4 usam
 *      (% acordo-parcela + % empréstimo-em-dia).
 *   2. Gerente — % sobre total de entradas da semana.
 *   3. Dono — % sobre total de entradas da semana.
 *
 * O cálculo dos valores efetivos por funcionário fica em Fase 3 (engine
 * separado). Aqui apenas CRUD das regras + preview do total estimado.
 */
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Loader2, Calculator } from 'lucide-react';

import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { Badge } from './ui/badge';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table';

import {
  useComissoesConfigs,
  useUpsertComissaoConfig,
  useDeleteComissaoConfig,
} from '../hooks/useComissoesConfig';
import { useComissoesCalculo } from '../hooks/useComissoesCalculo';
import { useAdminUsers } from '../hooks/useAdminUsers';
import {
  type ComissaoConfig,
  type ComissaoConfigInput,
  type TipoComissaoConfig,
  type GrupoCobrancaConfig,
  camposPctRelevantes,
  descreverConfig,
  grupoDeNivel,
  nivelCanonicoDoGrupo,
  novaConfigPadrao,
} from '../lib/comissoes-config';

const fmtBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

const PCT_LABEL: Record<string, string> = {
  pctSobreAcordos: '% sobre acordos',
  pctSobreParcelas: '% sobre parcelas pagas',
  pctSobreAcordoParcela: '% sobre cada parcela de acordo',
  pctSobreEmprestimoEmDia: '% sobre empréstimo criado/pago em dia',
  pctSobreTotalEntradas: '% sobre total de entradas',
};

interface Props {
  /** Total de entradas no período (R$) — usado para preview/cálculo gerente/dono. */
  totalEntradas: number;
  /** Rótulo do período (ex.: "12/01 a 18/01") apenas para exibição. */
  periodoLabel?: string;
  /** Período YYYY-MM-DD para rodar o engine de cálculo. */
  inicio?: string;
  fim?: string;
}

export function ComissoesConfigCard({ totalEntradas, periodoLabel, inicio, fim }: Props) {
  const { data: configs = [], isLoading } = useComissoesConfigs();
  const { data: users = [] } = useAdminUsers();
  const upsert = useUpsertComissaoConfig();
  const remove = useDeleteComissaoConfig();

  // Engine de cálculo — só roda se período disponível.
  const { data: resultados = [] } = useComissoesCalculo({
    inicio: inicio ?? '',
    fim: fim ?? '',
    totalEntradas,
  });
  const valorPorUserId = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of resultados) m.set(r.userId, r.total);
    return m;
  }, [resultados]);

  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<ComissaoConfig | null>(null);
  const [form, setForm] = useState<ComissaoConfigInput>(novaConfigPadrao('kanban_nivel'));
  const [dialogEl, setDialogEl] = useState<HTMLDivElement | null>(null);

  // ── Agrupamentos para renderização (N1+N2 e N3+N4 unificados) ───
  // Dentro de cada grupo, deduplicamos por userId: se um user tem configs
  // tanto em n1 quanto em n2 (legado), apenas a primeira aparece (a outra
  // é ignorada pelo engine de cobrança por grupo).
  const kanbanByGrupo = useMemo(() => {
    const map = new Map<GrupoCobrancaConfig, ComissaoConfig[]>([
      ['early', []],
      ['late', []],
    ]);
    const seen = new Map<GrupoCobrancaConfig, Set<string>>([
      ['early', new Set()],
      ['late', new Set()],
    ]);
    for (const c of configs) {
      if (c.tipo !== 'kanban_nivel') continue;
      const g = grupoDeNivel(c.nivelKanban);
      if (!g) continue;
      const key = `${c.userId ?? '—'}`;
      if (seen.get(g)?.has(key)) continue;
      seen.get(g)?.add(key);
      map.get(g)?.push(c);
    }
    return map;
  }, [configs]);

  const gerenteConfigs = configs.filter((c) => c.tipo === 'gerente_pct');
  const donoConfigs = configs.filter((c) => c.tipo === 'dono_pct');

  // ── Handlers ───────────────────────────────────────────────
  function openCreate(tipo: TipoComissaoConfig, grupo?: GrupoCobrancaConfig) {
    setEditing(null);
    const base = novaConfigPadrao(tipo);
    if (tipo === 'kanban_nivel') {
      base.nivelKanban = nivelCanonicoDoGrupo(grupo ?? 'early');
    }
    setForm(base);
    setShowDialog(true);
  }

  function openEdit(c: ComissaoConfig) {
    setEditing(c);
    setForm({
      tipo: c.tipo,
      nivelKanban: c.nivelKanban,
      userId: c.userId,
      pesoPct: c.pesoPct,
      pctSobreAcordos: c.pctSobreAcordos,
      pctSobreParcelas: c.pctSobreParcelas,
      pctSobreAcordoParcela: c.pctSobreAcordoParcela,
      pctSobreEmprestimoEmDia: c.pctSobreEmprestimoEmDia,
      pctSobreTotalEntradas: c.pctSobreTotalEntradas,
      ativo: c.ativo,
      observacao: c.observacao,
    });
    setShowDialog(true);
  }

  async function save() {
    // Dono pode existir sem usuário vinculado.
    if (form.tipo !== 'dono_pct' && !form.userId) {
      toast.error('Selecione um usuário');
      return;
    }
    if (form.tipo === 'kanban_nivel' && !form.nivelKanban) {
      toast.error('Selecione o nível do Kanban');
      return;
    }
    try {
      await upsert.mutateAsync({ id: editing?.id, ...form });
      toast.success(editing ? 'Regra atualizada' : 'Regra criada');
      setShowDialog(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'desconhecido';
      toast.error('Erro: ' + msg);
    }
  }

  async function handleDelete(c: ComissaoConfig) {
    const label = `${descreverConfig(c.tipo, c.nivelKanban)} — ${c.userNome ?? c.userId ?? 'Dono'}`;
    if (!confirm(`Remover "${label}"?`)) return;
    try {
      await remove.mutateAsync(c.id);
      toast.success('Regra removida');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'desconhecido';
      toast.error('Erro: ' + msg);
    }
  }

  // ── Preview gerente/dono usa o engine se rodou; senão fallback ao pct ──
  function previewValor(c: ComissaoConfig): number {
    const key = c.userId ?? '__dono__';
    const calc = valorPorUserId.get(key);
    if (calc !== undefined && calc > 0) return calc;
    if (c.tipo === 'gerente_pct' || c.tipo === 'dono_pct') {
      return totalEntradas * (c.pctSobreTotalEntradas / 100);
    }
    return 0;
  }

  // ── UI Helpers ─────────────────────────────────────────────
  const pctCampos = camposPctRelevantes(form.tipo, form.nivelKanban);

  function renderUsuarioBadge(c: ComissaoConfig) {
    const sigla = c.userSigla ? <Badge variant="secondary" className="text-xs">{c.userSigla}</Badge> : null;
    const inativo = !c.ativo ? <Badge variant="outline" className="ml-1">inativo</Badge> : null;
    const nome = c.userNome ?? (c.tipo === 'dono_pct' && !c.userId ? 'Dono (sem usuário)' : '—');
    return (
      <span className="flex items-center gap-1">
        <span className="font-medium">{nome}</span>
        {sigla}
        {inativo}
      </span>
    );
  }

  function renderPctSummary(c: ComissaoConfig) {
    const campos = camposPctRelevantes(c.tipo, c.nivelKanban);
    return (
      <span className="text-sm text-muted-foreground">
        {campos.map((k) => `${PCT_LABEL[k]}: ${Number(c[k]).toFixed(2)}%`).join(' · ')}
      </span>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            Comissões da semana (atribuição por papel)
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Cobradores por nível do Kanban, gerente e dono.{' '}
            {periodoLabel ? <>Período: <strong>{periodoLabel}</strong>.</> : null}{' '}
            Total entradas: <strong>{fmtBRL(totalEntradas)}</strong>.
          </p>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* ── Seção 1: Cobradores Kanban (N1+N2 e N3+N4) ───── */}
        {(['early', 'late'] as GrupoCobrancaConfig[]).map((grupo) => {
          const itens = kanbanByGrupo.get(grupo) ?? [];
          const titulo = grupo === 'early' ? 'Recente (N1+N2, 1-30d)' : 'Antigo (N3+N4, 31d+)';
          const color = grupo === 'early' ? '#f59e0b' : '#dc2626';
          return (
            <section key={grupo}>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold uppercase text-muted-foreground">
                  Cobradores — {titulo}
                </h3>
                <Button size="sm" variant="outline" onClick={() => openCreate('kanban_nivel', grupo)}>
                  <Plus className="mr-1 h-3 w-3" /> Adicionar
                </Button>
              </div>
              {itens.length === 0 ? (
                <p className="text-sm italic text-muted-foreground">
                  Nenhum cobrador atribuído a {titulo}.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[80px]">Grupo</TableHead>
                      <TableHead>Usuário</TableHead>
                      <TableHead>Percentuais</TableHead>
                      <TableHead className="w-[120px] text-right">Valor calc.</TableHead>
                      <TableHead className="w-[120px] text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {itens.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell>
                          <Badge style={{ backgroundColor: color, color: '#fff' }}>
                            {grupo === 'early' ? 'N1+N2' : 'N3+N4'}
                          </Badge>
                        </TableCell>
                        <TableCell>{renderUsuarioBadge(c)}</TableCell>
                        <TableCell>{renderPctSummary(c)}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium">
                          {fmtBRL(valorPorUserId.get(c.userId ?? '__dono__') ?? 0)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="icon" variant="ghost" onClick={() => openEdit(c)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => handleDelete(c)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </section>
          );
        })}

        {/* ── Seção 2: Gerente ──────────────────────────────── */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase text-muted-foreground">Gerente</h3>
            <Button size="sm" variant="outline" onClick={() => openCreate('gerente_pct')}>
              <Plus className="mr-1 h-3 w-3" /> Adicionar gerente
            </Button>
          </div>
          {gerenteConfigs.length === 0 ? (
            <p className="text-sm italic text-muted-foreground">Nenhum gerente configurado.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuário</TableHead>
                  <TableHead className="text-right">% Entradas</TableHead>
                  <TableHead className="text-right">Preview</TableHead>
                  <TableHead className="w-[120px] text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {gerenteConfigs.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>{renderUsuarioBadge(c)}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.pctSobreTotalEntradas.toFixed(2)}%</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{fmtBRL(previewValor(c))}</TableCell>
                    <TableCell className="text-right">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(c)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => handleDelete(c)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>

        {/* ── Seção 3: Dono ────────────────────────────────── */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase text-muted-foreground">Dono</h3>
            <Button size="sm" variant="outline" onClick={() => openCreate('dono_pct')}>
              <Plus className="mr-1 h-3 w-3" /> Adicionar dono
            </Button>
          </div>
          {donoConfigs.length === 0 ? (
            <p className="text-sm italic text-muted-foreground">Nenhum dono configurado.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuário</TableHead>
                  <TableHead className="text-right">% Entradas</TableHead>
                  <TableHead className="text-right">Preview</TableHead>
                  <TableHead className="w-[120px] text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {donoConfigs.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>{renderUsuarioBadge(c)}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.pctSobreTotalEntradas.toFixed(2)}%</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{fmtBRL(previewValor(c))}</TableCell>
                    <TableCell className="text-right">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(c)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => handleDelete(c)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>
      </CardContent>

      {/* ── Dialog ────────────────────────────────────────── */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent ref={setDialogEl} className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing ? 'Editar regra de comissão' : 'Nova regra de comissão'}
              {' — '}
              <span className="text-sm font-normal text-muted-foreground">
                {descreverConfig(form.tipo, form.nivelKanban)}
              </span>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {/* Tipo (somente leitura ao editar) */}
            <div>
              <Label>Tipo</Label>
              <Select
                value={form.tipo}
                onValueChange={(v) => {
                  const tipo = v as TipoComissaoConfig;
                  setForm(novaConfigPadrao(tipo, form.userId));
                }}
                disabled={!!editing}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent position="popper" container={dialogEl}>
                  <SelectItem value="kanban_nivel">Cobrador (Kanban N1/N2/N3/N4)</SelectItem>
                  <SelectItem value="gerente_pct">Gerente</SelectItem>
                  <SelectItem value="dono_pct">Dono</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Grupo (N1+N2 / N3+N4) */}
            {form.tipo === 'kanban_nivel' && (
              <div>
                <Label>Grupo</Label>
                <Select
                  value={grupoDeNivel(form.nivelKanban) ?? 'early'}
                  onValueChange={(v) =>
                    setForm({ ...form, nivelKanban: nivelCanonicoDoGrupo(v as GrupoCobrancaConfig) })
                  }
                >
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent position="popper" container={dialogEl}>
                    <SelectItem value="early">Recente (N1+N2, 1-30 dias)</SelectItem>
                    <SelectItem value="late">Antigo (N3+N4, 31+ dias)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Usuário — não exigido para Dono */}
            {form.tipo !== 'dono_pct' && (
              <div>
                <Label>Usuário</Label>
                <Select
                  value={form.userId ?? ''}
                  onValueChange={(v) => setForm({ ...form, userId: v })}
                >
                  <SelectTrigger><SelectValue placeholder="Selecione um usuário" /></SelectTrigger>
                  <SelectContent position="popper" container={dialogEl}>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name} {u.sigla ? `(${u.sigla})` : ''} — {u.role}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Percentuais relevantes */}
            <div className="grid grid-cols-2 gap-3">
              {pctCampos.map((k) => (
                <div key={k}>
                  <Label>{PCT_LABEL[k]}</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    value={form[k]}
                    onChange={(e) => setForm({ ...form, [k]: parseFloat(e.target.value) || 0 })}
                  />
                </div>
              ))}
            </div>

            {/* Ativo + Observação */}
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <Label>Ativo</Label>
              <Switch checked={form.ativo} onCheckedChange={(v) => setForm({ ...form, ativo: v })} />
            </div>
            <div>
              <Label>Observação</Label>
              <Input
                value={form.observacao ?? ''}
                onChange={(e) => setForm({ ...form, observacao: e.target.value || null })}
                placeholder="Opcional"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancelar</Button>
            <Button onClick={save} disabled={upsert.isPending}>
              {upsert.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
