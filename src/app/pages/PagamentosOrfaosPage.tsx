/**
 * @module PagamentosOrfaosPage
 * @description Lista pagamentos PIX recebidos sem vínculo automático com parcela.
 *  Permite vincular manualmente a uma parcela ou ignorar.
 *  Origem: webhook-efi/woovi quando charge.parcela_id é nulo, charge não existe,
 *  ou múltiplas parcelas batem dentro do threshold.
 *
 * @route /pagamentos/orfaos
 * @access admin, gerencia, cobranca
 */
import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog';
import { Alert, AlertDescription } from '../components/ui/alert';
import { AlertTriangle, CheckCircle2, Search, X, Link2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type Status = 'nao_conciliado' | 'conciliado_auto' | 'conciliado_manual' | 'ignorado';

interface Orfao {
  id: string;
  valor: number;
  e2e_id: string | null;
  txid: string | null;
  cpf_pagador: string | null;
  nome_pagador: string | null;
  recebido_em: string;
  gateway: string | null;
  cliente_id: string | null;
  parcela_id_match: string | null;
  candidatas: string[] | null;
  status: Status;
  observacao: string | null;
  cliente?: { nome: string; cpf: string | null } | null;
}

interface ParcelaCand {
  id: string;
  numero: number;
  valor: number;
  juros: number;
  multa: number;
  desconto: number;
  data_vencimento: string;
  status: string;
  cliente_id: string;
  cliente?: { nome: string } | null;
}

const fmtBRL = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

export default function PagamentosOrfaosPage() {
  const [orfaos, setOrfaos] = useState<Orfao[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState<Status | 'todos'>('nao_conciliado');
  const [busca, setBusca] = useState('');
  const [vincularOrfao, setVincularOrfao] = useState<Orfao | null>(null);

  const carregar = async () => {
    setLoading(true);
    let q = supabase
      .from('pagamentos_orfaos')
      .select('*, cliente:clientes(nome, cpf)')
      .order('recebido_em', { ascending: false })
      .limit(500);
    if (filtroStatus !== 'todos') q = q.eq('status', filtroStatus);
    const { data, error } = await q;
    if (error) {
      toast.error('Erro ao carregar pagamentos órfãos: ' + error.message);
      setLoading(false);
      return;
    }
    setOrfaos((data as unknown as Orfao[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    carregar();
  }, [filtroStatus]);

  const filtrados = useMemo(() => {
    if (!busca.trim()) return orfaos;
    const t = busca.toLowerCase();
    return orfaos.filter((o) =>
      (o.nome_pagador || '').toLowerCase().includes(t) ||
      (o.cpf_pagador || '').includes(t) ||
      (o.cliente?.nome || '').toLowerCase().includes(t) ||
      (o.txid || '').includes(t),
    );
  }, [orfaos, busca]);

  const totals = useMemo(() => {
    return {
      total: orfaos.length,
      naoConciliado: orfaos.filter((o) => o.status === 'nao_conciliado').length,
      valorPendente: orfaos.filter((o) => o.status === 'nao_conciliado').reduce((s, o) => s + Number(o.valor || 0), 0),
    };
  }, [orfaos]);

  const ignorar = async (id: string) => {
    const { error } = await supabase
      .from('pagamentos_orfaos')
      .update({ status: 'ignorado', conciliado_em: new Date().toISOString() })
      .eq('id', id);
    if (error) return toast.error(error.message);
    toast.success('Marcado como ignorado');
    carregar();
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <AlertTriangle className="w-6 h-6 text-amber-500" />
          Pagamentos Órfãos
        </h1>
        <p className="text-sm text-muted-foreground">
          PIX recebidos sem vínculo automático com parcela. Vincule manualmente ou ignore.
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{totals.total}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Aguardando ação</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-amber-600">{totals.naoConciliado}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Valor pendente</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{fmtBRL(totals.valorPendente)}</p></CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-6 flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px]">
            <Label className="text-xs">Buscar (nome, CPF, txid)</Label>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input className="pl-8" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Digite para filtrar..." />
            </div>
          </div>
          <div className="w-48">
            <Label className="text-xs">Status</Label>
            <Select value={filtroStatus} onValueChange={(v) => setFiltroStatus(v as Status | 'todos')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="nao_conciliado">Não conciliado</SelectItem>
                <SelectItem value="conciliado_auto">Conciliado auto</SelectItem>
                <SelectItem value="conciliado_manual">Conciliado manual</SelectItem>
                <SelectItem value="ignorado">Ignorado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" onClick={carregar}>Recarregar</Button>
        </CardContent>
      </Card>

      {/* Lista */}
      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-8">Carregando...</p>
          ) : filtrados.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhum pagamento órfão encontrado.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-left">Recebido em</th>
                    <th className="px-3 py-2 text-left">Pagador</th>
                    <th className="px-3 py-2 text-left">Cliente identificado</th>
                    <th className="px-3 py-2 text-right">Valor</th>
                    <th className="px-3 py-2 text-left">Gateway</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map((o) => (
                    <tr key={o.id} className="border-t">
                      <td className="px-3 py-2">{format(new Date(o.recebido_em), 'dd/MM HH:mm', { locale: ptBR })}</td>
                      <td className="px-3 py-2">
                        <div className="font-medium">{o.nome_pagador || '—'}</div>
                        <div className="text-xs text-muted-foreground">{o.cpf_pagador || '—'}</div>
                      </td>
                      <td className="px-3 py-2">{o.cliente?.nome || (o.cliente_id ? '(id)' : <span className="text-muted-foreground">—</span>)}</td>
                      <td className="px-3 py-2 text-right font-semibold">{fmtBRL(o.valor)}</td>
                      <td className="px-3 py-2"><Badge variant="outline" className="text-[10px] uppercase">{o.gateway || '—'}</Badge></td>
                      <td className="px-3 py-2">
                        {o.status === 'nao_conciliado' && <Badge className="bg-amber-500 text-xs">Pendente</Badge>}
                        {o.status === 'conciliado_auto' && <Badge className="bg-emerald-600 text-xs">Auto</Badge>}
                        {o.status === 'conciliado_manual' && <Badge className="bg-blue-600 text-xs">Manual</Badge>}
                        {o.status === 'ignorado' && <Badge variant="secondary" className="text-xs">Ignorado</Badge>}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {o.status === 'nao_conciliado' && (
                          <div className="flex gap-1 justify-end">
                            <Button size="sm" variant="default" className="h-7 text-xs" onClick={() => setVincularOrfao(o)}>
                              <Link2 className="w-3 h-3 mr-1" /> Vincular
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => ignorar(o.id)}>
                              <X className="w-3 h-3 mr-1" /> Ignorar
                            </Button>
                          </div>
                        )}
                        {o.status === 'conciliado_auto' && o.observacao && (
                          <span className="text-xs text-muted-foreground" title={o.observacao}>
                            <CheckCircle2 className="inline w-3 h-3 text-emerald-600" />
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {vincularOrfao && (
        <VincularModal orfao={vincularOrfao} onClose={() => { setVincularOrfao(null); carregar(); }} />
      )}
    </div>
  );
}

function VincularModal({ orfao, onClose }: { orfao: Orfao; onClose: () => void }) {
  const [parcelas, setParcelas] = useState<ParcelaCand[]>([]);
  const [busca, setBusca] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      // Se candidatas existem, carregar diretamente; senão buscar parcelas pendentes (filtrado depois pelo input)
      let query = supabase
        .from('parcelas')
        .select('id, numero, valor, juros, multa, desconto, data_vencimento, status, cliente_id, cliente:clientes(nome)')
        .in('status', ['pendente', 'vencida'])
        .order('data_vencimento', { ascending: true })
        .limit(200);
      if (orfao.candidatas && orfao.candidatas.length > 0) {
        query = supabase
          .from('parcelas')
          .select('id, numero, valor, juros, multa, desconto, data_vencimento, status, cliente_id, cliente:clientes(nome)')
          .in('id', orfao.candidatas);
      } else if (orfao.cliente_id) {
        query = supabase
          .from('parcelas')
          .select('id, numero, valor, juros, multa, desconto, data_vencimento, status, cliente_id, cliente:clientes(nome)')
          .eq('cliente_id', orfao.cliente_id)
          .in('status', ['pendente', 'vencida']);
      }
      const { data, error } = await query;
      if (error) {
        toast.error('Erro: ' + error.message);
      } else {
        setParcelas((data as unknown as ParcelaCand[]) || []);
      }
      setLoading(false);
    })();
  }, [orfao.id]);

  const filtradas = useMemo(() => {
    if (!busca.trim()) return parcelas;
    const t = busca.toLowerCase();
    return parcelas.filter((p) => (p.cliente?.nome || '').toLowerCase().includes(t));
  }, [parcelas, busca]);

  const vincular = async (parcelaId: string) => {
    setSubmitting(true);
    const { data, error } = await supabase.rpc('conciliar_pagamento_orfao', {
      p_orfao_id: orfao.id,
      p_parcela_id: parcelaId,
      p_marcar_paga: true,
    });
    setSubmitting(false);
    if (error) {
      toast.error('Erro ao conciliar: ' + error.message);
      return;
    }
    toast.success('Pagamento conciliado com a parcela.');
    console.log('[orfaos] conciliado:', data);
    onClose();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Vincular pagamento a uma parcela</DialogTitle>
          <DialogDescription>
            Pagamento de <strong>{fmtBRL(orfao.valor)}</strong> recebido em {format(new Date(orfao.recebido_em), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
            {orfao.nome_pagador && <> de <strong>{orfao.nome_pagador}</strong></>}
            {orfao.cpf_pagador && <> (CPF {orfao.cpf_pagador})</>}.
          </DialogDescription>
        </DialogHeader>

        {orfao.candidatas && orfao.candidatas.length > 1 && (
          <Alert>
            <AlertTriangle className="w-4 h-4" />
            <AlertDescription>
              {orfao.candidatas.length} parcelas do cliente bateram com o valor recebido (±10%). Escolha a correta.
            </AlertDescription>
          </Alert>
        )}

        {!orfao.cliente_id && (!orfao.candidatas || orfao.candidatas.length === 0) && (
          <div>
            <Label className="text-xs">Buscar parcela por nome do cliente</Label>
            <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome do cliente..." />
          </div>
        )}

        <div className="max-h-96 overflow-y-auto border rounded-md">
          {loading ? (
            <p className="text-sm text-center py-8 text-muted-foreground">Carregando parcelas...</p>
          ) : filtradas.length === 0 ? (
            <p className="text-sm text-center py-8 text-muted-foreground">Nenhuma parcela elegível encontrada.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left">Cliente</th>
                  <th className="px-3 py-2 text-left">Parc.</th>
                  <th className="px-3 py-2 text-left">Vencimento</th>
                  <th className="px-3 py-2 text-right">Valor</th>
                  <th className="px-3 py-2 text-right">Total c/ juros</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {filtradas.map((p) => {
                  const total = Number(p.valor || 0) + Number(p.juros || 0) + Number(p.multa || 0) - Number(p.desconto || 0);
                  const diff = Math.abs(orfao.valor - total);
                  const pct = total > 0 ? (diff / total) * 100 : 100;
                  const cor = pct <= 1 ? 'text-emerald-600' : pct <= 10 ? 'text-amber-600' : 'text-red-600';
                  return (
                    <tr key={p.id} className="border-t">
                      <td className="px-3 py-2">{p.cliente?.nome || '—'}</td>
                      <td className="px-3 py-2">#{p.numero}</td>
                      <td className="px-3 py-2">{format(new Date(p.data_vencimento + 'T00:00:00'), 'dd/MM/yyyy')}</td>
                      <td className="px-3 py-2 text-right">{fmtBRL(p.valor)}</td>
                      <td className={`px-3 py-2 text-right font-semibold ${cor}`}>
                        {fmtBRL(total)} <span className="text-[10px]">({pct.toFixed(1)}%)</span>
                      </td>
                      <td className="px-3 py-2">
                        <Button size="sm" disabled={submitting} onClick={() => vincular(p.id)}>Vincular</Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
