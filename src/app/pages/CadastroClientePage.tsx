/**
 * @module CadastroClientePage
 * @description Página pública tokenizada — formulário multi-step.
 *
 * Etapas:
 *  1. Dados Pessoais
 *  2. Endereço
 *  3. Pix
 *  4. Documentação (câmera obrigatória)
 *  5. Contatos de Referência
 *  6. Confirmação de Envio
 *  → sucesso / erro
 *
 * @route /cadastro/:token (público, sem autenticação)
 */
import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { supabase } from '../lib/supabase';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent } from '../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Loader2, CheckCircle2, AlertCircle, ChevronLeft, ChevronRight, Camera, Send } from 'lucide-react';
import { toast } from 'sonner';
import { CameraCapture } from '../components/CameraCapture';
import { analyzeDocument, type TamperAnalysis } from '../lib/exif-analyzer';
import casadamoedaBanner from '../assets/casadamoeda.png';

// ── Constants ────────────────────────────────────────────────
const ESTADOS_BR = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
  'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO',
];

const PIX_TYPE_LABEL: Record<string, string> = {
  cpf: 'CPF', cnpj: 'CNPJ', email: 'Email', telefone: 'Telefone', aleatoria: 'Chave aleatória',
};

// ── Types ────────────────────────────────────────────────────
type DocCapture = {
  file: File | null;
  preview: string | null;
  analysis: TamperAnalysis | null;
  isExisting: boolean;
};
const emptyDoc = (isExisting = false): DocCapture => ({ file: null, preview: null, analysis: null, isExisting });

type FormState = {
  nome: string; email: string; telefone: string; cpf: string;
  sexo: 'masculino' | 'feminino' | 'outro';
  profissao: string; renda_mensal: string;
  rua: string; numero: string; bairro: string; estado: string; cidade: string; cep: string;
  pix_key: string; pix_key_type: string;
  contatos_referencia: Array<{ nome: string; telefone: string; parentesco: string }>;
};

const EMPTY: FormState = {
  nome: '', email: '', telefone: '', cpf: '', sexo: 'masculino',
  profissao: '', renda_mensal: '',
  rua: '', numero: '', bairro: '', estado: '', cidade: '', cep: '',
  pix_key: '', pix_key_type: 'cpf',
  contatos_referencia: [
    { nome: '', telefone: '', parentesco: '' },
    { nome: '', telefone: '', parentesco: '' },
    { nome: '', telefone: '', parentesco: '' },
  ],
};

type PageStage = 'loading' | 'form' | 'submitting' | 'done' | 'error' | 'expired' | 'used';
type WizardStep = 1 | 2 | 3 | 4 | 5 | 6;

const STEP_LABELS: Record<WizardStep, string> = {
  1: 'Dados Pessoais', 2: 'Endereço', 3: 'Pix',
  4: 'Documentos', 5: 'Referências', 6: 'Confirmação',
};
const TOTAL_STEPS = 6;

// ── Helpers ──────────────────────────────────────────────────
function fmtCep(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}
function fmtCpf(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}
function parseBRL(v: string) { return Number(v.replace(/\./g, '').replace(',', '.')) || 0; }
function formatBRLValue(n: number) { return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

// ── Step progress bar ────────────────────────────────────────
function StepBar({ step, isUpdate }: { step: WizardStep; isUpdate: boolean }) {
  return (
    <div className="w-full mb-6">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-muted-foreground">
          Etapa {step} de {TOTAL_STEPS}
        </span>
        <span className="text-xs font-semibold text-primary">{STEP_LABELS[step]}</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all duration-300"
          style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
        />
      </div>
      <p className="text-center text-xs text-muted-foreground mt-3">
        {isUpdate ? 'Atualização de Cadastro' : 'Cadastro de Cliente'}
      </p>
    </div>
  );
}

// ── Field helpers ────────────────────────────────────────────
function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-sm mb-1 block">
        {label}{required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {children}
    </div>
  );
}

// ── Summary row for Confirmation step ────────────────────────
function SumRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between gap-2 py-1.5 border-b last:border-0 text-sm">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="font-medium text-right truncate">{value || <span className="text-muted-foreground italic">Não informado</span>}</span>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────
export default function CadastroClientePage() {
  const { token } = useParams<{ token: string }>();
  const [stage, setStage] = useState<PageStage>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [linkRow, setLinkRow] = useState<{ id: string; cliente_id: string | null } | null>(null);
  const [isUpdate, setIsUpdate] = useState(false);
  const [step, setStep] = useState<WizardStep>(1);
  const [form, setForm] = useState<FormState>(EMPTY);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((p) => ({ ...p, [k]: v }));

  const [docFront, setDocFront] = useState<DocCapture>(emptyDoc());
  const [docBack, setDocBack] = useState<DocCapture>(emptyDoc());
  const [comprov, setComprov] = useState<DocCapture>(emptyDoc());

  // ── Load token ───────────────────────────────────────────────
  useEffect(() => {
    if (!token) { setStage('error'); setErrorMsg('Link inválido.'); return; }
    (async () => {
      try {
        const { data: link, error } = await supabase
          .from('cadastro_links')
          .select('id, cliente_id, expires_at, used_at')
          .eq('token', token)
          .maybeSingle();
        if (error) throw error;
        if (!link) { setStage('error'); setErrorMsg('Link não encontrado.'); return; }
        if (link.used_at) { setStage('used'); return; }
        if (new Date(link.expires_at) < new Date()) { setStage('expired'); return; }

        setLinkRow({ id: link.id, cliente_id: link.cliente_id });

        if (link.cliente_id) {
          setIsUpdate(true);
          const { data: cli, error: cliErr } = await supabase.from('clientes').select('*').eq('id', link.cliente_id).maybeSingle();
          if (cliErr) throw cliErr;
          if (cli) {
            const isMigratedEmail = (cli.email ?? '').toLowerCase().includes('@migracao');
            setForm({
              nome: cli.nome ?? '', email: isMigratedEmail ? '' : (cli.email ?? ''),
              telefone: cli.telefone ?? '', cpf: cli.cpf ?? '',
              sexo: (cli.sexo as FormState['sexo']) ?? 'masculino',
              profissao: cli.profissao ?? '',
              renda_mensal: cli.renda_mensal ? formatBRLValue(Number(cli.renda_mensal)) : '',
              rua: cli.rua ?? '', numero: cli.numero ?? '', bairro: cli.bairro ?? '',
              estado: cli.estado ?? '', cidade: cli.cidade ?? '', cep: cli.cep ?? '',
              pix_key: cli.pix_key ?? '', pix_key_type: cli.pix_key_type ?? 'cpf',
              contatos_referencia: Array.isArray(cli.contatos_referencia) && cli.contatos_referencia.length
                ? (cli.contatos_referencia as any[]).slice(0, 3).map((r: any) => ({
                    nome: r.nome ?? r.name ?? '', telefone: r.telefone ?? r.phone ?? '', parentesco: r.parentesco ?? r.relationship ?? '',
                  }))
                : EMPTY.contatos_referencia,
            });
            setDocFront(emptyDoc(!!cli.documento_frente_url));
            setDocBack(emptyDoc(!!cli.documento_verso_url));
            setComprov(emptyDoc(!!cli.comprovante_endereco_url));
          }
        }
        setStage('form');
      } catch (e: any) { setStage('error'); setErrorMsg(e?.message ?? String(e)); }
    })();
  }, [token]);

  // ── ViaCEP auto-fill ────────────────────────────────────────
  useEffect(() => {
    const clean = form.cep.replace(/\D/g, '');
    if (clean.length !== 8) return;
    fetch(`https://viacep.com.br/ws/${clean}/json/`).then((r) => r.json()).then((d) => {
      if (!d.erro) setForm((p) => ({ ...p, rua: d.logradouro || p.rua, bairro: d.bairro || p.bairro, cidade: d.localidade || p.cidade, estado: d.uf || p.estado }));
    }).catch(() => {});
  }, [form.cep]);

  // ── Camera capture handler ───────────────────────────────────
  const handleCapture = async (setter: (d: DocCapture) => void, file: File, preview: string, viaStream: boolean) => {
    const analysis = await analyzeDocument(file, viaStream);
    setter({ file, preview, analysis, isExisting: false });
  };

  // ── Step validation ──────────────────────────────────────────
  const validateStep = (s: WizardStep): boolean => {
    if (s === 1) {
      if (!form.nome.trim()) { toast.error('Informe seu nome completo'); return false; }
      if (!form.telefone.trim()) { toast.error('Informe seu telefone'); return false; }
    }
    return true;
  };

  const goNext = () => {
    if (!validateStep(step)) return;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setStep((s) => Math.min(s + 1, TOTAL_STEPS) as WizardStep);
  };
  const goBack = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setStep((s) => Math.max(s - 1, 1) as WizardStep);
  };

  // ── Submit ───────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!linkRow) return;
    setStage('submitting');
    try {
      const contatos = form.contatos_referencia
        .filter((c) => c.nome.trim() && c.telefone.trim())
        .map((c) => ({ nome: c.nome, telefone: c.telefone, parentesco: c.parentesco }));

      const payload: Record<string, unknown> = {
        nome: form.nome.trim(), email: form.email.trim() || '',
        telefone: form.telefone.replace(/\D/g, ''), cpf: form.cpf.replace(/\D/g, '') || null,
        sexo: form.sexo, profissao: form.profissao || null,
        renda_mensal: parseBRL(form.renda_mensal) || 0,
        rua: form.rua || null, numero: form.numero || null, bairro: form.bairro || null,
        estado: form.estado || null, cidade: form.cidade || null, cep: form.cep.replace(/\D/g, '') || null,
        pix_key: form.pix_key || null, pix_key_type: form.pix_key_type || null,
        contatos_referencia: contatos, cadastro_atualizado_em: new Date().toISOString(),
      };

      let clienteId = linkRow.cliente_id;
      if (clienteId) {
        // Verifica se o CPF informado já pertence a outro cliente (violaria unique constraint).
        // Se sim, remove o CPF do payload para não sobrescrever.
        const cpfLimpo = (payload.cpf as string) || '';
        if (cpfLimpo) {
          const { data: byCpf } = await supabase
            .from('clientes').select('id').eq('cpf', cpfLimpo).neq('id', clienteId).maybeSingle();
          if (byCpf) {
            delete payload.cpf; // CPF pertence a outro cadastro — não altera
          }
        }
        const { error } = await supabase.from('clientes').update(payload).eq('id', clienteId);
        if (error) throw error;
      } else {
        // Link genérico: verifica se já existe cliente com o mesmo CPF ou telefone.
        // Se sim, faz UPDATE em vez de INSERT para evitar violação de unique constraint.
        const cpfLimpo = (payload.cpf as string) || '';
        const telLimpo = (payload.telefone as string) || '';
        let existingId: string | null = null;

        if (cpfLimpo) {
          const { data: byCpf } = await supabase
            .from('clientes').select('id').eq('cpf', cpfLimpo).maybeSingle();
          existingId = (byCpf as { id: string } | null)?.id ?? null;
        }
        if (!existingId && telLimpo) {
          const { data: byTel } = await supabase
            .from('clientes').select('id').eq('telefone', telLimpo).maybeSingle();
          existingId = (byTel as { id: string } | null)?.id ?? null;
        }

        if (existingId) {
          // Cliente já existe: atualiza dados
          const { error } = await supabase.from('clientes').update(payload).eq('id', existingId);
          if (error) throw error;
          clienteId = existingId;
        } else {
          // Novo cliente: gera UUID no client para evitar RETURNING (SELECT RLS stacking).
          // crypto.randomUUID() não está disponível no Safari iOS < 15.4, usamos fallback.
          const newId: string = (typeof crypto !== 'undefined' && crypto.randomUUID)
            ? crypto.randomUUID()
            : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
                const r = (Math.random() * 16) | 0;
                return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
              });
          const { error } = await supabase
            .from('clientes')
            .insert({ id: newId, ...payload, status: 'em_dia', score_interno: 500 });
          if (error) throw error;
          clienteId = newId;
        }
      }

      const uploadDoc = async (doc: DocCapture, name: string): Promise<string | null> => {
        if (!doc.file) return null;
        const path = `${clienteId}/${name}.jpg`;
        const { error } = await supabase.storage.from('client-documents').upload(path, doc.file, { cacheControl: '3600', upsert: true, contentType: 'image/jpeg' });
        if (error) throw error;
        return path;
      };

      const docUpdates: Record<string, string> = {};
      const fp = await uploadDoc(docFront, 'documento_frente'); if (fp) docUpdates.documento_frente_url = fp;
      const bp = await uploadDoc(docBack, 'documento_verso'); if (bp) docUpdates.documento_verso_url = bp;
      const cp = await uploadDoc(comprov, 'comprovante_endereco'); if (cp) docUpdates.comprovante_endereco_url = cp;
      if (Object.keys(docUpdates).length > 0) {
        const { error } = await supabase.from('clientes').update(docUpdates).eq('id', clienteId!);
        if (error) throw error;
      }

      const buildDocMeta = (doc: DocCapture) =>
        doc.file && doc.analysis
          ? { flags: doc.analysis.flags, score: doc.analysis.score, label: doc.analysis.label, source: doc.analysis.source }
          : doc.isExisting ? { flags: ['documento_pre_existente'], score: 0, label: 'ok', source: 'existente' }
          : { flags: ['nao_enviado'], score: 0, label: 'ok', source: 'nao_enviado' };

      const metadata = {
        user_agent: navigator.userAgent, submitted_at: new Date().toISOString(),
        doc_frente: buildDocMeta(docFront), doc_verso: buildDocMeta(docBack), comprovante: buildDocMeta(comprov),
      };

      const { error: linkErr } = await supabase.from('cadastro_links').update({
        used_at: new Date().toISOString(), used_cliente_id: clienteId,
        submission_status: 'pendente_revisao', metadata,
      }).eq('id', linkRow.id);
      if (linkErr) throw linkErr;

      setStage('done');
    } catch (e: any) {
      console.error('[cadastro] submit error:', e);
      toast.error(`Erro ao salvar: ${e?.message ?? String(e)}`);
      setStage('form');
    }
  };

  // ── Non-form screens ─────────────────────────────────────────
  if (stage === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" /> Carregando…
        </div>
      </div>
    );
  }

  if (stage === 'expired' || stage === 'used' || stage === 'error') {
    const cfg = {
      expired: { title: 'Link expirado', desc: 'Este link expirou. Solicite um novo link à equipe.' },
      used: { title: 'Cadastro já enviado', desc: 'O cadastro deste link já foi enviado. Para atualizar novamente, peça um novo link.' },
      error: { title: 'Não foi possível abrir o link', desc: errorMsg || 'Tente novamente ou solicite um novo link.' },
    }[stage as 'expired' | 'used' | 'error'];
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <Card className="max-w-md w-full">
          <CardContent className="pt-8 pb-8 text-center space-y-3">
            <AlertCircle className="w-12 h-12 text-amber-500 mx-auto" />
            <h2 className="text-xl font-semibold">{cfg.title}</h2>
            <p className="text-muted-foreground text-sm">{cfg.desc}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (stage === 'done') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <Card className="max-w-md w-full">
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <CheckCircle2 className="w-16 h-16 text-green-600 mx-auto" />
            <h2 className="text-xl font-semibold">Cadastro enviado!</h2>
            <p className="text-muted-foreground text-sm">
              Recebemos seus dados. Nossa equipe irá analisar e entrar em contato pelo WhatsApp em breve.
              Você já pode fechar esta página.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (stage === 'submitting') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4 text-muted-foreground">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
          <p className="font-medium">Enviando cadastro…</p>
          <p className="text-sm">Aguarde, estamos salvando seus dados.</p>
        </div>
      </div>
    );
  }

  // ── Wizard layout ────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background">
      {/* Fixed top banner */}
      <div className=" top-0 z-10 w-full bg-white shadow-sm">
        <img src={casadamoedaBanner} alt="Casa da Moeda" className="w-full h-auto max-h-58 object-cover" />
      </div>
      {/* Ticker de aviso */}
      <div className="w-full overflow-hidden bg-amber-500 text-white py-2 text-xs font-medium">
        <style>{`@keyframes marquee-ticker{from{transform:translateX(0)}to{transform:translateX(-50%)}}`}</style>
        <div style={{ display: 'inline-flex', whiteSpace: 'nowrap', animation: 'marquee-ticker 12s linear infinite' }}>
          <span style={{ paddingRight: '4rem' }}>⚠️ Atenção: preencha seus dados corretamente. Muita atenção com os envios, principalmente a chave Pix. Possuímos verificador de documentos adulterados — caso o sistema identifique irregularidades, seu cadastro será anulado e você ficará impossibilitado de solicitar novos serviços.</span>
          <span style={{ paddingRight: '4rem' }}>⚠️ Atenção: preencha seus dados corretamente. Muita atenção com os envios, principalmente a chave Pix. Possuímos verificador de documentos adulterados — caso o sistema identifique irregularidades, seu cadastro será anulado e você ficará impossibilitado de solicitar novos serviços.</span>
        </div>
      </div>
      <div className="max-w-lg mx-auto px-4 py-6">
        <StepBar step={step} isUpdate={isUpdate} />

        {/* ── Step 1: Dados Pessoais ──────────────────────── */}
        {step === 1 && (
          <div className="space-y-3">
            <Field label="Nome completo" required>
              <Input value={form.nome} onChange={(e) => set('nome', e.target.value)} placeholder="Seu nome completo" autoFocus />
            </Field>
            <Field label="Telefone" required>
              <Input value={form.telefone} onChange={(e) => set('telefone', e.target.value)} placeholder="(11) 99999-9999" inputMode="tel" />
            </Field>
            <Field label="Email">
              <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="email@exemplo.com" />
            </Field>
            <Field label="CPF">
              <Input value={form.cpf} onChange={(e) => set('cpf', fmtCpf(e.target.value))} placeholder="000.000.000-00" inputMode="numeric" />
            </Field>
            <Field label="Sexo">
              <Select value={form.sexo} onValueChange={(v) => set('sexo', v as FormState['sexo'])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="masculino">Masculino</SelectItem>
                  <SelectItem value="feminino">Feminino</SelectItem>
                  <SelectItem value="outro">Outro</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Profissão">
              <Input value={form.profissao} onChange={(e) => set('profissao', e.target.value)} placeholder="Ex: Autônomo" />
            </Field>
            <Field label="Renda Mensal (R$)">
              <Input value={form.renda_mensal} onChange={(e) => set('renda_mensal', e.target.value)} placeholder="2.500,00" inputMode="decimal" />
            </Field>
          </div>
        )}

        {/* ── Step 2: Endereço ────────────────────────────── */}
        {step === 2 && (
          <div className="space-y-3">
            <Field label="CEP">
              <Input value={form.cep} onChange={(e) => set('cep', fmtCep(e.target.value))} placeholder="00000-000" inputMode="numeric" />
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <Field label="Rua / Logradouro">
                  <Input value={form.rua} onChange={(e) => set('rua', e.target.value)} placeholder="Nome da rua" />
                </Field>
              </div>
              <Field label="Número">
                <Input value={form.numero} onChange={(e) => set('numero', e.target.value)} placeholder="Nº" />
              </Field>
            </div>
            <Field label="Bairro">
              <Input value={form.bairro} onChange={(e) => set('bairro', e.target.value)} placeholder="Bairro" />
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <Field label="Cidade">
                  <Input value={form.cidade} onChange={(e) => set('cidade', e.target.value)} placeholder="Cidade" />
                </Field>
              </div>
              <Field label="Estado">
                <Select value={form.estado} onValueChange={(v) => set('estado', v)}>
                  <SelectTrigger><SelectValue placeholder="UF" /></SelectTrigger>
                  <SelectContent>
                    {ESTADOS_BR.map((uf) => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </div>
        )}

        {/* ── Step 3: Pix ─────────────────────────────────── */}
        {step === 3 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Informe sua chave Pix para agilizar o processo de pagamento. Este campo é opcional.
            </p>
            <Field label="Tipo de chave">
              <Select value={form.pix_key_type} onValueChange={(v) => set('pix_key_type', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cpf">CPF</SelectItem>
                  <SelectItem value="cnpj">CNPJ</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="telefone">Telefone</SelectItem>
                  <SelectItem value="aleatoria">Chave aleatória</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Chave Pix">
              <Input value={form.pix_key} onChange={(e) => set('pix_key', e.target.value)} placeholder="Informe sua chave Pix" />
            </Field>
            {form.pix_key.trim() && (
              <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-4 space-y-2">
                <p className="text-xs font-semibold text-primary uppercase tracking-wide">✓ Chave Pix confirmada</p>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Tipo</span>
                  <span className="text-sm font-medium">{PIX_TYPE_LABEL[form.pix_key_type] ?? form.pix_key_type}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Chave</span>
                  <span className="text-sm font-semibold break-all text-right max-w-[70%]">{form.pix_key}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Step 4: Documentação ────────────────────────── */}
        {step === 4 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground flex items-center gap-1.5">
              <Camera className="w-4 h-4 shrink-0" />
              Tire fotos dos documentos com a câmera. Upload de arquivo não é permitido.
            </p>
            <CameraCapture
              label="Documento — Frente (RG / CNH)"
              previewUrl={docFront.preview}
              isExistingDoc={docFront.isExisting && !docFront.file}
              onCapture={(f, p, v) => handleCapture(setDocFront, f, p, v)}
              onRemove={() => setDocFront((d) => ({ ...d, file: null, preview: null, analysis: null }))}
            />
            <CameraCapture
              label="Documento — Verso"
              previewUrl={docBack.preview}
              isExistingDoc={docBack.isExisting && !docBack.file}
              onCapture={(f, p, v) => handleCapture(setDocBack, f, p, v)}
              onRemove={() => setDocBack((d) => ({ ...d, file: null, preview: null, analysis: null }))}
            />
            <CameraCapture
              label="Comprovante de Endereço"
              previewUrl={comprov.preview}
              isExistingDoc={comprov.isExisting && !comprov.file}
              onCapture={(f, p, v) => handleCapture(setComprov, f, p, v)}
              onRemove={() => setComprov((d) => ({ ...d, file: null, preview: null, analysis: null }))}
            />
          </div>
        )}

        {/* ── Step 5: Contatos de Referência ──────────────── */}
        {step === 5 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Informe até 3 contatos de referência (familiares ou conhecidos).
            </p>
            {form.contatos_referencia.map((c, i) => (
              <div key={i} className="rounded-lg border p-4 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Referência {i + 1}
                </p>
                <Field label="Nome">
                  <Input value={c.nome} placeholder={`Nome da referência ${i + 1}`}
                    onChange={(e) => { const a = [...form.contatos_referencia]; a[i] = { ...a[i], nome: e.target.value }; set('contatos_referencia', a); }} />
                </Field>
                <Field label="Telefone">
                  <Input value={c.telefone} placeholder="(11) 99999-9999" inputMode="tel"
                    onChange={(e) => { const a = [...form.contatos_referencia]; a[i] = { ...a[i], telefone: e.target.value }; set('contatos_referencia', a); }} />
                </Field>
                <Field label="Parentesco / relação">
                  <Input value={c.parentesco} placeholder="Mãe, irmão, amigo…"
                    onChange={(e) => { const a = [...form.contatos_referencia]; a[i] = { ...a[i], parentesco: e.target.value }; set('contatos_referencia', a); }} />
                </Field>
              </div>
            ))}
          </div>
        )}

        {/* ── Step 6: Confirmação ─────────────────────────── */}
        {step === 6 && (
          <div className="space-y-5">
            <p className="text-sm text-muted-foreground">
              Revise seus dados antes de enviar. Clique em <strong>Enviar cadastro</strong> para concluir.
            </p>

            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Dados Pessoais</p>
              <div className="rounded-lg border px-4 py-1">
                <SumRow label="Nome" value={form.nome} />
                <SumRow label="Telefone" value={form.telefone} />
                <SumRow label="Email" value={form.email} />
                <SumRow label="CPF" value={form.cpf} />
                <SumRow label="Sexo" value={{ masculino: 'Masculino', feminino: 'Feminino', outro: 'Outro' }[form.sexo]} />
                <SumRow label="Profissão" value={form.profissao} />
                <SumRow label="Renda" value={form.renda_mensal ? `R$ ${form.renda_mensal}` : null} />
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Endereço</p>
              <div className="rounded-lg border px-4 py-1">
                <SumRow label="CEP" value={form.cep} />
                <SumRow label="Rua" value={[form.rua, form.numero].filter(Boolean).join(', ')} />
                <SumRow label="Bairro" value={form.bairro} />
                <SumRow label="Cidade/UF" value={[form.cidade, form.estado].filter(Boolean).join(' — ')} />
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Pix</p>
              <div className="rounded-lg border px-4 py-1">
                <SumRow label="Tipo" value={PIX_TYPE_LABEL[form.pix_key_type] ?? form.pix_key_type} />
                <SumRow label="Chave" value={form.pix_key} />
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Documentos</p>
              <div className="rounded-lg border px-4 py-1">
                <SumRow label="Frente" value={docFront.file ? '✓ Foto tirada' : docFront.isExisting ? '✓ Já enviado' : 'Não enviado'} />
                <SumRow label="Verso" value={docBack.file ? '✓ Foto tirada' : docBack.isExisting ? '✓ Já enviado' : 'Não enviado'} />
                <SumRow label="Comprovante" value={comprov.file ? '✓ Foto tirada' : comprov.isExisting ? '✓ Já enviado' : 'Não enviado'} />
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Referências</p>
              <div className="rounded-lg border px-4 py-1">
                {form.contatos_referencia.filter((c) => c.nome.trim()).map((c, i) => (
                  <SumRow key={i} label={c.parentesco || `Ref. ${i + 1}`} value={`${c.nome} — ${c.telefone}`} />
                ))}
                {!form.contatos_referencia.some((c) => c.nome.trim()) && (
                  <p className="text-sm text-muted-foreground italic py-2">Nenhuma referência informada</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Navigation bar ──────────────────────────────── */}
        <div className="flex gap-3 mt-8">
          {step > 1 && (
            <Button variant="outline" onClick={goBack} className="flex-1">
              <ChevronLeft className="w-4 h-4 mr-1" /> Voltar
            </Button>
          )}
          {step < TOTAL_STEPS ? (
            <Button onClick={goNext} className="flex-1">
              Próximo <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} className="flex-1">
              <Send className="w-4 h-4 mr-2" /> Enviar cadastro
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

