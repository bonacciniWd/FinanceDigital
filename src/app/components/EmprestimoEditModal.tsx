/**
 * @module EmprestimoEditModal
 * @description Modal completo de edição de empréstimo:
 *  - Dados do contrato (valor, parcelas, taxa, datas, status)
 *  - Lista de parcelas com edição inline (valor, vencimento, status)
 *  - Auditoria (created_at, updated_at, aprovado_por, desembolsado_por)
 */
import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Loader2, Save, FileText, Calendar, History, Pencil, X, Check, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useEmprestimo, useUpdateEmprestimo } from '../hooks/useEmprestimos';
import { useParcelasByEmprestimo, useUpdateParcela } from '../hooks/useParcelas';
import { useAdminUsers } from '../hooks/useAdminUsers';
import type { EmprestimoUpdate, ParcelaUpdate } from '../lib/database.types';

interface Props {
  emprestimoId: string | null;
  onClose: () => void;
}

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

const fmtDate = (iso?: string | null) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('pt-BR');
  } catch {
    return iso;
  }
};

const fmtDateOnly = (iso?: string | null) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('pt-BR');
  } catch {
    return iso;
  }
};

export default function EmprestimoEditModal({ emprestimoId, onClose }: Props) {
  const open = !!emprestimoId;
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-3xl w-[95vw] max-h-[92vh] overflow-hidden flex flex-col p-0 gap-0">
        {emprestimoId ? <Body emprestimoId={emprestimoId} onClose={onClose} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function Body({ emprestimoId, onClose }: { emprestimoId: string; onClose: () => void }) {
  const { data: emprestimo, isLoading } = useEmprestimo(emprestimoId);
  const [tab, setTab] = useState<'dados' | 'parcelas' | 'auditoria'>('dados');

  if (isLoading || !emprestimo) {
    return (
      <div className="p-10 flex flex-col items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin" />
        <span className="text-sm">Carregando empréstimo...</span>
      </div>
    );
  }

  return (
    <>
      <DialogHeader className="px-6 pt-6 pb-4 border-b bg-background/40 shrink-0">
        <DialogTitle className="flex items-center gap-3">
          <FileText className="w-5 h-5 text-primary" />
          <div className="flex-1 min-w-0">
            <div className="text-base font-semibold">Empréstimo {fmtCurrency(emprestimo.valor)}</div>
            <div className="text-xs text-muted-foreground font-normal mt-0.5">
              {emprestimo.parcelas}x {fmtCurrency(emprestimo.valorParcela)} · Contrato {fmtDateOnly(emprestimo.dataContrato)}
            </div>
          </div>
          <Badge
            className={
              emprestimo.status === 'quitado'
                ? 'bg-green-100 text-green-800'
                : emprestimo.status === 'inadimplente'
                ? 'bg-red-100 text-red-800'
                : 'bg-blue-100 text-blue-800'
            }
          >
            {emprestimo.status}
          </Badge>
        </DialogTitle>
      </DialogHeader>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="flex-1 flex flex-col overflow-hidden">
        <TabsList className="mx-6 mt-4 grid grid-cols-3 shrink-0">
          <TabsTrigger value="dados"><Pencil className="w-3.5 h-3.5 mr-1" />Dados</TabsTrigger>
          <TabsTrigger value="parcelas"><Calendar className="w-3.5 h-3.5 mr-1" />Parcelas</TabsTrigger>
          <TabsTrigger value="auditoria"><History className="w-3.5 h-3.5 mr-1" />Auditoria</TabsTrigger>
        </TabsList>

        <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
          <TabsContent value="dados" className="mt-0">
            <DadosTab emprestimoId={emprestimoId} onClose={onClose} />
          </TabsContent>
          <TabsContent value="parcelas" className="mt-0">
            <ParcelasTab emprestimoId={emprestimoId} />
          </TabsContent>
          <TabsContent value="auditoria" className="mt-0">
            <AuditoriaTab emprestimoId={emprestimoId} />
          </TabsContent>
        </div>
      </Tabs>
    </>
  );
}

/* ─── DADOS ──────────────────────────────────────────────── */
function DadosTab({ emprestimoId, onClose }: { emprestimoId: string; onClose: () => void }) {
  const { data: emp } = useEmprestimo(emprestimoId);
  const update = useUpdateEmprestimo();
  const [form, setForm] = useState({
    valor: '',
    parcelas: '',
    valorParcela: '',
    taxaJuros: '',
    tipoJuros: 'mensal' as 'mensal' | 'semanal' | 'diario',
    dataContrato: '',
    proximoVencimento: '',
    status: 'ativo' as 'ativo' | 'quitado' | 'inadimplente',
  });

  useEffect(() => {
    if (!emp) return;
    setForm({
      valor: String(emp.valor ?? ''),
      parcelas: String(emp.parcelas ?? ''),
      valorParcela: String(emp.valorParcela ?? ''),
      taxaJuros: String(emp.taxaJuros ?? ''),
      tipoJuros: (emp.tipoJuros as typeof form.tipoJuros) ?? 'mensal',
      dataContrato: emp.dataContrato?.slice(0, 10) ?? '',
      proximoVencimento: emp.proximoVencimento?.slice(0, 10) ?? '',
      status: (emp.status as typeof form.status) ?? 'ativo',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emp?.id]);

  if (!emp) return null;

  const handleSave = async () => {
    const updates: EmprestimoUpdate = {
      valor: Number(form.valor) || 0,
      parcelas: Number(form.parcelas) || 1,
      valor_parcela: Number(form.valorParcela) || 0,
      taxa_juros: Number(form.taxaJuros) || 0,
      tipo_juros: form.tipoJuros as EmprestimoUpdate['tipo_juros'],
      data_contrato: form.dataContrato,
      proximo_vencimento: form.proximoVencimento,
      status: form.status,
    };
    try {
      await update.mutateAsync({ id: emprestimoId, data: updates });
      toast.success('Empréstimo atualizado');
      onClose();
    } catch (err) {
      toast.error('Erro: ' + (err as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Valor total">
          <Input type="number" step="0.01" value={form.valor} onChange={(e) => setForm((f) => ({ ...f, valor: e.target.value }))} />
        </Field>
        <Field label="Parcelas">
          <Input type="number" min="1" value={form.parcelas} onChange={(e) => setForm((f) => ({ ...f, parcelas: e.target.value }))} />
        </Field>
        <Field label="Valor por parcela">
          <Input type="number" step="0.01" value={form.valorParcela} onChange={(e) => setForm((f) => ({ ...f, valorParcela: e.target.value }))} />
        </Field>
        <Field label="Taxa de juros (%)">
          <Input type="number" step="0.01" value={form.taxaJuros} onChange={(e) => setForm((f) => ({ ...f, taxaJuros: e.target.value }))} />
        </Field>
        <Field label="Tipo de juros">
          <Select value={form.tipoJuros} onValueChange={(v) => setForm((f) => ({ ...f, tipoJuros: v as typeof f.tipoJuros }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="diario">Diária</SelectItem>
              <SelectItem value="semanal">Semanal</SelectItem>
              <SelectItem value="mensal">Mensal</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Status">
          <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as typeof f.status }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ativo">Ativo</SelectItem>
              <SelectItem value="quitado">Quitado</SelectItem>
              <SelectItem value="inadimplente">Inadimplente</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Data do contrato">
          <Input type="date" value={form.dataContrato} onChange={(e) => setForm((f) => ({ ...f, dataContrato: e.target.value }))} />
        </Field>
        <Field label="Próximo vencimento">
          <Input type="date" value={form.proximoVencimento} onChange={(e) => setForm((f) => ({ ...f, proximoVencimento: e.target.value }))} />
        </Field>
      </div>

      <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
        <span>
          Editar valor/parcelas <strong>não recria</strong> as parcelas existentes — use a aba <strong>Parcelas</strong> para ajustar valores e datas individualmente.
        </span>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onClose}>Fechar</Button>
        <Button onClick={handleSave} disabled={update.isPending}>
          {update.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Salvar
        </Button>
      </div>
    </div>
  );
}

/* ─── PARCELAS ───────────────────────────────────────────── */
function ParcelasTab({ emprestimoId }: { emprestimoId: string }) {
  const { data: parcelas = [], isLoading } = useParcelasByEmprestimo(emprestimoId);
  const updateParcela = useUpdateParcela();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValor, setEditValor] = useState('');
  const [editVenc, setEditVenc] = useState('');
  const [editStatus, setEditStatus] = useState<'pendente' | 'paga' | 'vencida' | 'cancelada'>('pendente');

  const startEdit = (p: typeof parcelas[number]) => {
    setEditingId(p.id);
    setEditValor(String(p.valor));
    setEditVenc(p.dataVencimento?.slice(0, 10) ?? '');
    setEditStatus(p.status as typeof editStatus);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const updates: ParcelaUpdate = {
      valor: Number(editValor) || 0,
      data_vencimento: editVenc,
      status: editStatus,
    };
    try {
      await updateParcela.mutateAsync({ id: editingId, data: updates });
      toast.success('Parcela atualizada');
      setEditingId(null);
    } catch (err) {
      toast.error('Erro: ' + (err as Error).message);
    }
  };

  if (isLoading) return <Loader2 className="w-4 h-4 animate-spin mx-auto" />;
  if (parcelas.length === 0) {
    return <div className="text-sm text-muted-foreground text-center py-8">Nenhuma parcela encontrada</div>;
  }

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      paga: 'bg-green-100 text-green-800',
      vencida: 'bg-red-100 text-red-800',
      pendente: 'bg-blue-100 text-blue-800',
      cancelada: 'bg-gray-100 text-gray-800',
    };
    return <Badge className={map[s] || ''}>{s}</Badge>;
  };

  return (
    <div className="space-y-2">
      {parcelas.map((p) => {
        const isEditing = editingId === p.id;
        return (
          <div key={p.id} className="border rounded-lg p-3">
            {isEditing ? (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
                <Field label={`Parcela ${p.numero} — valor`}>
                  <Input type="number" step="0.01" value={editValor} onChange={(e) => setEditValor(e.target.value)} />
                </Field>
                <Field label="Vencimento">
                  <Input type="date" value={editVenc} onChange={(e) => setEditVenc(e.target.value)} />
                </Field>
                <Field label="Status">
                  <Select value={editStatus} onValueChange={(v) => setEditStatus(v as typeof editStatus)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pendente">Pendente</SelectItem>
                      <SelectItem value="paga">Paga</SelectItem>
                      <SelectItem value="vencida">Vencida</SelectItem>
                      <SelectItem value="cancelada">Cancelada</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <div className="flex gap-1">
                  <Button size="sm" onClick={saveEdit} disabled={updateParcela.isPending}>
                    {updateParcela.isPending ? <Loader2 className="w-3 h-3" /> : <Check className="w-3 h-3" />}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-xs font-mono text-muted-foreground w-8">#{p.numero}</span>
                <span className="text-sm font-semibold w-28">{fmtCurrency(p.valor)}</span>
                <span className="text-xs text-muted-foreground w-24">{fmtDateOnly(p.dataVencimento)}</span>
                {statusBadge(p.status)}
                {p.dataPagamento && (
                  <span className="text-[10px] text-green-700 dark:text-green-400">
                    Pago em {fmtDateOnly(p.dataPagamento)}
                  </span>
                )}
                {p.juros > 0 && <span className="text-[10px] text-orange-600">+{fmtCurrency(p.juros)} juros</span>}
                {p.multa > 0 && <span className="text-[10px] text-red-600">+{fmtCurrency(p.multa)} multa</span>}
                <Button size="sm" variant="ghost" className="ml-auto h-7" onClick={() => startEdit(p)}>
                  <Pencil className="w-3 h-3" />
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─── AUDITORIA ──────────────────────────────────────────── */
function AuditoriaTab({ emprestimoId }: { emprestimoId: string }) {
  const { data: emp } = useEmprestimo(emprestimoId);
  const { data: users = [] } = useAdminUsers();

  const userById = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of users as Array<{ id: string; name?: string; email?: string }>) {
      m.set(u.id, u.name || u.email || u.id);
    }
    return m;
  }, [users]);

  if (!emp) return null;

  const rows: Array<{ label: string; value: string }> = [
    { label: 'ID', value: emp.id },
    { label: 'Aprovado por', value: emp.aprovadoPor ? userById.get(emp.aprovadoPor) ?? emp.aprovadoPor : '—' },
    { label: 'Aprovado em', value: fmtDate(emp.aprovadoEm) },
    { label: 'Desembolsado', value: emp.desembolsado ? 'Sim' : 'Não' },
    { label: 'Desembolsado em', value: fmtDate(emp.desembolsadoEm) },
    { label: 'Vendedor', value: emp.vendedorId ? userById.get(emp.vendedorId) ?? emp.vendedorId : '—' },
    { label: 'Cobrador', value: emp.cobradorId ? userById.get(emp.cobradorId) ?? emp.cobradorId : '—' },
    { label: 'Gateway', value: emp.gateway || '—' },
    { label: 'Skip verification', value: emp.skipVerification ? 'Sim' : 'Não' },
  ];

  return (
    <div className="space-y-1">
      {rows.map((r) => (
        <div key={r.label} className="flex justify-between gap-3 py-1.5 border-b text-sm">
          <span className="text-muted-foreground">{r.label}</span>
          <span className="font-medium text-right break-all">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

/* ─── helpers ────────────────────────────────────────────── */
function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-1 ${className ?? ''}`}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
