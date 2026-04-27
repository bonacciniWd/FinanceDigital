/**
 * @module SaidasOrfasPage
 * @description Lista Pix Enviados (saídas) sem vínculo automático com empréstimo ou categoria de gasto.
 *  Alimentada pela edge function `cron-saidas-orfas`.
 *  Permite vincular manualmente a um empréstimo (marca desembolsado) ou a uma categoria de gasto.
 *
 * @route /pagamentos/saidas-orfas
 * @access admin, gerencia
 */
import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../components/ui/dialog';
import { ArrowUpRight, Search, Link2, Tags, X, CheckCircle2, Loader2, Play } from 'lucide-react';
import { supabase, supabaseUrl, supabaseAnonKey } from '../lib/supabase';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type StatusOrfa = 'pendente' | 'vinculada_emprestimo' | 'vinculada_gasto' | 'ignorada';

interface SaidaOrfa {
  id: string;
  e2e_id: string | null;
  id_envio: string | null;
  valor: number;
  horario: string;
  chave_favorecido: string | null;
  nome_favorecido: string | null;
  cpf_cnpj_favorecido: string | null;
  gateway: string;
  status: StatusOrfa;
  emprestimo_id_match: string | null;
  gasto_id_match: string | null;
  candidatas_emprestimo: Array<{ emprestimo_id: string; valor: number; mesma_chave: boolean }> | null;
  observacao: string | null;
}

interface EmprestimoCandidato {
  id: string;
  cliente_id: string;
  valor: number;
  desembolsado: boolean;
  cliente_nome?: string;
  cliente_pix?: string | null;
}

interface CategoriaGasto {
  id: string;
  nome: string;
  cor: string | null;
  ativo: boolean;
}

const fmtBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

function normalizePixKey(k: string | null | undefined): string {
  if (!k) return '';
  const t = String(k).trim().toLowerCase();
  if (t.includes('@')) return t;
  return t.replace(/[^a-z0-9]/g, '');
}

export default function SaidasOrfasPage() {
  const [orfas, setOrfas] = useState<SaidaOrfa[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState<StatusOrfa | 'todas'>('pendente');
  const [busca, setBusca] = useState('');
  const [vincularItem, setVincularItem] = useState<SaidaOrfa | null>(null);
  const [runningCron, setRunningCron] = useState(false);

  const carregar = async () => {
    setLoading(true);
    let q = supabase
      .from('saidas_orfas')
      .select('*')
      .order('horario', { ascending: false })
      .limit(500);
    if (filtroStatus !== 'todas') q = q.eq('status', filtroStatus);
    const { data, error } = await q;
    if (error) {
      toast.error('Erro ao carregar saídas órfãs: ' + error.message);
      setLoading(false);
      return;
    }
    setOrfas((data as unknown as SaidaOrfa[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroStatus]);

  const filtradas = useMemo(() => {
    if (!busca.trim()) return orfas;
    const t = busca.toLowerCase();
    return orfas.filter((o) =>
      [o.nome_favorecido, o.chave_favorecido, o.cpf_cnpj_favorecido, o.e2e_id]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(t)),
    );
  }, [orfas, busca]);

  const totais = useMemo(() => {
    const pendentes = orfas.filter((o) => o.status === 'pendente');
    return {
      pendentes: pendentes.length,
      valorPendente: pendentes.reduce((s, o) => s + Number(o.valor || 0), 0),
      total: orfas.length,
    };
  }, [orfas]);

  async function rodarCronManual() {
    setRunningCron(true);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      if (!session) throw new Error('Sessão expirada');
      const resp = await fetch(`${supabaseUrl}/functions/v1/cron-saidas-orfas?hours=72`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, apikey: supabaseAnonKey },
      });
      const data = await resp.json();
      if (!resp.ok || !data.success) throw new Error(data.error || `HTTP ${resp.status}`);
      toast.success(
        `${data.fetched} analisadas · ${data.desembolso_auto} desembolsos · ${data.gasto_auto} gastos · ${data.orfas_inseridas} novas órfãs`,
        { duration: 7000 },
      );
      carregar();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setRunningCron(false);
    }
  }

  async function ignorar(id: string) {
    if (!confirm('Marcar esta saída como ignorada?')) return;
    const { error } = await supabase.rpc('ignorar_saida_orfa', { p_orfa_id: id, p_observacao: null });
    if (error) return toast.error('Erro: ' + error.message);
    toast.success('Marcada como ignorada');
    carregar();
  }

  const statusBadge = (s: StatusOrfa) => {
    switch (s) {
      case 'pendente':
        return <Badge className="bg-amber-100 text-amber-800">Pendente</Badge>;
      case 'vinculada_emprestimo':
        return <Badge className="bg-green-100 text-green-800">Vinc. Empréstimo</Badge>;
      case 'vinculada_gasto':
        return <Badge className="bg-blue-100 text-blue-800">Vinc. Gasto</Badge>;
      case 'ignorada':
        return <Badge variant="secondary">Ignorada</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ArrowUpRight className="h-6 w-6 text-red-500" />
            Saídas Órfãs (Pix Enviados sem vínculo)
          </h1>
          <p className="text-muted-foreground mt-1">
            Pix saídos do extrato que não bateram com nenhum empréstimo aprovado nem com categorias de gasto cadastradas.
          </p>
        </div>
        <Button variant="outline" onClick={rodarCronManual} disabled={runningCron}>
          {runningCron ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Play className="h-4 w-4 mr-2" />
          )}
          Rodar conciliação agora
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground mb-1">Pendentes</p>
            <p className="text-xl font-bold text-amber-600">{totais.pendentes}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground mb-1">Valor pendente de conciliação</p>
            <p className="text-xl font-bold text-red-600">{fmtBRL(totais.valorPendente)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground mb-1">Total no histórico</p>
            <p className="text-xl font-bold">{totais.total}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Status</Label>
          <Select value={filtroStatus} onValueChange={(v) => setFiltroStatus(v as StatusOrfa | 'todas')}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pendente">Pendentes</SelectItem>
              <SelectItem value="vinculada_emprestimo">Vinc. Empréstimo</SelectItem>
              <SelectItem value="vinculada_gasto">Vinc. Gasto</SelectItem>
              <SelectItem value="ignorada">Ignoradas</SelectItem>
              <SelectItem value="todas">Todas</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1 flex-1 min-w-[200px]">
          <Label className="text-xs">Buscar</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Nome, chave PIX, CPF/CNPJ ou e2e..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
      </div>

      {/* Lista */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{filtradas.length} saída(s)</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtradas.length === 0 ? (
            <p className="text-center text-muted-foreground py-8 text-sm">
              Nenhuma saída órfã para o filtro atual.
            </p>
          ) : (
            <div className="space-y-2">
              {filtradas.map((o) => (
                <div
                  key={o.id}
                  className="p-3 rounded-lg border hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-medium">{o.nome_favorecido || '—'}</span>
                        {statusBadge(o.status)}
                        {o.candidatas_emprestimo && o.candidatas_emprestimo.length > 0 && o.status === 'pendente' && (
                          <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">
                            {o.candidatas_emprestimo.length} candidato(s)
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                        <span>{format(new Date(o.horario), 'dd/MM/yyyy HH:mm', { locale: ptBR })}</span>
                        {o.chave_favorecido && (
                          <>
                            <span>·</span>
                            <span className="font-mono truncate max-w-xs">{o.chave_favorecido}</span>
                          </>
                        )}
                        {o.cpf_cnpj_favorecido && (
                          <>
                            <span>·</span>
                            <span>CPF/CNPJ {o.cpf_cnpj_favorecido}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-semibold text-red-600">− {fmtBRL(Number(o.valor))}</span>
                      {o.status === 'pendente' && (
                        <>
                          <Button size="sm" onClick={() => setVincularItem(o)}>
                            <Link2 className="h-3 w-3 mr-1" />
                            Vincular
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-muted-foreground"
                            onClick={() => ignorar(o.id)}
                            title="Ignorar"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {vincularItem && (
        <VincularModal
          orfa={vincularItem}
          onClose={() => {
            setVincularItem(null);
            carregar();
          }}
        />
      )}
    </div>
  );
}

function VincularModal({ orfa, onClose }: { orfa: SaidaOrfa; onClose: () => void }) {
  const [tab, setTab] = useState<'emprestimo' | 'gasto'>('emprestimo');
  const [emprestimos, setEmprestimos] = useState<EmprestimoCandidato[]>([]);
  const [categorias, setCategorias] = useState<CategoriaGasto[]>([]);
  const [busca, setBusca] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      // Carrega empréstimos aprovados não desembolsados + análises + clientes
      const [empResp, anaResp, cliResp, catResp] = await Promise.all([
        supabase
          .from('emprestimos')
          .select('id, cliente_id, valor, desembolsado, analise_id')
          .eq('desembolsado', false),
        supabase.from('analises').select('id, status, cliente_nome'),
        supabase.from('clientes').select('id, nome, pix_key, cpf'),
        supabase.from('categorias_gastos').select('id, nome, cor, ativo').eq('ativo', true).order('nome'),
      ]);

      if (empResp.error) toast.error('Erro: ' + empResp.error.message);
      const aprovadas = new Set(
        (anaResp.data || []).filter((a: { status: string }) => a.status === 'aprovado').map((a: { id: string }) => a.id),
      );
      const cliMap = new Map((cliResp.data || []).map((c: { id: string; nome: string; pix_key: string | null; cpf: string | null }) => [c.id, c]));
      const candidatos: EmprestimoCandidato[] = (empResp.data || [])
        .filter((e: { analise_id: string | null }) => e.analise_id && aprovadas.has(e.analise_id))
        .map((e: { id: string; cliente_id: string; valor: number; desembolsado: boolean; analise_id: string | null }) => {
          const cli = cliMap.get(e.cliente_id);
          return {
            id: e.id,
            cliente_id: e.cliente_id,
            valor: Number(e.valor),
            desembolsado: e.desembolsado,
            cliente_nome: cli?.nome,
            cliente_pix: cli?.pix_key,
          };
        });
      setEmprestimos(candidatos);
      setCategorias((catResp.data as CategoriaGasto[]) || []);
      setLoading(false);
    })();
  }, [orfa.id]);

  // Ordena empréstimos por relevância: mesma chave → menor diff de valor
  const candidatosOrdenados = useMemo(() => {
    const chaveAlvo = normalizePixKey(orfa.chave_favorecido);
    const buscaNorm = busca.trim().toLowerCase();
    const itens = emprestimos.map((e) => ({
      emp: e,
      diff: Math.abs(e.valor - Number(orfa.valor)),
      mesmaChave: !!e.cliente_pix && normalizePixKey(e.cliente_pix) === chaveAlvo && !!chaveAlvo,
    }));
    return itens
      .filter(({ emp, mesmaChave, diff }) => {
        if (buscaNorm) {
          return (
            (emp.cliente_nome || '').toLowerCase().includes(buscaNorm) ||
            (emp.cliente_pix || '').toLowerCase().includes(buscaNorm)
          );
        }
        return mesmaChave || diff <= 10;
      })
      .sort((a, b) => {
        if (a.mesmaChave !== b.mesmaChave) return a.mesmaChave ? -1 : 1;
        return a.diff - b.diff;
      })
      .slice(0, 50);
  }, [emprestimos, busca, orfa]);

  const categoriasFiltradas = useMemo(() => {
    if (!busca.trim()) return categorias;
    const t = busca.toLowerCase();
    return categorias.filter((c) => c.nome.toLowerCase().includes(t));
  }, [categorias, busca]);

  async function vincularEmprestimo(emprestimoId: string) {
    setSubmitting(true);
    const { error } = await supabase.rpc('vincular_saida_orfa_emprestimo', {
      p_orfa_id: orfa.id,
      p_emprestimo_id: emprestimoId,
      p_marcar_desembolsado: true,
    });
    setSubmitting(false);
    if (error) {
      toast.error('Erro: ' + error.message);
      return;
    }
    toast.success('Saída vinculada ao empréstimo e desembolso confirmado.');
    onClose();
  }

  async function vincularGasto(categoriaId: string) {
    setSubmitting(true);
    const { error } = await supabase.rpc('vincular_saida_orfa_categoria', {
      p_orfa_id: orfa.id,
      p_categoria_id: categoriaId,
    });
    setSubmitting(false);
    if (error) {
      toast.error('Erro: ' + error.message);
      return;
    }
    toast.success('Saída registrada como gasto interno.');
    onClose();
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Vincular saída</DialogTitle>
          <DialogDescription>
            Pix de <strong>{fmtBRL(Number(orfa.valor))}</strong> enviado em{' '}
            {format(new Date(orfa.horario), 'dd/MM/yyyy HH:mm', { locale: ptBR })} para{' '}
            <strong>{orfa.nome_favorecido || '—'}</strong>
            {orfa.chave_favorecido && (
              <>
                {' '}
                · <span className="font-mono text-xs">{orfa.chave_favorecido}</span>
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex gap-2 border-b -mx-6 px-6">
          <button
            type="button"
            className={`pb-2 text-sm border-b-2 transition-colors ${
              tab === 'emprestimo'
                ? 'border-primary text-foreground font-medium'
                : 'border-transparent text-muted-foreground'
            }`}
            onClick={() => setTab('emprestimo')}
          >
            <Link2 className="h-3 w-3 inline mr-1" />
            Empréstimo
          </button>
          <button
            type="button"
            className={`pb-2 text-sm border-b-2 transition-colors ${
              tab === 'gasto'
                ? 'border-primary text-foreground font-medium'
                : 'border-transparent text-muted-foreground'
            }`}
            onClick={() => setTab('gasto')}
          >
            <Tags className="h-3 w-3 inline mr-1" />
            Categoria de gasto
          </button>
        </div>

        <Input
          placeholder={tab === 'emprestimo' ? 'Buscar cliente, chave PIX...' : 'Buscar categoria...'}
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="h-9"
        />

        <div className="max-h-96 overflow-y-auto rounded border divide-y">
          {loading ? (
            <p className="text-sm text-center py-8 text-muted-foreground">Carregando...</p>
          ) : tab === 'emprestimo' ? (
            candidatosOrdenados.length === 0 ? (
              <p className="text-sm text-center py-8 text-muted-foreground">
                {busca ? 'Nenhum empréstimo encontrado.' : 'Nenhum candidato com valor próximo. Use a busca acima.'}
              </p>
            ) : (
              candidatosOrdenados.map(({ emp, diff, mesmaChave }) => (
                <div key={emp.id} className="flex items-center justify-between gap-2 p-2 text-sm hover:bg-muted/30">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-medium truncate">{emp.cliente_nome || emp.cliente_id}</span>
                      {mesmaChave && (
                        <Badge className="h-4 text-[9px] px-1 bg-green-100 text-green-700">mesma chave</Badge>
                      )}
                      {diff < 0.01 && (
                        <Badge className="h-4 text-[9px] px-1 bg-blue-100 text-blue-700">mesmo valor</Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {fmtBRL(emp.valor)}
                      {diff >= 0.01 && (
                        <span className="text-amber-600 ml-1">(Δ {fmtBRL(diff)})</span>
                      )}
                      {emp.cliente_pix && <span className="ml-2 font-mono">· {emp.cliente_pix}</span>}
                    </div>
                  </div>
                  <Button size="sm" disabled={submitting} onClick={() => vincularEmprestimo(emp.id)}>
                    {submitting ? <Loader2 className="h-3 w-3 animate-spin" /> : (
                      <>
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Vincular
                      </>
                    )}
                  </Button>
                </div>
              ))
            )
          ) : categoriasFiltradas.length === 0 ? (
            <p className="text-sm text-center py-8 text-muted-foreground">
              Nenhuma categoria ativa. Cadastre categorias em Configurações → Gastos Internos.
            </p>
          ) : (
            categoriasFiltradas.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-2 p-2 text-sm hover:bg-muted/30">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span
                    className="inline-block h-3 w-3 rounded-full shrink-0"
                    style={{ backgroundColor: c.cor || '#f97316' }}
                  />
                  <span className="font-medium truncate">{c.nome}</span>
                </div>
                <Button size="sm" disabled={submitting} onClick={() => vincularGasto(c.id)}>
                  {submitting ? <Loader2 className="h-3 w-3 animate-spin" /> : (
                    <>
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Registrar gasto
                    </>
                  )}
                </Button>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
