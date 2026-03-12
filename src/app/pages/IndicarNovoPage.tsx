/**
 * @module IndicarNovoPage
 * @description Formulário para cadastrar nova indicação na rede.
 *
 * Step 1: Buscar indicador por nome ou CPF (combobox com busca),
 *         ou escolher captação direta.
 * Step 2: Dados do novo cliente indicado.
 * Step 3: Confirmação e envio.
 *
 * @route /rede/indicar-novo
 * @access Protegido — todos os perfis autenticados
 */
import { useState, useMemo, useRef, useEffect } from 'react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import {
  UserPlus,
  CheckCircle,
  AlertTriangle,
  Search,
  X,
  User,
  CreditCard,
  Mail,
  Phone,
  Star,
} from 'lucide-react';
import { useClientes } from '../hooks/useClientes';
import { useCreateIndicacao } from '../hooks/useRedeIndicacoes';

export default function IndicarNovoPage() {
  const [step, setStep] = useState(1);
  const [indicador, setIndicador] = useState(''); // 'direto' | clienteId
  const [formData, setFormData] = useState({
    nome: '',
    email: '',
    telefone: '',
    cpf: '',
    sexo: '' as 'masculino' | 'feminino' | '',
    valorSolicitado: '',
    rendaMensal: '',
  });
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState('');

  // ── Busca do indicador ──────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const { data: allClientes = [], isLoading: loadingClientes } = useClientes();
  const createIndicacao = useCreateIndicacao();

  // Filtra por nome ou CPF
  const searchResults = useMemo(() => {
    if (!searchQuery.trim() || searchQuery.length < 2) return [];
    const q = searchQuery.toLowerCase().replace(/[.\-/]/g, '');
    return allClientes.filter((c) => {
      const nomeMatch = c.nome.toLowerCase().includes(q);
      const cpfClean = (c.cpf ?? '').replace(/[.\-/]/g, '').toLowerCase();
      const cpfMatch = cpfClean.includes(q);
      const emailMatch = c.email.toLowerCase().includes(q);
      return nomeMatch || cpfMatch || emailMatch;
    }).slice(0, 8); // máximo 8 resultados
  }, [allClientes, searchQuery]);

  // Info do indicador selecionado
  const indicadorInfo = useMemo(
    () => allClientes.find((c) => c.id === indicador),
    [allClientes, indicador],
  );

  // Fecha dropdown ao clicar fora
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const selectIndicador = (clienteId: string) => {
    setIndicador(clienteId);
    const c = allClientes.find((cl) => cl.id === clienteId);
    if (c) setSearchQuery(c.nome);
    setShowResults(false);
  };

  const clearIndicador = () => {
    setIndicador('');
    setSearchQuery('');
    setShowResults(false);
  };

  const handleSubmit = async () => {
    setErro('');
    try {
      await createIndicacao.mutateAsync({
        nome: formData.nome,
        email:
          formData.email ||
          `${formData.nome.toLowerCase().replace(/\s/g, '.')}@indicacao.tmp`,
        telefone: formData.telefone || '(00) 00000-0000',
        cpf: formData.cpf || undefined,
        sexo: formData.sexo as 'masculino' | 'feminino',
        indicadoPor: indicador === 'direto' ? undefined : indicador,
        valor: formData.valorSolicitado ? parseFloat(formData.valorSolicitado) : 0,
      });
      setEnviado(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao registrar indicação';
      setErro(msg);
    }
  };

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  // ── Tela de sucesso ─────────────────────────────────────
  if (enviado) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center min-h-[60vh]">
          <Card className="max-w-md w-full text-center p-8">
            <div className="w-16 h-16 bg-green-100 dark:bg-green-900/40 rounded-full mx-auto flex items-center justify-center mb-4">
              <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
            </div>
            <h2 className="text-xl font-bold mb-2">Indicação Registrada!</h2>
            <p className="text-muted-foreground mb-4">
              A indicação de <strong>{formData.nome}</strong> foi registrada com
              sucesso e está em análise.
            </p>
            <p className="text-sm text-muted-foreground mb-2">
              Indicado por:{' '}
              <strong>
                {indicador === 'direto'
                  ? 'Captação Direta'
                  : indicadorInfo?.nome ?? 'Desconhecido'}
              </strong>
            </p>
            <Button
              className="bg-primary hover:bg-primary/90 mt-4"
              onClick={() => {
                setEnviado(false);
                setStep(1);
                setFormData({
                  nome: '',
                  email: '',
                  telefone: '',
                  cpf: '',
                  sexo: '',
                  valorSolicitado: '',
                  rendaMensal: '',
                });
                setIndicador('');
                setSearchQuery('');
              }}
            >
              Nova Indicação
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  // ── Wizard ──────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Indicar Novo Cliente</h1>
        <p className="text-muted-foreground mt-1">Registre uma nova indicação na rede</p>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center justify-center gap-4">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                step >= s
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {s}
            </div>
            <span className={`text-sm ${step >= s ? 'font-medium' : 'text-muted-foreground'}`}>
              {s === 1 ? 'Indicador' : s === 2 ? 'Dados do Cliente' : 'Confirmar'}
            </span>
            {s < 3 && (
              <div className={`w-12 h-0.5 ${step > s ? 'bg-primary' : 'bg-muted'}`} />
            )}
          </div>
        ))}
      </div>

      <Card className="max-w-2xl mx-auto">
        <CardContent className="pt-6">
          {/* ── Step 1: Buscar Indicador ─────────────────────── */}
          {step === 1 && (
            <div className="space-y-5">
              <h3 className="font-semibold text-lg">Quem está indicando?</h3>

              {/* Tipo de indicação */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setIndicador('direto');
                    setSearchQuery('');
                    setShowResults(false);
                  }}
                  className={`p-4 rounded-lg border-2 text-center transition-all ${
                    indicador === 'direto'
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-muted-foreground/40'
                  }`}
                >
                  <UserPlus className="w-6 h-6 mx-auto mb-2 text-muted-foreground" />
                  <span className="text-sm font-medium">Captação Direta</span>
                  <p className="text-xs text-muted-foreground mt-1">Sem indicador</p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIndicador('');
                    setTimeout(() => {
                      const input = searchRef.current?.querySelector('input');
                      input?.focus();
                    }, 100);
                  }}
                  className={`p-4 rounded-lg border-2 text-center transition-all ${
                    indicador !== '' && indicador !== 'direto'
                      ? 'border-primary bg-primary/5'
                      : indicador === ''
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-muted-foreground/40'
                  }`}
                >
                  <Search className="w-6 h-6 mx-auto mb-2 text-muted-foreground" />
                  <span className="text-sm font-medium">Indicado por Cliente</span>
                  <p className="text-xs text-muted-foreground mt-1">Buscar por nome ou CPF</p>
                </button>
              </div>

              {/* Campo de busca — visível apenas quando não for captação direta */}
              {indicador !== 'direto' && (
                <div ref={searchRef} className="relative">
                  <Label className="mb-2 block">Buscar Indicador</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setShowResults(true);
                        // Se o indicador já estava selecionado e o usuário edita, limpar
                        if (indicador && indicador !== 'direto') {
                          setIndicador('');
                        }
                      }}
                      onFocus={() => searchQuery.length >= 2 && setShowResults(true)}
                      placeholder="Digite o nome ou CPF do indicador..."
                      className="pl-10 pr-10"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        onClick={clearIndicador}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* Resultados da busca */}
                  {showResults && searchQuery.length >= 2 && (
                    <div className="absolute z-50 mt-1 w-full bg-popover border border-border rounded-lg shadow-lg max-h-72 overflow-y-auto">
                      {loadingClientes ? (
                        <div className="p-4 text-center text-sm text-muted-foreground">
                          Carregando...
                        </div>
                      ) : searchResults.length === 0 ? (
                        <div className="p-4 text-center text-sm text-muted-foreground">
                          <Search className="w-5 h-5 mx-auto mb-2 opacity-40" />
                          Nenhum cliente encontrado para "{searchQuery}"
                        </div>
                      ) : (
                        searchResults.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => selectIndicador(c.id)}
                            className="w-full text-left p-3 hover:bg-muted transition-colors flex items-center gap-3 border-b last:border-b-0"
                          >
                            <div
                              className={`w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0 ${
                                c.status === 'em_dia'
                                  ? 'bg-green-500'
                                  : c.status === 'a_vencer'
                                  ? 'bg-yellow-500'
                                  : 'bg-red-500'
                              }`}
                            >
                              {c.nome.charAt(0)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-sm truncate">{c.nome}</div>
                              <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                                {c.cpf && (
                                  <span className="flex items-center gap-0.5">
                                    <CreditCard className="w-3 h-3" />
                                    {c.cpf}
                                  </span>
                                )}
                                <span className="flex items-center gap-0.5">
                                  <Mail className="w-3 h-3" />
                                  {c.email}
                                </span>
                              </div>
                            </div>
                            <Badge
                              className={`text-[10px] flex-shrink-0 ${
                                c.status === 'em_dia'
                                  ? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300'
                                  : c.status === 'a_vencer'
                                  ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300'
                                  : 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300'
                              }`}
                            >
                              {c.status === 'em_dia'
                                ? 'Em dia'
                                : c.status === 'a_vencer'
                                ? 'À vencer'
                                : 'Vencido'}
                            </Badge>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Card do indicador selecionado */}
              {indicadorInfo && indicador !== 'direto' && (
                <div className="p-4 bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-800 rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold text-green-800 dark:text-green-300">
                      ✅ Indicador Selecionado
                    </span>
                    <button
                      type="button"
                      onClick={clearIndicador}
                      className="text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-200 text-xs underline"
                    >
                      Alterar
                    </button>
                  </div>
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg ${
                        indicadorInfo.status === 'em_dia'
                          ? 'bg-green-500'
                          : indicadorInfo.status === 'a_vencer'
                          ? 'bg-yellow-500'
                          : 'bg-red-500'
                      }`}
                    >
                      {indicadorInfo.nome.charAt(0)}
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold">{indicadorInfo.nome}</div>
                      <div className="text-xs text-muted-foreground">{indicadorInfo.email}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mt-3 text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <CreditCard className="w-3.5 h-3.5" />
                      <span>{indicadorInfo.cpf || 'CPF não informado'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Phone className="w-3.5 h-3.5" />
                      <span>{indicadorInfo.telefone}</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Star className="w-3.5 h-3.5" />
                      <span>Score: {indicadorInfo.scoreInterno}</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <User className="w-3.5 h-3.5" />
                      <span className="capitalize">Status: {indicadorInfo.status.replace('_', ' ')}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Captação direta selecionada */}
              {indicador === 'direto' && (
                <div className="p-4 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-lg flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/50 rounded-full flex items-center justify-center">
                    <UserPlus className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <div className="font-semibold text-blue-800 dark:text-blue-300 text-sm">Captação Direta</div>
                    <p className="text-xs text-blue-600 dark:text-blue-400">
                      O novo cliente será registrado sem vínculo de indicação
                    </p>
                  </div>
                </div>
              )}

              <Button
                className="w-full bg-primary hover:bg-primary/90"
                onClick={() => setStep(2)}
                disabled={!indicador}
              >
                Próximo
              </Button>
            </div>
          )}

          {/* ── Step 2: Dados do Novo Cliente ────────────────── */}
          {step === 2 && (
            <div className="space-y-4">
              <h3 className="font-semibold text-lg">Dados do Novo Cliente</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Nome Completo *</Label>
                  <Input
                    value={formData.nome}
                    onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                    placeholder="Nome completo"
                  />
                </div>
                <div>
                  <Label>CPF</Label>
                  <Input
                    value={formData.cpf}
                    onChange={(e) => setFormData({ ...formData, cpf: e.target.value })}
                    placeholder="000.000.000-00"
                  />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="email@exemplo.com"
                  />
                </div>
                <div>
                  <Label>Telefone</Label>
                  <Input
                    value={formData.telefone}
                    onChange={(e) => setFormData({ ...formData, telefone: e.target.value })}
                    placeholder="(00) 00000-0000"
                  />
                </div>
                <div>
                  <Label>Sexo *</Label>
                  <Select
                    value={formData.sexo}
                    onValueChange={(v) =>
                      setFormData({ ...formData, sexo: v as 'masculino' | 'feminino' })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="masculino">Masculino</SelectItem>
                      <SelectItem value="feminino">Feminino</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Valor Solicitado (R$)</Label>
                  <Input
                    type="number"
                    value={formData.valorSolicitado}
                    onChange={(e) =>
                      setFormData({ ...formData, valorSolicitado: e.target.value })
                    }
                    placeholder="0.00"
                  />
                </div>
                <div className="md:col-span-2">
                  <Label>Renda Mensal (R$)</Label>
                  <Input
                    type="number"
                    value={formData.rendaMensal}
                    onChange={(e) => setFormData({ ...formData, rendaMensal: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep(1)}>
                  Voltar
                </Button>
                <Button
                  className="flex-1 bg-primary hover:bg-primary/90"
                  onClick={() => setStep(3)}
                  disabled={!formData.nome || !formData.sexo}
                >
                  Próximo
                </Button>
              </div>
            </div>
          )}

          {/* ── Step 3: Confirmar ────────────────────────────── */}
          {step === 3 && (
            <div className="space-y-4">
              <h3 className="font-semibold text-lg">Confirmar Indicação</h3>

              {/* Resumo do indicador */}
              <div className="p-4 bg-muted rounded-lg">
                <div className="text-xs text-muted-foreground uppercase font-semibold tracking-wider mb-2">
                  Indicador
                </div>
                {indicador === 'direto' ? (
                  <div className="flex items-center gap-2">
                    <UserPlus className="w-5 h-5 text-blue-500 dark:text-blue-400" />
                    <span className="font-medium">Captação Direta (sem indicador)</span>
                  </div>
                ) : indicadorInfo ? (
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm ${
                        indicadorInfo.status === 'em_dia'
                          ? 'bg-green-500'
                          : indicadorInfo.status === 'a_vencer'
                          ? 'bg-yellow-500'
                          : 'bg-red-500'
                      }`}
                    >
                      {indicadorInfo.nome.charAt(0)}
                    </div>
                    <div>
                      <div className="font-medium">{indicadorInfo.nome}</div>
                      <div className="text-xs text-muted-foreground">
                        {indicadorInfo.cpf || indicadorInfo.email}
                      </div>
                    </div>
                  </div>
                ) : (
                  <span className="text-muted-foreground">Desconhecido</span>
                )}
              </div>

              {/* Dados do novo cliente */}
              <div className="p-4 bg-muted rounded-lg space-y-3">
                <div className="text-xs text-muted-foreground uppercase font-semibold tracking-wider mb-2">
                  Novo Cliente
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">Nome:</span>
                    <p className="font-medium">{formData.nome}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">CPF:</span>
                    <p className="font-medium">{formData.cpf || '-'}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Email:</span>
                    <p className="font-medium">{formData.email || '-'}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Telefone:</span>
                    <p className="font-medium">{formData.telefone || '-'}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Sexo:</span>
                    <p className="font-medium capitalize">{formData.sexo}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Valor Solicitado:</span>
                    <p className="font-medium">
                      {formData.valorSolicitado
                        ? formatCurrency(parseFloat(formData.valorSolicitado))
                        : 'R$ 0,00'}
                    </p>
                  </div>
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Renda Mensal:</span>
                    <p className="font-medium">
                      {formData.rendaMensal
                        ? formatCurrency(parseFloat(formData.rendaMensal))
                        : 'R$ 0,00'}
                    </p>
                  </div>
                </div>
              </div>

              {erro && (
                <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-800 dark:text-red-300">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  {erro}
                </div>
              )}

              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep(2)}>
                  Voltar
                </Button>
                <Button
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                  onClick={handleSubmit}
                  disabled={createIndicacao.isPending}
                >
                  <UserPlus className="w-4 h-4 mr-2" />
                  {createIndicacao.isPending ? 'Registrando...' : 'Confirmar Indicação'}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
