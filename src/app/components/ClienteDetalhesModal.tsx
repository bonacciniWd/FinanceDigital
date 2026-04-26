/**
 * @module ClienteDetalhesModal
 * @description Modal unificado de detalhes do cliente, acessível de qualquer tela via
 * `useClienteModal().openClienteModal(clienteId)`.
 *
 * Tabs:
 *  - Dados: editar cadastro + upload de documentos (frente/verso/comprovante endereço)
 *  - Empréstimos: listar empréstimos, atribuir cobrador, marcar quitado/inadimplente
 *  - Cobrança: saldo, acordos, criar acordo, editar juros/multa por parcela
 *  - WhatsApp: template + instância + envio direto
 *  - Histórico: pagamentos + contatos + tempo de resposta
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import {
  User as UserIcon,
  FileText,
  Phone,
  MessageSquare,
  History,
  Upload,
  Save,
  Send,
  HandshakeIcon,
  DollarSign,
  AlertCircle,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  CheckCircle,
  Eye,
  ExternalLink,
  Percent,
  Image as ImageIcon,
  Copy,
  QrCode,
} from 'lucide-react';
import { toast } from 'sonner';

import {
  useCliente,
  useUpdateCliente,
} from '../hooks/useClientes';
import { useEmprestimosByCliente, useUpdateEmprestimo } from '../hooks/useEmprestimos';
import { useParcelasByCliente, useUpdateParcela, useRegistrarPagamento } from '../hooks/useParcelas';
import { useAcordosByCliente } from '../hooks/useAcordos';
import { useInstancias, useEnviarWhatsapp } from '../hooks/useWhatsapp';
import { useTemplatesByCategoria } from '../hooks/useTemplates';
import { useAdminUsers } from '../hooks/useAdminUsers';
import { useContasBancarias } from '../hooks/useContasBancarias';
import { useCriarCobvEfi } from '../hooks/useWoovi';
import { supabase } from '../lib/supabase';
import AcordoFormModal from './AcordoFormModal';
import EmprestimoEditModal from './EmprestimoEditModal';
import ComprovanteUploader from './ComprovanteUploader';
import type { ClienteUpdate } from '../lib/database.types';
import type { Parcela } from '../lib/view-types';

interface Props {
  clienteId: string | null;
  tab: 'dados' | 'emprestimos' | 'cobranca' | 'whatsapp' | 'historico';
  onTabChange: (tab: 'dados' | 'emprestimos' | 'cobranca' | 'whatsapp' | 'historico') => void;
  onClose: () => void;
}

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

const formatDate = (iso?: string | null) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('pt-BR');
  } catch {
    return iso;
  }
};

const normalizePhoneBR = (tel: string) => tel.replace(/\D/g, '');

export default function ClienteDetalhesModal({ clienteId, tab, onTabChange, onClose }: Props) {
  const open = !!clienteId;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="w-[96vw] sm:max-w-5xl lg:max-w-6xl xl:max-w-7xl h-[92vh] max-h-[92vh] overflow-hidden flex flex-col p-0 gap-0">
        {clienteId ? (
          <ModalBody
            clienteId={clienteId}
            tab={tab}
            onTabChange={onTabChange}
            onClose={onClose}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ModalBody({ clienteId, tab, onTabChange, onClose }: Props & { clienteId: string }) {
  const { data: cliente, isLoading } = useCliente(clienteId);
  const { data: emprestimos = [] } = useEmprestimosByCliente(clienteId);
  const { data: parcelas = [] } = useParcelasByCliente(clienteId);
  const { data: acordos = [] } = useAcordosByCliente(clienteId);

  if (isLoading || !cliente) {
    return (
      <div className="p-10 flex flex-col items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin" />
        <p className="text-sm">Carregando cliente...</p>
      </div>
    );
  }

  // KPIs topo
  const saldoDevedor = parcelas
    .filter((p) => p.status !== 'paga' && p.status !== 'cancelada')
    .reduce((acc, p) => acc + (p.valorOriginal + p.juros + p.multa - p.desconto), 0);
  const parcelasVencidas = parcelas.filter((p) => p.status === 'vencida').length;
  const emprestimosAtivos = emprestimos.filter((e) => e.status === 'ativo' || e.status === 'inadimplente').length;
  const acordosAtivos = acordos.filter((a) => a.status === 'ativo').length;

  return (
    <>
      <DialogHeader className="px-6 pt-6 pb-4 border-b bg-background/40">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <DialogTitle className="text-xl truncate flex items-center gap-2">
              <UserIcon className="w-5 h-5 text-primary shrink-0" />
              {cliente.nome}
            </DialogTitle>
            <div className="flex flex-wrap gap-2 mt-2 text-xs">
              <Badge variant="secondary">{cliente.telefone}</Badge>
              {cliente.cpf && <Badge variant="secondary">CPF: {cliente.cpf}</Badge>}
              <Badge
                className={
                  cliente.status === 'vencido'
                    ? 'bg-red-100 text-red-800'
                    : cliente.status === 'a_vencer'
                    ? 'bg-yellow-100 text-yellow-800'
                    : 'bg-green-100 text-green-800'
                }
              >
                {cliente.status === 'vencido' ? 'Vencido' : cliente.status === 'a_vencer' ? 'A vencer' : 'Em dia'}
              </Badge>
            </div>
          </div>
          <div className="hidden sm:grid grid-cols-2 gap-3 text-right">
            <div>
              <div className="text-[10px] uppercase text-muted-foreground">Saldo devedor</div>
              <div className="text-sm font-semibold text-red-600">{formatCurrency(saldoDevedor)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-muted-foreground">Parcelas venc.</div>
              <div className="text-sm font-semibold">{parcelasVencidas}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-muted-foreground">Empréstimos</div>
              <div className="text-sm font-semibold">{emprestimosAtivos}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-muted-foreground">Acordos ativos</div>
              <div className="text-sm font-semibold">{acordosAtivos}</div>
            </div>
          </div>
        </div>
      </DialogHeader>

      <Tabs value={tab} onValueChange={(v) => onTabChange(v as Props['tab'])} className="flex-1 flex flex-col overflow-hidden">
        <TabsList className="mx-6 mt-4 grid grid-cols-5">
          <TabsTrigger value="dados"><UserIcon className="w-3.5 h-3.5 mr-1" />Dados</TabsTrigger>
          <TabsTrigger value="emprestimos"><DollarSign className="w-3.5 h-3.5 mr-1" />Empréstimos</TabsTrigger>
          <TabsTrigger value="cobranca"><HandshakeIcon className="w-3.5 h-3.5 mr-1" />Cobrança</TabsTrigger>
          <TabsTrigger value="whatsapp"><MessageSquare className="w-3.5 h-3.5 mr-1" />WhatsApp</TabsTrigger>
          <TabsTrigger value="historico"><History className="w-3.5 h-3.5 mr-1" />Histórico</TabsTrigger>
        </TabsList>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          <TabsContent value="dados" className="mt-0">
            <DadosTab cliente={cliente} onClose={onClose} />
          </TabsContent>
          <TabsContent value="emprestimos" className="mt-0">
            <EmprestimosTab clienteId={clienteId} />
          </TabsContent>
          <TabsContent value="cobranca" className="mt-0">
            <CobrancaTab clienteId={clienteId} />
          </TabsContent>
          <TabsContent value="whatsapp" className="mt-0">
            <WhatsappTab cliente={cliente} />
          </TabsContent>
          <TabsContent value="historico" className="mt-0">
            <HistoricoTab clienteId={clienteId} />
          </TabsContent>
        </div>
      </Tabs>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════
   TAB 1 — DADOS & DOCUMENTOS
   ═══════════════════════════════════════════════════════════ */

function DadosTab({ cliente, onClose }: { cliente: ReturnType<typeof useCliente>['data']; onClose: () => void }) {
  const updateCliente = useUpdateCliente();
  const [form, setForm] = useState(() => ({
    nome: cliente?.nome ?? '',
    email: cliente?.email ?? '',
    telefone: cliente?.telefone ?? '',
    cpf: cliente?.cpf ?? '',
    profissao: cliente?.profissao ?? '',
    dataNascimento: cliente?.dataNascimento ?? '',
    endereco: cliente?.endereco ?? '',
    rua: cliente?.rua ?? '',
    numero: cliente?.numero ?? '',
    bairro: cliente?.bairro ?? '',
    cidade: cliente?.cidade ?? '',
    estado: cliente?.estado ?? '',
    cep: cliente?.cep ?? '',
    rendaMensal: cliente?.rendaMensal ?? 0,
    limiteCredito: cliente?.limiteCredito ?? 0,
    pix_key: cliente?.pix_key ?? '',
    pix_key_type: cliente?.pix_key_type ?? '',
  }));

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  if (!cliente) return null;

  const handleSave = async () => {
    const updates: ClienteUpdate = {
      nome: form.nome,
      email: form.email,
      telefone: form.telefone,
      cpf: form.cpf || null,
      profissao: form.profissao || null,
      data_nascimento: form.dataNascimento || null,
      endereco: form.endereco || null,
      rua: form.rua || null,
      numero: form.numero || null,
      bairro: form.bairro || null,
      cidade: form.cidade || null,
      estado: form.estado || null,
      cep: form.cep || null,
      renda_mensal: Number(form.rendaMensal) || 0,
      limite_credito: Number(form.limiteCredito) || 0,
      pix_key: form.pix_key || null,
      pix_key_type: form.pix_key_type || null,
    };
    try {
      await updateCliente.mutateAsync({ id: cliente.id, data: updates });
      toast.success('Cadastro atualizado');
    } catch (err) {
      toast.error('Erro ao salvar: ' + (err as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-sm font-semibold mb-3">Dados pessoais</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Nome"><Input value={form.nome} onChange={(e) => set('nome', e.target.value)} /></Field>
          <Field label="Email"><Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} /></Field>
          <Field label="Telefone"><Input value={form.telefone} onChange={(e) => set('telefone', e.target.value)} /></Field>
          <Field label="CPF"><Input value={form.cpf} onChange={(e) => set('cpf', e.target.value)} /></Field>
          <Field label="Profissão"><Input value={form.profissao} onChange={(e) => set('profissao', e.target.value)} /></Field>
          <Field label="Nascimento"><Input type="date" value={form.dataNascimento} onChange={(e) => set('dataNascimento', e.target.value)} /></Field>
          <Field label="Renda mensal"><Input type="number" value={form.rendaMensal} onChange={(e) => set('rendaMensal', Number(e.target.value))} /></Field>
          <Field label="Limite de crédito"><Input type="number" value={form.limiteCredito} onChange={(e) => set('limiteCredito', Number(e.target.value))} /></Field>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold mb-3">Endereço</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label="Rua" className="md:col-span-2"><Input value={form.rua} onChange={(e) => set('rua', e.target.value)} /></Field>
          <Field label="Número"><Input value={form.numero} onChange={(e) => set('numero', e.target.value)} /></Field>
          <Field label="Bairro"><Input value={form.bairro} onChange={(e) => set('bairro', e.target.value)} /></Field>
          <Field label="Cidade"><Input value={form.cidade} onChange={(e) => set('cidade', e.target.value)} /></Field>
          <Field label="Estado"><Input value={form.estado} onChange={(e) => set('estado', e.target.value)} /></Field>
          <Field label="CEP"><Input value={form.cep} onChange={(e) => set('cep', e.target.value)} /></Field>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold mb-3">PIX</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Tipo">
            <Select value={form.pix_key_type} onValueChange={(v) => set('pix_key_type', v)}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cpf">CPF</SelectItem>
                <SelectItem value="cnpj">CNPJ</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="telefone">Telefone</SelectItem>
                <SelectItem value="aleatoria">Aleatória</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Chave PIX"><Input value={form.pix_key} onChange={(e) => set('pix_key', e.target.value)} /></Field>
        </div>
      </section>

      <DocumentosSection clienteId={cliente.id} cliente={cliente} />

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={onClose}>Fechar</Button>
        <Button onClick={handleSave} disabled={updateCliente.isPending}>
          {updateCliente.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Salvar cadastro
        </Button>
      </div>
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-1 ${className ?? ''}`}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function DocumentosSection({ clienteId, cliente }: { clienteId: string; cliente: NonNullable<ReturnType<typeof useCliente>['data']> }) {
  const updateCliente = useUpdateCliente();
  const [uploading, setUploading] = useState<string | null>(null);

  const docs: Array<{ key: 'documentoFrenteUrl' | 'documentoVersoUrl' | 'comprovanteEnderecoUrl'; dbKey: 'documento_frente_url' | 'documento_verso_url' | 'comprovante_endereco_url'; label: string }> = [
    { key: 'documentoFrenteUrl', dbKey: 'documento_frente_url', label: 'Documento (frente)' },
    { key: 'documentoVersoUrl', dbKey: 'documento_verso_url', label: 'Documento (verso)' },
    { key: 'comprovanteEnderecoUrl', dbKey: 'comprovante_endereco_url', label: 'Comprovante de endereço' },
  ];

  const uploadDoc = useCallback(async (file: File, slotKey: typeof docs[number]['key'], dbKey: typeof docs[number]['dbKey']) => {
    setUploading(slotKey);
    try {
      const ext = file.name.split('.').pop() ?? 'jpg';
      const path = `${clienteId}/${dbKey}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('client-documents').upload(path, file, {
        cacheControl: '3600',
        upsert: true,
        contentType: file.type,
      });
      if (error) throw error;
      await updateCliente.mutateAsync({ id: clienteId, data: { [dbKey]: path } as ClienteUpdate });
      toast.success('Documento enviado');
    } catch (err) {
      toast.error('Falha no upload: ' + (err as Error).message);
    } finally {
      setUploading(null);
    }
  }, [clienteId, updateCliente]);

  const getPublicUrl = (path?: string | null) => {
    if (!path) return null;
    return supabase.storage.from('client-documents').getPublicUrl(path).data.publicUrl;
  };

  return (
    <section>
      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
        <FileText className="w-4 h-4" /> Documentos
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {docs.map(({ key, dbKey, label }) => {
          const path = cliente[key];
          const url = getPublicUrl(path);
          return (
            <div key={key} className="border rounded-lg p-3 space-y-2">
              <div className="text-xs text-muted-foreground">{label}</div>
              {url ? (
                <a href={url} target="_blank" rel="noreferrer" className="block border rounded overflow-hidden bg-muted">
                  <img src={url} alt={label} className="w-full h-24 object-cover" />
                </a>
              ) : (
                <div className="h-24 flex items-center justify-center border border-dashed rounded text-xs text-muted-foreground">
                  Sem arquivo
                </div>
              )}
              <label className="block">
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) uploadDoc(file, key, dbKey);
                    e.target.value = '';
                  }}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full cursor-pointer"
                  asChild
                  disabled={uploading === key}
                >
                  <span>
                    {uploading === key ? <Loader2 className="w-3 h-3 mr-2 animate-spin" /> : <Upload className="w-3 h-3 mr-2" />}
                    {url ? 'Substituir' : 'Enviar'}
                  </span>
                </Button>
              </label>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════
   TAB 2 — EMPRÉSTIMOS (atribuir cobrador, marcar status)
   ═══════════════════════════════════════════════════════════ */

function EmprestimosTab({ clienteId }: { clienteId: string }) {
  const { data: emprestimos = [], isLoading } = useEmprestimosByCliente(clienteId);
  const { data: allUsers = [] } = useAdminUsers();
  const updateEmprestimo = useUpdateEmprestimo();
  const [editingId, setEditingId] = useState<string | null>(null);

  const cobradores = useMemo(
    () => allUsers.filter((u: any) => ['cobranca', 'gerencia', 'admin'].includes(u.role)),
    [allUsers],
  );

  if (isLoading) return <Loader2 className="w-4 h-4 animate-spin" />;
  if (emprestimos.length === 0) {
    return <div className="text-sm text-muted-foreground text-center py-8">Nenhum empréstimo encontrado</div>;
  }

  const handleCobradorChange = async (id: string, cobradorId: string) => {
    try {
      await updateEmprestimo.mutateAsync({ id, data: { cobrador_id: cobradorId || null } });
      toast.success('Cobrador atualizado');
    } catch (err) {
      toast.error('Erro: ' + (err as Error).message);
    }
  };

  const handleStatusChange = async (id: string, status: 'ativo' | 'quitado' | 'inadimplente') => {
    try {
      await updateEmprestimo.mutateAsync({ id, data: { status } });
      toast.success('Status atualizado');
    } catch (err) {
      toast.error('Erro: ' + (err as Error).message);
    }
  };

  return (
    <div className="space-y-3">
      {emprestimos.map((e) => {
        const progresso = e.parcelas > 0 ? (e.parcelasPagas / e.parcelas) * 100 : 0;
        return (
          <div key={e.id} className="border rounded-lg p-4 space-y-3 hover:border-primary/50 transition-colors">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <button
                type="button"
                className="text-left hover:text-primary transition-colors"
                onClick={() => setEditingId(e.id)}
                title="Clique para editar empréstimo e parcelas"
              >
                <div className="text-sm font-semibold">{formatCurrency(e.valor)} · {e.parcelas}x {formatCurrency(e.valorParcela)}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Contrato {formatDate(e.dataContrato)} · Juros {e.taxaJuros}% {e.tipoJuros} · Próx. venc. {formatDate(e.proximoVencimento)}
                </div>
              </button>
              <Badge
                className={
                  e.status === 'quitado'
                    ? 'bg-green-100 text-green-800'
                    : e.status === 'inadimplente'
                    ? 'bg-red-100 text-red-800'
                    : 'bg-blue-100 text-blue-800'
                }
              >
                {e.status}
              </Badge>
            </div>

            <div className="h-1.5 bg-muted rounded overflow-hidden">
              <div className="h-full bg-primary" style={{ width: `${progresso}%` }} />
            </div>
            <div className="text-xs text-muted-foreground">
              {e.parcelasPagas}/{e.parcelas} parcelas pagas
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Cobrador</Label>
                <Select value={e.cobradorId ?? ''} onValueChange={(v) => handleCobradorChange(e.id, v)}>
                  <SelectTrigger><SelectValue placeholder="Sem cobrador" /></SelectTrigger>
                  <SelectContent>
                    {cobradores.map((u: any) => (
                      <SelectItem key={u.id} value={u.id}>{u.name || u.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-2">
                <Button size="sm" variant="secondary" onClick={() => setEditingId(e.id)}>
                  Editar
                </Button>
                {e.status !== 'quitado' && (
                  <Button size="sm" variant="secondary" onClick={() => handleStatusChange(e.id, 'quitado')}>
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Marcar quitado
                  </Button>
                )}
                {e.status !== 'inadimplente' && e.status !== 'quitado' && (
                  <Button size="sm" variant="secondary" onClick={() => handleStatusChange(e.id, 'inadimplente')}>
                    <AlertCircle className="w-3.5 h-3.5 mr-1" /> Inadimplente
                  </Button>
                )}
              </div>
            </div>
          </div>
        );
      })}
      <EmprestimoEditModal emprestimoId={editingId} onClose={() => setEditingId(null)} />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   TAB 3 — COBRANÇA (acordos, multa/juros, pagar, pix, comprovante)
   ═══════════════════════════════════════════════════════════ */

function CobrancaTab({ clienteId }: { clienteId: string }) {
  const { data: parcelas = [] } = useParcelasByCliente(clienteId);
  const { data: emprestimos = [] } = useEmprestimosByCliente(clienteId);
  const { data: acordos = [] } = useAcordosByCliente(clienteId);
  const { data: contasBancarias = [] } = useContasBancarias();
  const { data: instancias = [] } = useInstancias();
  const updateParcela = useUpdateParcela();
  const registrarPagamento = useRegistrarPagamento();
  const criarCobvEfi = useCriarCobvEfi();
  const enviarWhatsapp = useEnviarWhatsapp();

  // Map emprestimoId -> emprestimo (para gateway/clienteNome)
  const emprestimoById = useMemo(() => {
    const m = new Map<string, (typeof emprestimos)[number]>();
    emprestimos.forEach((e) => m.set(e.id, e));
    return m;
  }, [emprestimos]);

  const pendentes = parcelas.filter((p) => p.status !== 'paga' && p.status !== 'cancelada');
  const pendentesCount = pendentes.length;
  const temVencidas = pendentes.some((p) => p.status === 'vencida');
  const saldoPendente = pendentes.reduce((sum, p) => sum + (p.valor + p.juros + p.multa - p.desconto), 0);

  // Edit juros/multa/desconto inline
  const [showAcordoModal, setShowAcordoModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editJuros, setEditJuros] = useState('');
  const [editMulta, setEditMulta] = useState('');
  const [editDesconto, setEditDesconto] = useState('');

  // Pagar modal
  const [pagamentoParcelaId, setPagamentoParcelaId] = useState<string | null>(null);
  const [pagamentoTab, setPagamentoTab] = useState<'completo' | 'parcial'>('completo');
  const [pagamentoObs, setPagamentoObs] = useState('');
  const [pagamentoData, setPagamentoData] = useState(() => new Date().toISOString().slice(0, 10));
  const [pagamentoDesconto, setPagamentoDesconto] = useState('0');
  const [pagamentoValorParcial, setPagamentoValorParcial] = useState('');
  const [pagamentoConta, setPagamentoConta] = useState('');

  // Comprovante manual
  const [comprovanteParcela, setComprovanteParcela] = useState<Parcela | null>(null);
  const [showComprovanteModal, setShowComprovanteModal] = useState(false);
  const [comprovanteLoading, setComprovanteLoading] = useState(false);

  // Pix dialog state
  const [gerandoPixId, setGerandoPixId] = useState<string | null>(null);
  const [pixResultDialog, setPixResultDialog] = useState<{ qrImage?: string; brCode?: string; parcelaNumero: number } | null>(null);

  // Visualizar comprovante (parcelas pagas)
  const [viewComprovanteUrl, setViewComprovanteUrl] = useState<string | null>(null);

  const isBusy = updateParcela.isPending || registrarPagamento.isPending;

  const startEdit = (id: string, juros: number, multa: number, desconto: number) => {
    setEditingId(id);
    setEditJuros(String(juros));
    setEditMulta(String(multa));
    setEditDesconto(String(desconto));
  };

  const saveEdit = async (id: string) => {
    try {
      await updateParcela.mutateAsync({
        id,
        data: {
          juros: Number(editJuros) || 0,
          multa: Number(editMulta) || 0,
          desconto: Number(editDesconto) || 0,
        },
      });
      setEditingId(null);
      toast.success('Parcela atualizada');
    } catch (err) {
      toast.error('Erro: ' + (err as Error).message);
    }
  };

  const openPagamentoModal = (parcela: Parcela) => {
    setPagamentoParcelaId(parcela.id);
    setPagamentoTab('completo');
    setPagamentoObs('');
    setPagamentoData(new Date().toISOString().slice(0, 10));
    setPagamentoDesconto('0');
    setPagamentoValorParcial('');
    const emp = emprestimoById.get(parcela.emprestimoId);
    const gw = emp?.gateway;
    const contaGateway = gw ? contasBancarias.find((c) => c.tipo === 'gateway' && c.nome.toLowerCase().includes(gw)) : null;
    const contaPadrao = contasBancarias.find((c) => c.padrao);
    setPagamentoConta(contaGateway?.nome ?? contaPadrao?.nome ?? (gw === 'efi' ? 'EFI BANK' : 'CONTA PRINCIPAL'));
  };

  const closePagamentoModal = () => setPagamentoParcelaId(null);

  const handleEfetuarPagamento = (parcela: Parcela) => {
    const desconto = parseFloat(pagamentoDesconto) || 0;
    const valorCorrigido = parcela.valorOriginal + parcela.juros + parcela.multa;
    const totalPagar = Math.max(valorCorrigido - desconto, 0);

    if (pagamentoTab === 'parcial') {
      const valorPago = parseFloat(pagamentoValorParcial) || 0;
      if (valorPago <= 0 || valorPago >= totalPagar) {
        toast.error('Valor parcial deve ser maior que zero e menor que o total.');
        return;
      }
      const restante = totalPagar - valorPago;
      updateParcela.mutate(
        {
          id: parcela.id,
          data: {
            valor: Math.max(restante, 0),
            desconto,
            observacao: pagamentoObs || null,
            conta_bancaria: pagamentoConta || null,
          },
        },
        {
          onSuccess: () => {
            toast.success(`Amortização registrada · Pago: ${formatCurrency(valorPago)} · Restante: ${formatCurrency(restante)}`);
            closePagamentoModal();
          },
          onError: (err) => toast.error(`Erro: ${err.message}`),
        },
      );
    } else {
      registrarPagamento.mutate(
        { id: parcela.id, dataPagamento: pagamentoData },
        {
          onSuccess: () => {
            updateParcela.mutate({
              id: parcela.id,
              data: {
                desconto,
                observacao: pagamentoObs || null,
                conta_bancaria: pagamentoConta || null,
              },
            });
            toast.success(`Parcela ${parcela.numero} quitada com sucesso!`);
            closePagamentoModal();
          },
          onError: (err) => toast.error(`Erro: ${err.message}`),
        },
      );
    }
  };

  const handleGerarPix = async (parcela: Parcela) => {
    const emp = emprestimoById.get(parcela.emprestimoId);
    const clienteNome = emp?.clienteNome || 'Cliente';
    setGerandoPixId(parcela.id);
    try {
      const { data: cli } = await supabase.from('clientes').select('cpf, nome, telefone').eq('id', parcela.clienteId).single() as { data: { cpf: string | null; nome: string; telefone: string } | null };
      const result = await criarCobvEfi.mutateAsync({
        parcela_id: parcela.id,
        emprestimo_id: parcela.emprestimoId,
        cliente_id: parcela.clienteId,
        valor: parcela.valor,
        descricao: `Parcela ${parcela.numero} - ${clienteNome}`,
        cliente_nome: clienteNome,
        cliente_cpf: cli?.cpf || undefined,
        data_vencimento: parcela.dataVencimento,
      });
      const charge = (result as any)?.charge;
      const brCode = charge?.br_code || '';
      const qrImage = charge?.qr_code_image || '';
      if (brCode || qrImage) {
        setPixResultDialog({ qrImage, brCode, parcelaNumero: parcela.numero });
      }
      const instSistema = instancias.find((i: any) => ['conectado', 'conectada', 'open', 'connected'].includes(i.status?.toLowerCase?.() || i.status));
      if (instSistema && cli?.telefone && brCode) {
        const phone = cli.telefone.replace(/\D/g, '').length <= 11 ? '55' + cli.telefone.replace(/\D/g, '') : cli.telefone.replace(/\D/g, '');
        const msg = `💰 *Cobrança PIX - Parcela ${parcela.numero}*\n\nOlá ${clienteNome}!\n\nValor: *${formatCurrency(parcela.valor)}*\nVencimento: ${formatDate(parcela.dataVencimento)}\n\n📱 Copie o código PIX abaixo e cole no app do seu banco:\n\n${brCode}\n\n_CasaDaMoeda_`;
        await enviarWhatsapp.mutateAsync({ instancia_id: instSistema.id, telefone: phone, conteudo: msg });
        if (qrImage) {
          const base64Data = qrImage.replace(/^data:image\/\w+;base64,/, '');
          await enviarWhatsapp.mutateAsync({ instancia_id: instSistema.id, telefone: phone, conteudo: `QR Code - Parcela ${parcela.numero}`, tipo: 'image', media_base64: base64Data });
        }
        toast.success('Cobrança PIX gerada e enviada ao cliente!');
      } else if (!instSistema || !cli?.telefone) {
        toast.success('Cobrança PIX gerada! Sem WhatsApp conectado para envio automático.');
      } else {
        toast.success('Cobrança PIX gerada!');
      }
    } catch (err) {
      toast.error(`Erro: ${err instanceof Error ? err.message : 'Falha ao gerar PIX'}`);
    } finally {
      setGerandoPixId(null);
    }
  };

  const pagamentoParcela = pagamentoParcelaId ? pendentes.find((p) => p.id === pagamentoParcelaId) || null : null;

  return (
    <div className="space-y-6">
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <HandshakeIcon className="w-4 h-4" /> Acordos
          </h3>
          {pendentes.length > 0 && (
            <Button
              size="sm"
              className="h-8 bg-green-600 hover:bg-green-700"
              onClick={() => setShowAcordoModal(true)}
            >
              <HandshakeIcon className="w-3.5 h-3.5 mr-1" />
              Criar acordo {temVencidas ? '(há parcelas vencidas)' : ''}
            </Button>
          )}
        </div>
        {acordos.length === 0 ? (
          <div className="text-xs text-muted-foreground">Nenhum acordo cadastrado</div>
        ) : (
          <div className="space-y-2">
            {acordos.map((a) => (
              <div key={a.id} className="border rounded p-3 text-xs flex items-center justify-between">
                <div>
                  <div className="font-medium">{formatCurrency(a.valor_divida_original)} em {a.num_parcelas}x</div>
                  <div className="text-muted-foreground">
                    Criado {formatDate(a.created_at)} · Status: {a.status}
                  </div>
                </div>
                <Badge
                  className={
                    a.status === 'ativo'
                      ? 'bg-green-100 text-green-800'
                      : a.status === 'quebrado'
                      ? 'bg-red-100 text-red-800'
                      : 'bg-gray-100 text-gray-800'
                  }
                >
                  {a.status}
                </Badge>
              </div>
            ))}
          </div>
        )}
        <p className="text-[11px] text-muted-foreground mt-2">
          Use <b>Criar acordo</b> para configurar entrada, parcelas, datas individuais e refinanciar a dívida.
        </p>
      </section>

      <AcordoFormModal
        open={showAcordoModal}
        onClose={() => setShowAcordoModal(false)}
        clienteId={clienteId}
        valorDividaSugerido={saldoPendente}
        origem="modal-cliente"
        onCriado={() => setShowAcordoModal(false)}
      />

      <section>
        <h3 className="text-sm font-semibold mb-3">Parcelas pendentes & vencidas</h3>
        {pendentes.length === 0 ? (
          <div className="text-xs text-muted-foreground">Sem parcelas pendentes</div>
        ) : (
          <div className="border rounded-lg overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-2 py-2 text-left">#</th>
                  <th className="px-2 py-2 text-left">Vencimento</th>
                  <th className="px-2 py-2 text-right">Original</th>
                  <th className="px-2 py-2 text-right">Juros</th>
                  <th className="px-2 py-2 text-right">Multa</th>
                  <th className="px-2 py-2 text-right">Desc.</th>
                  <th className="px-2 py-2 text-right">Total</th>
                  <th className="px-2 py-2 text-center">Status</th>
                  <th className="px-2 py-2 text-center">Ações</th>
                </tr>
              </thead>
              <tbody>
                {pendentes.map((p) => {
                  const total = p.valorOriginal + p.juros + p.multa - p.desconto;
                  const isEdit = editingId === p.id;
                  return (
                    <tr key={p.id} className="border-t">
                      <td className="px-2 py-2">{p.numero}</td>
                      <td className="px-2 py-2">{formatDate(p.dataVencimento)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{formatCurrency(p.valorOriginal)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {isEdit ? (
                          <Input
                            type="number"
                            value={editJuros}
                            onChange={(e) => setEditJuros(e.target.value)}
                            className="h-7 text-right w-20 inline-block"
                          />
                        ) : (
                          formatCurrency(p.juros)
                        )}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {isEdit ? (
                          <Input
                            type="number"
                            value={editMulta}
                            onChange={(e) => setEditMulta(e.target.value)}
                            className="h-7 text-right w-20 inline-block"
                          />
                        ) : (
                          formatCurrency(p.multa)
                        )}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {isEdit ? (
                          <Input
                            type="number"
                            value={editDesconto}
                            onChange={(e) => setEditDesconto(e.target.value)}
                            className="h-7 text-right w-20 inline-block"
                          />
                        ) : (
                          formatCurrency(p.desconto)
                        )}
                      </td>
                      <td className="px-2 py-2 text-right font-semibold tabular-nums">{formatCurrency(total)}</td>
                      <td className="px-2 py-2 text-center">
                        <Badge
                          className={
                            p.status === 'vencida'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-yellow-100 text-yellow-800'
                          }
                        >
                          {p.status}
                        </Badge>
                      </td>
                      <td className="px-2 py-2">
                        {isEdit ? (
                          <div className="flex gap-1 justify-center">
                            <Button size="sm" onClick={() => saveEdit(p.id)} disabled={updateParcela.isPending}>
                              <Save className="w-3 h-3" />
                            </Button>
                            <Button size="sm" variant="secondary" onClick={() => setEditingId(null)}>X</Button>
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-1 justify-center">
                            <Button
                              size="sm"
                              className="h-7 text-xs px-2 bg-green-600 hover:bg-green-700 text-white"
                              title="Efetuar pagamento"
                              onClick={() => openPagamentoModal(p)}
                              disabled={isBusy}
                            >
                              <DollarSign className="w-3.5 h-3.5 mr-1" />Pagar
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs px-2 text-blue-600 border-blue-200"
                              title="Gerar PIX e enviar via WhatsApp"
                              disabled={gerandoPixId === p.id || criarCobvEfi.isPending}
                              onClick={() => handleGerarPix(p)}
                            >
                              {gerandoPixId === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <QrCode className="w-3.5 h-3.5" />}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs px-2 text-orange-600 border-orange-200"
                              title="Confirmar pagamento manual com comprovante"
                              onClick={() => {
                                setComprovanteParcela(p);
                                setShowComprovanteModal(true);
                              }}
                            >
                              <Upload className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs px-2"
                              title="Editar juros/multa/desconto"
                              onClick={() => startEdit(p.id, p.juros, p.multa, p.desconto)}
                              disabled={isBusy}
                            >
                              <Percent className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Modal: Efetuar Pagamento (completo / parcial) ── */}
      {pagamentoParcela && (() => {
        const parcela = pagamentoParcela;
        const desconto = parseFloat(pagamentoDesconto) || 0;
        const valorCorrigido = parcela.valorOriginal + parcela.juros + parcela.multa;
        const totalPagar = Math.max(valorCorrigido - desconto, 0);
        const diasAtraso = (() => {
          const venc = new Date(parcela.dataVencimento);
          const pagDt = new Date(pagamentoData);
          const diff = Math.floor((pagDt.getTime() - venc.getTime()) / 86400000);
          return Math.max(diff, 0);
        })();
        const isUltima = pendentesCount <= 1;

        return (
          <Dialog open onOpenChange={closePagamentoModal}>
            <DialogContent className="max-w-lg sm:max-w-lg">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-green-500" />
                  Efetuar Pagamento — Parcela {parcela.numero}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                {isUltima && (
                  <div className="flex items-center gap-2 rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-700 dark:text-yellow-400">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    Última parcela pendente deste cliente
                  </div>
                )}

                <div>
                  <Label className="text-xs mb-1 block">Observação</Label>
                  <Textarea
                    placeholder="Observação sobre o pagamento..."
                    className="resize-none h-16 text-sm"
                    value={pagamentoObs}
                    onChange={(e) => setPagamentoObs(e.target.value)}
                  />
                </div>

                <Tabs value={pagamentoTab} onValueChange={(v) => setPagamentoTab(v as 'completo' | 'parcial')}>
                  <TabsList className="w-full grid grid-cols-2">
                    <TabsTrigger value="completo">Pagamento Completo</TabsTrigger>
                    <TabsTrigger value="parcial">Pagamento Parcial</TabsTrigger>
                  </TabsList>

                  <TabsContent value="completo" className="space-y-3 mt-3">
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <Label className="text-xs">Vencimento</Label>
                        <Input value={parcela.dataVencimento} readOnly className="h-8 text-xs bg-muted" />
                      </div>
                      <div>
                        <Label className="text-xs">Pagamento</Label>
                        <Input type="date" value={pagamentoData} onChange={(e) => setPagamentoData(e.target.value)} className="h-8 text-xs" />
                      </div>
                      <div>
                        <Label className="text-xs">Dias</Label>
                        <Input value={diasAtraso} readOnly className="h-8 text-xs bg-muted" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Valor Parcela</Label>
                        <Input value={formatCurrency(parcela.valorOriginal)} readOnly className="h-8 text-xs bg-muted" />
                      </div>
                      <div>
                        <Label className="text-xs">Valor Corrigido</Label>
                        <Input value={formatCurrency(valorCorrigido)} readOnly className="h-8 text-xs bg-muted" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Desconto (R$)</Label>
                        <Input type="number" min="0" step="0.01" value={pagamentoDesconto} onChange={(e) => setPagamentoDesconto(e.target.value)} className="h-8 text-xs" />
                      </div>
                      <div>
                        <Label className="text-xs font-semibold">Total a pagar</Label>
                        <Input value={formatCurrency(totalPagar)} readOnly className="h-8 text-xs bg-muted font-bold" />
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="parcial" className="space-y-3 mt-3">
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <Label className="text-xs">Vencimento</Label>
                        <Input value={parcela.dataVencimento} readOnly className="h-8 text-xs bg-muted" />
                      </div>
                      <div>
                        <Label className="text-xs">Pagamento</Label>
                        <Input type="date" value={pagamentoData} onChange={(e) => setPagamentoData(e.target.value)} className="h-8 text-xs" />
                      </div>
                      <div>
                        <Label className="text-xs">Dias</Label>
                        <Input value={diasAtraso} readOnly className="h-8 text-xs bg-muted" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Valor Total</Label>
                        <Input value={formatCurrency(totalPagar)} readOnly className="h-8 text-xs bg-muted" />
                      </div>
                      <div>
                        <Label className="text-xs">Valor a Pagar</Label>
                        <Input type="number" min="0.01" step="0.01" max={totalPagar - 0.01} placeholder="0,00" value={pagamentoValorParcial} onChange={(e) => setPagamentoValorParcial(e.target.value)} className="h-8 text-xs" autoFocus />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Desconto (R$)</Label>
                        <Input type="number" min="0" step="0.01" value={pagamentoDesconto} onChange={(e) => setPagamentoDesconto(e.target.value)} className="h-8 text-xs" />
                      </div>
                      <div>
                        <Label className="text-xs">Restante</Label>
                        <Input value={formatCurrency(Math.max(totalPagar - (parseFloat(pagamentoValorParcial) || 0), 0))} readOnly className="h-8 text-xs bg-muted" />
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>

                <div>
                  <Label className="text-xs">Conta Bancária</Label>
                  <Select value={pagamentoConta} onValueChange={setPagamentoConta}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {contasBancarias.length > 0 ? (
                        contasBancarias.map((c) => (
                          <SelectItem key={c.id} value={c.nome}>
                            {c.nome}{c.padrao ? ' — Padrão' : ''}
                          </SelectItem>
                        ))
                      ) : (
                        <>
                          <SelectItem value="EFI BANK">EFI Bank (Gateway PIX)</SelectItem>
                          <SelectItem value="CONTA PRINCIPAL">CONTA PRINCIPAL</SelectItem>
                          <SelectItem value="CONTA SECUNDÁRIA">CONTA SECUNDÁRIA</SelectItem>
                          <SelectItem value="CAIXA">CAIXA</SelectItem>
                        </>
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex gap-3 justify-end pt-2">
                  <Button variant="outline" onClick={closePagamentoModal}>Cancelar</Button>
                  <Button className="bg-green-600 hover:bg-green-700" onClick={() => handleEfetuarPagamento(parcela)} disabled={isBusy}>
                    {isBusy ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <CheckCircle className="w-4 h-4 mr-1" />}
                    Efetuar Pagamento
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        );
      })()}

      {/* ── Modal: Confirmar Pagamento Manual com Comprovante ── */}
      {showComprovanteModal && comprovanteParcela && (
        <Dialog open onOpenChange={() => { setShowComprovanteModal(false); setComprovanteParcela(null); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Upload className="w-5 h-5 text-orange-500" />
                Confirmar Pagamento — Parcela {comprovanteParcela.numero}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <Label className="text-xs">Valor</Label>
                  <p className="font-semibold">{formatCurrency(comprovanteParcela.valor)}</p>
                </div>
                <div>
                  <Label className="text-xs">Vencimento</Label>
                  <p className="font-semibold">{formatDate(comprovanteParcela.dataVencimento)}</p>
                </div>
              </div>

              <ComprovanteUploader
                parcela={{
                  valor: comprovanteParcela.valor,
                  juros: comprovanteParcela.juros,
                  multa: comprovanteParcela.multa,
                  desconto: comprovanteParcela.desconto,
                }}
                submitting={comprovanteLoading}
                onCancel={() => { setShowComprovanteModal(false); setComprovanteParcela(null); }}
                onConfirm={async ({ file, ocr, ocrAvaliacao, confirmDivergencia }) => {
                  if (!comprovanteParcela) return;
                  setComprovanteLoading(true);
                  try {
                    const ext = file.name.split('.').pop() || 'png';
                    const path = `comprovantes/${comprovanteParcela.id}_${Date.now()}.${ext}`;
                    const { error: upErr } = await supabase.storage.from('whatsapp-media').upload(path, file, { upsert: true });
                    if (upErr) throw upErr;
                    const { data: urlData } = supabase.storage.from('whatsapp-media').getPublicUrl(path);

                    await registrarPagamento.mutateAsync({ id: comprovanteParcela.id, dataPagamento: new Date().toISOString().slice(0, 10) });
                    await updateParcela.mutateAsync({
                      id: comprovanteParcela.id,
                      data: {
                        comprovante_url: urlData.publicUrl,
                        pagamento_tipo: 'manual' as const,
                        comprovante_valor_ocr: ocr?.valor ?? null,
                        comprovante_data_ocr: ocr?.data ?? null,
                        comprovante_chave_ocr: ocr?.chavePix ?? null,
                        comprovante_ocr_score: ocr?.confidenceMedia ?? null,
                        comprovante_ocr_status: ocr
                          ? (ocrAvaliacao?.aprovado ? 'auto_aprovado' : confirmDivergencia ? 'divergencia' : 'manual')
                          : 'sem_ocr',
                      } as any,
                    });

                    toast.success(`Parcela ${comprovanteParcela.numero} confirmada com comprovante!`);
                    setShowComprovanteModal(false);
                    setComprovanteParcela(null);
                  } catch (err) {
                    toast.error(`Erro: ${err instanceof Error ? err.message : 'Falha ao confirmar pagamento'}`);
                  } finally {
                    setComprovanteLoading(false);
                  }
                }}
              />
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* ── Modal: Resultado PIX ── */}
      {pixResultDialog && (
        <Dialog open onOpenChange={() => setPixResultDialog(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <QrCode className="w-5 h-5 text-blue-600" />
                Cobrança PIX — Parcela {pixResultDialog.parcelaNumero}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {pixResultDialog.qrImage && (
                <div className="flex justify-center">
                  <img src={pixResultDialog.qrImage} alt="QR Code PIX" className="w-48 h-48 rounded-lg border" />
                </div>
              )}
              {pixResultDialog.brCode && (
                <div className="space-y-2">
                  <Label className="text-xs font-medium">PIX Copia e Cola</Label>
                  <div className="flex gap-2">
                    <Input
                      value={pixResultDialog.brCode}
                      readOnly
                      className="text-xs font-mono flex-1"
                      onClick={(e) => (e.target as HTMLInputElement).select()}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0"
                      onClick={() => {
                        navigator.clipboard.writeText(pixResultDialog.brCode!);
                        toast.success('Código PIX copiado!');
                      }}
                    >
                      <Copy className="w-4 h-4 mr-1" />
                      Copiar
                    </Button>
                  </div>
                </div>
              )}
              <p className="text-xs text-muted-foreground text-center">
                O QR Code e o código foram enviados ao cliente via WhatsApp (se conectado).
              </p>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* ── Modal: Visualizar Comprovante ── */}
      {viewComprovanteUrl && (
        <Dialog open onOpenChange={() => setViewComprovanteUrl(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ImageIcon className="w-5 h-5" />
                Comprovante de Pagamento
              </DialogTitle>
            </DialogHeader>
            <img src={viewComprovanteUrl} alt="Comprovante" className="w-full rounded-lg border" />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   TAB 4 — WHATSAPP (template + envio)
   ═══════════════════════════════════════════════════════════ */

function WhatsappTab({ cliente }: { cliente: NonNullable<ReturnType<typeof useCliente>['data']> }) {
  const { data: instancias = [] } = useInstancias();
  const [categoria, setCategoria] = useState<'cobranca' | 'negociacao' | 'lembrete' | 'boas_vindas'>('cobranca');
  const { data: templates = [] } = useTemplatesByCategoria(categoria);
  const enviar = useEnviarWhatsapp();

  const [instanciaId, setInstanciaId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [mensagem, setMensagem] = useState('');

  // Preenche mensagem com template
  useEffect(() => {
    if (!templateId) return;
    const tpl = templates.find((t) => t.id === templateId);
    if (!tpl) return;
    let msg = cliente.sexo === 'feminino' ? tpl.mensagemFeminino : tpl.mensagemMasculino;
    msg = msg.replace(/\{nome\}/gi, cliente.nome);
    msg = msg.replace(/\{valor\}/gi, formatCurrency(cliente.valor || 0));
    msg = msg.replace(/\{dias_atraso\}/gi, String(cliente.diasAtraso ?? 0));
    msg = msg.replace(/\{vencimento\}/gi, formatDate(cliente.vencimento));
    setMensagem(msg);
  }, [templateId, templates, cliente]);

  const instanciaAtiva = instancias.find((i: any) => i.id === instanciaId);

  const handleEnviar = async () => {
    if (!instanciaId) return toast.error('Selecione uma instância WhatsApp');
    if (!mensagem.trim()) return toast.error('Mensagem vazia');
    try {
      await enviar.mutateAsync({
        instancia_id: instanciaId,
        telefone: normalizePhoneBR(cliente.telefone),
        conteudo: mensagem,
        cliente_id: cliente.id,
      });
      toast.success('Mensagem enviada');
      setMensagem('');
      setTemplateId('');
    } catch (err) {
      toast.error('Falha no envio: ' + (err as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Field label="Instância">
          <Select value={instanciaId} onValueChange={setInstanciaId}>
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              {instancias.map((i: any) => (
                <SelectItem key={i.id} value={i.id}>
                  {i.nome} {i.status === 'connected' ? '🟢' : '🔴'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Categoria do template">
          <Select value={categoria} onValueChange={(v: any) => { setCategoria(v); setTemplateId(''); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="cobranca">Cobrança</SelectItem>
              <SelectItem value="negociacao">Negociação</SelectItem>
              <SelectItem value="lembrete">Lembrete</SelectItem>
              <SelectItem value="boas_vindas">Boas-vindas</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Template">
          <Select value={templateId} onValueChange={setTemplateId}>
            <SelectTrigger><SelectValue placeholder="Selecionar template" /></SelectTrigger>
            <SelectContent>
              {templates.length === 0 && <SelectItem value="__empty__" disabled>Nenhum template</SelectItem>}
              {templates.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <Field label={`Mensagem (para ${cliente.telefone})`}>
        <Textarea
          rows={8}
          value={mensagem}
          onChange={(e) => setMensagem(e.target.value)}
          placeholder="Escreva ou escolha um template..."
        />
      </Field>

      <div className="flex justify-end gap-2">
        <Button
          variant="secondary"
          onClick={() => window.open(`https://wa.me/${normalizePhoneBR(cliente.telefone)}`, '_blank')}
        >
          <ExternalLink className="w-3.5 h-3.5 mr-1" /> Abrir wa.me
        </Button>
        <Button onClick={handleEnviar} disabled={enviar.isPending || !instanciaId || !mensagem.trim()}>
          {enviar.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
          Enviar via {instanciaAtiva?.instance_name ?? 'WhatsApp'}
        </Button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   TAB 5 — HISTÓRICO (pagamentos + contatos)
   ═══════════════════════════════════════════════════════════ */

function HistoricoTab({ clienteId }: { clienteId: string }) {
  const { data: parcelas = [] } = useParcelasByCliente(clienteId);
  const { data: cliente } = useCliente(clienteId);
  const pagas = parcelas
    .filter((p) => p.status === 'paga')
    .sort((a, b) => (b.dataPagamento ?? '').localeCompare(a.dataPagamento ?? ''));

  const [cards, setCards] = useState<any[]>([]);
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('kanban_cobranca')
        .select('id, etapa, observacao, tentativas_contato, ultimo_contato, created_at, updated_at')
        .eq('cliente_id', clienteId)
        .order('created_at', { ascending: false });
      setCards(data ?? []);
    })();
  }, [clienteId]);

  const ultimoContatoIso = cliente?.ultimoContato ?? cards[0]?.ultimo_contato;
  const diasDesdeContato = ultimoContatoIso
    ? Math.floor((Date.now() - new Date(ultimoContatoIso).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <StatCard
          label="Último contato"
          value={ultimoContatoIso ? formatDate(ultimoContatoIso) : '—'}
          hint={diasDesdeContato !== null ? `há ${diasDesdeContato} dia${diasDesdeContato === 1 ? '' : 's'}` : undefined}
        />
        <StatCard label="Parcelas pagas" value={String(pagas.length)} />
        <StatCard label="Tentativas de contato" value={String(cards.reduce((s, c) => s + (c.tentativas_contato ?? 0), 0))} />
      </section>

      <section>
        <h3 className="text-sm font-semibold mb-3">Pagamentos realizados</h3>
        {pagas.length === 0 ? (
          <div className="text-xs text-muted-foreground">Sem pagamentos registrados</div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-2 py-2 text-left">Parcela</th>
                  <th className="px-2 py-2 text-left">Pago em</th>
                  <th className="px-2 py-2 text-right">Valor</th>
                  <th className="px-2 py-2 text-left">Tipo</th>
                  <th className="px-2 py-2 text-center">Comprovante</th>
                </tr>
              </thead>
              <tbody>
                {pagas.map((p) => (
                  <tr key={p.id} className="border-t">
                    <td className="px-2 py-2">#{p.numero}</td>
                    <td className="px-2 py-2">{formatDate(p.dataPagamento)}</td>
                    <td className="px-2 py-2 text-right">{formatCurrency(p.valor)}</td>
                    <td className="px-2 py-2">{p.pagamentoTipo ?? '—'}</td>
                    <td className="px-2 py-2 text-center">
                      {p.comprovanteUrl ? (
                        <a href={p.comprovanteUrl} target="_blank" rel="noreferrer">
                          <Eye className="w-3.5 h-3.5 inline" />
                        </a>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h3 className="text-sm font-semibold mb-3">Régua de cobrança</h3>
        {cards.length === 0 ? (
          <div className="text-xs text-muted-foreground">Sem registros de cobrança</div>
        ) : (
          <div className="space-y-2">
            {cards.map((c) => (
              <div key={c.id} className="border rounded p-3 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <Badge variant="secondary">{c.etapa}</Badge>
                  <span className="text-muted-foreground">
                    {formatDate(c.updated_at ?? c.created_at)}
                  </span>
                </div>
                <div className="text-muted-foreground">
                  {c.tentativas_contato ?? 0} tentativa(s) · último contato: {c.ultimo_contato ? formatDate(c.ultimo_contato) : '—'}
                </div>
                {c.observacao && <div className="text-foreground">{c.observacao}</div>}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="border rounded-lg p-3">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}
