/**
 * Card de Comissões Semanais — usa regras configuradas em `comissoes_semanais_config`
 * e aplica sobre o total de entradas/saídas do período recebido por props.
 *
 * Aparece dentro da aba Comissões (Financeiro) para detalhar quem recebe o quê
 * dentro do "pote único" da categoria Pagamentos.
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
  useComissoesSemanaisConfigs,
  useUpsertComissaoConfig,
  useDeleteComissaoConfig,
} from '../hooks/useComissoesSemanais';
import {
  calcularComissoesSemanais,
  totalComissoesSemanais,
  descreverRegra,
  type TipoRegraComissao,
  type ComissaoSemanalConfig,
} from '../lib/comissoes-semanais';

const fmtBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

const TIPO_LABEL: Record<TipoRegraComissao, string> = {
  pct_entradas: '% sobre entradas',
  pct_saidas: '% sobre saídas',
  fixo: 'Valor fixo',
  fixo_pct_entradas: 'Fixo + % entradas',
  fixo_pct_saidas: 'Fixo + % saídas',
};

interface Props {
  /** Total de entradas no período (R$) */
  totalEntradas: number;
  /** Total de saídas no período (R$) */
  totalSaidas: number;
  /** Rótulo do período (ex.: "12/01 a 18/01") apenas para exibição */
  periodoLabel?: string;
}

export function ComissoesSemanaisCard({ totalEntradas, totalSaidas, periodoLabel }: Props) {
  const { data: configs = [], isLoading } = useComissoesSemanaisConfigs();
  const upsert = useUpsertComissaoConfig();
  const remove = useDeleteComissaoConfig();

  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<ComissaoSemanalConfig | null>(null);
  const [form, setForm] = useState({
    nome: '',
    tipo: 'pct_entradas' as TipoRegraComissao,
    valorPct: 0,
    valorFixo: 0,
    ativo: true,
    ordem: 0,
    observacao: '',
  });

  const calculadas = useMemo(
    () => calcularComissoesSemanais({ configs, totalEntradas, totalSaidas }),
    [configs, totalEntradas, totalSaidas],
  );
  const total = totalComissoesSemanais(calculadas);

  function openCreate() {
    setEditing(null);
    setForm({ nome: '', tipo: 'pct_entradas', valorPct: 0, valorFixo: 0, ativo: true, ordem: configs.length, observacao: '' });
    setShowDialog(true);
  }

  function openEdit(c: ComissaoSemanalConfig) {
    setEditing(c);
    setForm({
      nome: c.nome,
      tipo: c.tipo,
      valorPct: c.valorPct,
      valorFixo: c.valorFixo,
      ativo: c.ativo,
      ordem: c.ordem,
      observacao: c.observacao ?? '',
    });
    setShowDialog(true);
  }

  async function save() {
    if (!form.nome.trim()) {
      toast.error('Nome é obrigatório');
      return;
    }
    try {
      await upsert.mutateAsync({
        id: editing?.id,
        nome: form.nome,
        tipo: form.tipo,
        valorPct: Number(form.valorPct) || 0,
        valorFixo: Number(form.valorFixo) || 0,
        ativo: form.ativo,
        ordem: Number(form.ordem) || 0,
        observacao: form.observacao || null,
      });
      toast.success(editing ? 'Regra atualizada' : 'Regra criada');
      setShowDialog(false);
    } catch (err: any) {
      toast.error('Erro: ' + (err?.message || 'desconhecido'));
    }
  }

  async function handleDelete(id: string, nome: string) {
    if (!confirm(`Remover a regra de "${nome}"?`)) return;
    try {
      await remove.mutateAsync(id);
      toast.success('Regra removida');
    } catch (err: any) {
      toast.error('Erro: ' + (err?.message || 'desconhecido'));
    }
  }

  const tipoUsaPct = form.tipo !== 'fixo';
  const tipoUsaFixo = form.tipo === 'fixo' || form.tipo === 'fixo_pct_entradas' || form.tipo === 'fixo_pct_saidas';

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            Salários da semana (regras por funcionário)
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Detalha quem recebe dentro do "pote" da categoria Pagamentos.{' '}
            {periodoLabel ? <>Período: <strong>{periodoLabel}</strong>.</> : null}{' '}
            Base: entradas <strong>{fmtBRL(totalEntradas)}</strong> · saídas <strong>{fmtBRL(totalSaidas)}</strong>.
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Nova regra
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
          </div>
        ) : configs.length === 0 ? (
          <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            Nenhuma regra cadastrada. Sugestões iniciais:
            <ul className="ml-5 mt-2 list-disc space-y-0.5">
              <li>SL — 8% das entradas</li>
              <li>dazl — 6% das entradas</li>
              <li>SP — 3% das entradas</li>
              <li>Grego — R$ 500 fixo/semana</li>
              <li>Apoio — R$ 300 fixo + 1% das saídas</li>
            </ul>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Funcionário</TableHead>
                <TableHead>Regra</TableHead>
                <TableHead className="text-right">Base</TableHead>
                <TableHead className="text-right">Valor da semana</TableHead>
                <TableHead className="w-[120px] text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {calculadas.map((c) => {
                const cfg = configs.find((x) => x.id === c.configId);
                return (
                  <TableRow key={c.configId}>
                    <TableCell className="font-medium">
                      {c.nome}
                      {cfg && !cfg.ativo ? <Badge variant="outline" className="ml-2">inativo</Badge> : null}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{c.descricaoRegra}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {c.tipo === 'fixo' ? '—' : fmtBRL(c.base)}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {fmtBRL(c.valorCalculado)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => cfg && openEdit(cfg)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(c.configId, c.nome)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {/* Inativos não aparecem em calculadas — mostrá-los como linha mais leve */}
              {configs.filter((c) => !c.ativo).map((c) => (
                <TableRow key={c.id} className="opacity-50">
                  <TableCell className="font-medium">
                    {c.nome} <Badge variant="outline" className="ml-2">inativo</Badge>
                  </TableCell>
                  <TableCell className="text-sm">{descreverRegra(c)}</TableCell>
                  <TableCell className="text-right">—</TableCell>
                  <TableCell className="text-right">—</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(c)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(c.id, c.nome)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell colSpan={3} className="text-right font-semibold">
                  Total da semana
                </TableCell>
                <TableCell className="text-right font-bold tabular-nums">{fmtBRL(total)}</TableCell>
                <TableCell />
              </TableRow>
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar regra' : 'Nova regra de comissão semanal'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome do funcionário</Label>
              <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Ex.: SL, dazl, SP, Grego, Apoio" />
            </div>
            <div>
              <Label>Tipo de regra</Label>
              <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v as TipoRegraComissao })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TIPO_LABEL).map(([k, label]) => (
                    <SelectItem key={k} value={k}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {tipoUsaFixo && (
                <div>
                  <Label>Valor fixo (R$)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.valorFixo}
                    onChange={(e) => setForm({ ...form, valorFixo: parseFloat(e.target.value) || 0 })}
                  />
                </div>
              )}
              {tipoUsaPct && (
                <div>
                  <Label>Percentual (%)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.valorPct}
                    onChange={(e) => setForm({ ...form, valorPct: parseFloat(e.target.value) || 0 })}
                  />
                </div>
              )}
            </div>
            <div>
              <Label>Ordem (exibição)</Label>
              <Input
                type="number"
                value={form.ordem}
                onChange={(e) => setForm({ ...form, ordem: parseInt(e.target.value) || 0 })}
              />
            </div>
            <div>
              <Label>Observação</Label>
              <Input value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} placeholder="(opcional)" />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.ativo} onCheckedChange={(v) => setForm({ ...form, ativo: v })} />
              <Label className="cursor-pointer" onClick={() => setForm({ ...form, ativo: !form.ativo })}>Ativo</Label>
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
