/**
 * @module ClientesPage
 * @description Listagem e gestão de clientes do sistema.
 *
 * Tabela paginada com busca, filtro por status e ordenação.
 * Permite cadastrar novo cliente (com campo sexo para mensagens
 * personalizadas), editar e visualizar detalhes. Exibe CPF,
 * telefone, limite de crédito e score interno de cada cliente.
 * Dados reais via Supabase com hooks React Query.
 *
 * @route /clientes
 * @access Protegido — todos os perfis autenticados
 */
import { useState, useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '../components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { Search, Grid, List, Edit, History, Ban, Eye, Phone, Loader2, Plus, ChevronsUpDown, Check, MapPin, Upload, X, FileImage, Users } from 'lucide-react';
import { useClientes, useIndicados, useCreateCliente, useUpdateCliente } from '../hooks/useClientes';
import { useParcelasByCliente } from '../hooks/useParcelas';
import { StatusBadge } from '../components/StatusBadge';
import BrazilMap from '../components/BrazilMap';
import { toast } from 'sonner';
import { cn } from '../components/ui/utils';
import { supabase } from '../lib/supabase';
import type { Cliente } from '../lib/view-types';
import type { ClienteInsert, ClienteUpdate, Sexo } from '../lib/database.types';

type ViewMode = 'table' | 'cards';

type ClienteFormData = {
  nome: string;
  email: string;
  telefone: string;
  cpf: string;
  sexo: Sexo;
  profissao: string;
  renda_mensal: string;
  rua: string;
  numero: string;
  bairro: string;
  estado: string;
  cidade: string;
  cep: string;
  pix_key: string;
  pix_key_type: string;
  contatos_referencia: Array<{nome: string; telefone: string; parentesco: string}>;
};

const EMPTY_FORM: ClienteFormData = {
  nome: '', email: '', telefone: '', cpf: '', sexo: 'masculino',
  profissao: '', renda_mensal: '', rua: '', numero: '', bairro: '', estado: '', cidade: '', cep: '',
  pix_key: '', pix_key_type: 'cpf',
  contatos_referencia: [
    { nome: '', telefone: '', parentesco: '' },
    { nome: '', telefone: '', parentesco: '' },
    { nome: '', telefone: '', parentesco: '' },
  ],
};

const ESTADOS_BR = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
  'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO',
] as const;

export default function ClientesPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [mapStateFilter, setMapStateFilter] = useState('');
  const [mapCityFilter, setMapCityFilter] = useState('');
  const [showMap, setShowMap] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Cliente | null>(null);

  // Create / Edit modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ClienteFormData>(EMPTY_FORM);

  const { data: clientes = [], isLoading } = useClientes();
  const { data: indicados = [] } = useIndicados(selectedClient?.id);
  const { data: parcelasCliente = [], isLoading: loadingParcelas } = useParcelasByCliente(selectedClient?.id);
  const createCliente = useCreateCliente();
  const updateCliente = useUpdateCliente();

  // IBGE cidades
  const [cidadesLista, setCidadesLista] = useState<string[]>([]);
  const [cidadesLoading, setCidadesLoading] = useState(false);
  const [cidadeOpen, setCidadeOpen] = useState(false);
  const [estadoUserChanged, setEstadoUserChanged] = useState(false);

  useEffect(() => {
    if (!form.estado) { setCidadesLista([]); return; }
    let cancelled = false;
    setCidadesLoading(true);
    if (estadoUserChanged) {
      setForm(p => ({ ...p, cidade: '' }));
      setEstadoUserChanged(false);
    }
    fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${encodeURIComponent(form.estado)}/municipios?orderBy=nome`)
      .then(r => r.json())
      .then((data: Array<{ nome: string }>) => {
        if (!cancelled) setCidadesLista(data.map(m => m.nome));
      })
      .catch(() => { if (!cancelled) setCidadesLista([]); })
      .finally(() => { if (!cancelled) setCidadesLoading(false); });
    return () => { cancelled = true; };
  }, [form.estado]);

  const formatCep = (v: string) => {
    const digits = v.replace(/\D/g, '').slice(0, 8);
    return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
  };

  const formatCpf = (v: string) => {
    const digits = v.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
    if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  };

  /** Converte "5.500,00" → 5500.00 */
  const parseBRL = (v: string): number => {
    const cleaned = v.replace(/\./g, '').replace(',', '.');
    return parseFloat(cleaned) || 0;
  };

  /** Formata número para "5.500,00" */
  const formatBRLValue = (n: number): string => {
    if (!n) return '';
    return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  /** Score automático baseado na completude do cadastro (0-1000) */
  const calcularScoreInicial = (f: ClienteFormData, hasDocs: { front: boolean; back: boolean; comprovante: boolean }) => {
    let score = 0;
    // Dados obrigatórios (base)
    if (f.nome.trim()) score += 50;
    if (f.email.trim()) score += 50;
    if (f.telefone.trim()) score += 50;
    // CPF
    if (f.cpf.replace(/\D/g, '').length === 11) score += 100;
    // Profissão
    if (f.profissao.trim()) score += 80;
    // Endereço completo
    if (f.cep.replace(/\D/g, '').length === 8) score += 60;
    if (f.rua.trim()) score += 40;
    if (f.numero.trim()) score += 20;
    if (f.bairro.trim()) score += 40;
    if (f.estado) score += 30;
    if (f.cidade) score += 30;
    // Contatos de referência (até 150)
    const refsValidas = f.contatos_referencia.filter(c => c.nome.trim() && c.telefone.trim());
    score += Math.min(refsValidas.length, 3) * 50;
    // Documentos (até 200)
    if (hasDocs.front) score += 80;
    if (hasDocs.back) score += 60;
    if (hasDocs.comprovante) score += 60;
    // PIX
    if (f.pix_key.trim()) score += 40;
    // Renda informada
    const renda = parseBRL(f.renda_mensal);
    if (renda > 0) score += 60;
    return Math.min(score, 1000);
  };

  // ViaCEP auto-fill
  const [cepLoading, setCepLoading] = useState(false);
  useEffect(() => {
    const digits = form.cep.replace(/\D/g, '');
    if (digits.length !== 8) return;
    let cancelled = false;
    setCepLoading(true);
    fetch(`https://viacep.com.br/ws/${digits}/json/`)
      .then(r => r.json())
      .then((data: { erro?: boolean; logradouro?: string; bairro?: string; localidade?: string; uf?: string }) => {
        if (cancelled || data.erro) return;
        setForm(p => ({
          ...p,
          rua: data.logradouro || p.rua,
          bairro: data.bairro || p.bairro,
          cidade: data.localidade || p.cidade,
          estado: data.uf || p.estado,
        }));
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setCepLoading(false); });
    return () => { cancelled = true; };
  }, [form.cep]);

  // Document upload state
  const [docFrontPreview, setDocFrontPreview] = useState<string | null>(null);
  const [docBackPreview, setDocBackPreview] = useState<string | null>(null);
  const [comprovantePreview, setComprovantePreview] = useState<string | null>(null);
  const [docFrontFile, setDocFrontFile] = useState<File | null>(null);
  const [docBackFile, setDocBackFile] = useState<File | null>(null);
  const [comprovanteFile, setComprovanteFile] = useState<File | null>(null);
  const [uploadingDocs, setUploadingDocs] = useState(false);

  const MAX_DOC_SIZE = 10 * 1024 * 1024; // 10MB
  const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

  const handleDocSelect = useCallback((type: 'front' | 'back' | 'comprovante', file: File) => {
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      toast.error('Formato não aceito. Use JPG, PNG ou WebP.');
      return;
    }
    if (file.size > MAX_DOC_SIZE) {
      toast.error('Arquivo muito grande. Máximo 10MB.');
      return;
    }
    const url = URL.createObjectURL(file);
    if (type === 'front') {
      if (docFrontPreview) URL.revokeObjectURL(docFrontPreview);
      setDocFrontPreview(url);
      setDocFrontFile(file);
    } else if (type === 'back') {
      if (docBackPreview) URL.revokeObjectURL(docBackPreview);
      setDocBackPreview(url);
      setDocBackFile(file);
    } else {
      if (comprovantePreview) URL.revokeObjectURL(comprovantePreview);
      setComprovantePreview(url);
      setComprovanteFile(file);
    }
  }, [docFrontPreview, docBackPreview, comprovantePreview]);

  const removeDocPreview = useCallback((type: 'front' | 'back' | 'comprovante') => {
    if (type === 'front') {
      if (docFrontPreview) URL.revokeObjectURL(docFrontPreview);
      setDocFrontPreview(null);
      setDocFrontFile(null);
    } else if (type === 'back') {
      if (docBackPreview) URL.revokeObjectURL(docBackPreview);
      setDocBackPreview(null);
      setDocBackFile(null);
    } else {
      if (comprovantePreview) URL.revokeObjectURL(comprovantePreview);
      setComprovantePreview(null);
      setComprovanteFile(null);
    }
  }, [docFrontPreview, docBackPreview, comprovantePreview]);

  const uploadDocToStorage = useCallback(async (clienteId: string, file: File, fileName: string): Promise<string> => {
    const ext = file.name.split('.').pop() ?? 'jpg';
    const path = `${clienteId}/${fileName}.${ext}`;
    const { error } = await supabase.storage.from('client-documents').upload(path, file, {
      cacheControl: '3600',
      upsert: true,
      contentType: file.type,
    });
    if (error) throw error;
    return path;
  }, []);

  const resetDocState = useCallback(() => {
    if (docFrontPreview) URL.revokeObjectURL(docFrontPreview);
    if (docBackPreview) URL.revokeObjectURL(docBackPreview);
    if (comprovantePreview) URL.revokeObjectURL(comprovantePreview);
    setDocFrontPreview(null);
    setDocBackPreview(null);
    setComprovantePreview(null);
    setDocFrontFile(null);
    setDocBackFile(null);
    setComprovanteFile(null);
  }, [docFrontPreview, docBackPreview, comprovantePreview]);

  // Abre ficha pelo param ?clienteId=
  useEffect(() => {
    const clienteId = searchParams.get('clienteId');
    if (!clienteId || clientes.length === 0) return;
    const found = clientes.find((c) => c.id === clienteId);
    if (found) {
      setSelectedClient(found);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, clientes]);

  const isSaving = createCliente.isPending || updateCliente.isPending || uploadingDocs;

  const filteredClientes = clientes.filter((cliente) => {
    const matchesSearch = cliente.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cliente.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'todos' || cliente.status === statusFilter;
    const matchesState = !mapStateFilter || cliente.estado === mapStateFilter;
    const matchesCity = !mapCityFilter || cliente.cidade === mapCityFilter;
    return matchesSearch && matchesStatus && matchesState && matchesCity;
  });

  // Contagem de clientes por estado para o mapa
  const clientCountByState = clientes.reduce<Record<string, number>>((acc, c) => {
    if (c.estado) acc[c.estado] = (acc[c.estado] ?? 0) + 1;
    return acc;
  }, {});

  // Cidades com clientes no estado selecionado e suas contagens
  const citiesInState = mapStateFilter
    ? [...new Set(clientes.filter(c => c.estado === mapStateFilter && c.cidade).map(c => c.cidade!))].sort()
    : [];
  const clientCountByCity = mapStateFilter
    ? clientes.filter(c => c.estado === mapStateFilter && c.cidade).reduce<Record<string, number>>((acc, c) => {
        acc[c.cidade!] = (acc[c.cidade!] ?? 0) + 1;
        return acc;
      }, {})
    : {};

  const openCreateModal = useCallback(() => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    resetDocState();
    setModalOpen(true);
  }, [resetDocState]);

  const openEditModal = useCallback((c: Cliente) => {
    setEditingId(c.id);
    setForm({
      nome: c.nome,
      email: c.email,
      telefone: c.telefone,
      cpf: c.cpf || '',
      sexo: c.sexo,
      profissao: c.profissao || '',
      renda_mensal: c.rendaMensal ? formatBRLValue(c.rendaMensal) : '',
      rua: c.rua || '',
      numero: c.numero || '',
      bairro: c.bairro || '',
      estado: c.estado || '',
      cidade: c.cidade || '',
      cep: c.cep || '',
      pix_key: c.pix_key || '',
      pix_key_type: c.pix_key_type || 'cpf',
      contatos_referencia: c.contatosReferencia?.length
        ? c.contatosReferencia.map(r => ({ nome: r.nome, telefone: r.telefone, parentesco: r.parentesco }))
        : [{ nome: '', telefone: '', parentesco: '' }, { nome: '', telefone: '', parentesco: '' }, { nome: '', telefone: '', parentesco: '' }],
    });
    // Set existing doc previews from storage URLs
    resetDocState();
    if (c.documentoFrenteUrl) {
      const { data } = supabase.storage.from('client-documents').getPublicUrl(c.documentoFrenteUrl);
      setDocFrontPreview(data.publicUrl);
    }
    if (c.documentoVersoUrl) {
      const { data } = supabase.storage.from('client-documents').getPublicUrl(c.documentoVersoUrl);
      setDocBackPreview(data.publicUrl);
    }
    if (c.comprovanteEnderecoUrl) {
      const { data } = supabase.storage.from('client-documents').getPublicUrl(c.comprovanteEnderecoUrl);
      setComprovantePreview(data.publicUrl);
    }
    setSelectedClient(null);
    setModalOpen(true);
  }, [resetDocState]);

  const handleSave = useCallback(async () => {
    if (!form.nome || !form.email || !form.telefone) {
      toast.error('Preencha nome, email e telefone');
      return;
    }

    // Filter out empty reference contacts
    const contatosValidos = form.contatos_referencia.filter(c => c.nome.trim() && c.telefone.trim());

    if (editingId) {
      setUploadingDocs(true);
      try {
        // Upload new doc files if selected
        let docFrontUrl: string | undefined;
        let docBackUrl: string | undefined;
        let comprovanteUrl: string | undefined;
        if (docFrontFile) docFrontUrl = await uploadDocToStorage(editingId, docFrontFile, 'doc-frente');
        if (docBackFile) docBackUrl = await uploadDocToStorage(editingId, docBackFile, 'doc-verso');
        if (comprovanteFile) comprovanteUrl = await uploadDocToStorage(editingId, comprovanteFile, 'comprovante-endereco');

        const scoreAtualizado = calcularScoreInicial(form, { front: !!docFrontFile || !!docFrontPreview, back: !!docBackFile || !!docBackPreview, comprovante: !!comprovanteFile || !!comprovantePreview });
        const updates: ClienteUpdate = {
          nome: form.nome,
          email: form.email,
          telefone: form.telefone,
          cpf: form.cpf || null,
          sexo: form.sexo,
          profissao: form.profissao || null,
          renda_mensal: form.renda_mensal ? parseBRL(form.renda_mensal) : undefined,
          rua: form.rua || null,
          numero: form.numero || null,
          bairro: form.bairro || null,
          estado: form.estado || null,
          cidade: form.cidade || null,
          cep: form.cep || null,
          pix_key: form.pix_key || null,
          pix_key_type: form.pix_key_type || null,
          contatos_referencia: contatosValidos.length > 0 ? contatosValidos : null,
          score_interno: scoreAtualizado,
          ...(docFrontUrl && { documento_frente_url: docFrontUrl }),
          ...(docBackUrl && { documento_verso_url: docBackUrl }),
          ...(comprovanteUrl && { comprovante_endereco_url: comprovanteUrl }),
        };
        updateCliente.mutate(
          { id: editingId, data: updates },
          {
            onSuccess: () => { toast.success('Cliente atualizado'); setModalOpen(false); resetDocState(); },
            onError: (err) => toast.error(`Erro: ${err.message}`),
          },
        );
      } catch (err) {
        toast.error(`Erro ao enviar documentos: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setUploadingDocs(false);
      }
    } else {
      const scoreInicial = calcularScoreInicial(form, { front: !!docFrontFile, back: !!docBackFile, comprovante: !!comprovanteFile });
      const payload: ClienteInsert = {
        nome: form.nome,
        email: form.email,
        telefone: form.telefone,
        cpf: form.cpf || null,
        sexo: form.sexo,
        profissao: form.profissao || null,
        renda_mensal: form.renda_mensal ? parseBRL(form.renda_mensal) : 0,
        vencimento: new Date().toISOString().slice(0, 10),
        rua: form.rua || null,
        numero: form.numero || null,
        bairro: form.bairro || null,
        estado: form.estado || null,
        cidade: form.cidade || null,
        cep: form.cep || null,
        pix_key: form.pix_key || null,
        pix_key_type: form.pix_key_type || null,
        contatos_referencia: contatosValidos.length > 0 ? contatosValidos : null,
        score_interno: scoreInicial,
      };
      createCliente.mutate(payload, {
        onSuccess: async (data) => {
          // Upload docs after creation (need the client ID)
          const newId = (data as any)?.id;
          if (newId) {
            try {
              const docUpdates: Record<string, string> = {};
              if (docFrontFile) docUpdates.documento_frente_url = await uploadDocToStorage(newId, docFrontFile, 'doc-frente');
              if (docBackFile) docUpdates.documento_verso_url = await uploadDocToStorage(newId, docBackFile, 'doc-verso');
              if (comprovanteFile) docUpdates.comprovante_endereco_url = await uploadDocToStorage(newId, comprovanteFile, 'comprovante-endereco');
              if (Object.keys(docUpdates).length > 0) {
                await (supabase.from('clientes') as any).update(docUpdates).eq('id', newId);
              }
            } catch { /* docs upload failed but client was created */ }
          }
          toast.success('Cliente criado');
          setModalOpen(false);
          setForm(EMPTY_FORM);
          resetDocState();
        },
        onError: (err) => toast.error(`Erro: ${err.message}`),
      });
    }
  }, [form, editingId, createCliente, updateCliente, docFrontFile, docBackFile, comprovanteFile, uploadDocToStorage, resetDocState]);

  const handleBloquear = useCallback((c: Cliente) => {
    const novoStatus = c.status === 'vencido' ? 'em_dia' : 'vencido';
    updateCliente.mutate(
      { id: c.id, data: { status: novoStatus } },
      {
        onSuccess: () => {
          toast.success(novoStatus === 'vencido' ? 'Cliente bloqueado' : 'Cliente desbloqueado');
          setSelectedClient(null);
        },
        onError: (err) => toast.error(`Erro: ${err.message}`),
      },
    );
  }, [updateCliente]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('pt-BR');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Lista de Clientes</h1>
          <p className="text-muted-foreground mt-1">
            {isLoading ? 'Carregando...' : `${filteredClientes.length} cliente(s) encontrado(s)`}
          </p>
        </div>
        <Button className="bg-primary hover:bg-primary/90" onClick={openCreateModal}>
          <Plus className="w-4 h-4 mr-2" />Novo Cliente
        </Button>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="em_dia">Em dia</SelectItem>
                <SelectItem value="a_vencer">À vencer</SelectItem>
                <SelectItem value="vencido">Vencidos</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex-1 min-w-64">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome ou email..."
                  className="pl-10"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                variant={showMap ? 'default' : 'outline'}
                size="icon"
                onClick={() => setShowMap(!showMap)}
                title="Mapa do Brasil"
              >
                <MapPin className="w-4 h-4" />
              </Button>
              <Button
                variant={viewMode === 'table' ? 'default' : 'outline'}
                size="icon"
                onClick={() => setViewMode('table')}
              >
                <List className="w-4 h-4" />
              </Button>
              <Button
                variant={viewMode === 'cards' ? 'default' : 'outline'}
                size="icon"
                onClick={() => setViewMode('cards')}
              >
                <Grid className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Mapa do Brasil */}
      {showMap && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="w-4 h-4" /> Filtrar por Estado
              {mapCityFilter && <span className="text-xs font-normal text-muted-foreground">→ {mapCityFilter}</span>}
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-10">
            <BrazilMap
              selectedState={mapStateFilter}
              onSelectState={(uf) => { setMapStateFilter(uf); setMapCityFilter(''); }}
              selectedCity={mapCityFilter}
              onSelectCity={setMapCityFilter}
              clientCountByState={clientCountByState}
              clientCountByCity={clientCountByCity}
              citiesInState={citiesInState}
            />
          </CardContent>
        </Card>
      )}

      {/* Visualização em Tabela */}
      {viewMode === 'table' && (
        <Card>
          <CardContent className="pt-6">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-medium">Cliente</th>
                    <th className="text-left py-3 px-4 font-medium">Status</th>
                    <th className="text-left py-3 px-4 font-medium">Empréstimo</th>
                    <th className="text-left py-3 px-4 font-medium">Próx. Vencimento</th>
                    <th className="text-left py-3 px-4 font-medium">Parcelas</th>
                    <th className="text-left py-3 px-4 font-medium">Score</th>
                    <th className="text-left py-3 px-4 font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredClientes.map((cliente) => (
                    <tr key={cliente.id} className="border-b hover:bg-muted/50">
                      <td className="py-3 px-4">
                        <div>
                          <div className="font-medium">{cliente.nome}</div>
                          <div className="text-sm text-muted-foreground flex items-center gap-2">
                            📧 {cliente.email}
                          </div>
                          <div className="text-sm text-muted-foreground flex items-center gap-2">
                            📱 {cliente.telefone}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <StatusBadge status={cliente.status} />
                      </td>
                      <td className="py-3 px-4 font-medium">
                        {cliente.valor > 0 ? formatCurrency(cliente.valor) : <span className="text-muted-foreground text-sm">—</span>}
                      </td>
                      <td className="py-3 px-4">
                        {cliente.totalParcelas ? formatDate(cliente.vencimento) : <span className="text-muted-foreground text-sm">—</span>}
                      </td>
                      <td className="py-3 px-4">
                        {cliente.totalParcelas ? (
                          <span className="text-sm">
                            <span className="font-medium">{cliente.parcelasPagas}</span>
                            <span className="text-muted-foreground">/{cliente.totalParcelas}</span>
                          </span>
                        ) : <span className="text-muted-foreground text-sm">—</span>}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                            <div
                              className="h-full bg-secondary"
                              style={{ width: `${(cliente.scoreInterno / 1000) * 100}%` }}
                            />
                          </div>
                          <span className="text-sm font-medium w-12">
                            {cliente.scoreInterno}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            title="WhatsApp"
                            className="text-green-600 hover:text-green-700 hover:bg-green-50"
                            onClick={() => navigate(`/whatsapp?telefone=${encodeURIComponent(cliente.telefone)}`)}
                          >
                            <Phone className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Ver detalhes"
                            onClick={() => setSelectedClient(cliente)}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="sm" title="Editar" onClick={() => openEditModal(cliente)}>
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="sm" title="Histórico" onClick={() => navigate('/clientes/historico')}>
                            <History className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Visualização em Cards */}
      {viewMode === 'cards' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredClientes.map((cliente) => (
            <Card key={cliente.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-primary text-white rounded-full flex items-center justify-center font-semibold text-lg">
                      {cliente.nome.charAt(0)}
                    </div>
                    <div>
                      <CardTitle className="text-base">{cliente.nome}</CardTitle>
                      <p className="text-sm text-muted-foreground">{cliente.email}</p>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Status:</span>
                  <StatusBadge status={cliente.status} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Empréstimo:</span>
                  <span className="font-medium">{cliente.valor > 0 ? formatCurrency(cliente.valor) : '—'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Próx. Vencimento:</span>
                  <span className="font-medium">{cliente.totalParcelas ? formatDate(cliente.vencimento) : '—'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Parcelas:</span>
                  <span className="font-medium">{cliente.totalParcelas ? `${cliente.parcelasPagas}/${cliente.totalParcelas}` : '—'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Score:</span>
                  <span className="font-medium">{cliente.scoreInterno}/1000</span>
                </div>
                {cliente.indicou && cliente.indicou.length > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Indicações:</span>
                    <Badge variant="secondary">{cliente.indicou.length}</Badge>
                  </div>
                )}
                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 text-green-600 border-green-200 hover:bg-green-50 hover:text-green-700"
                    onClick={() => navigate(`/whatsapp?telefone=${encodeURIComponent(cliente.telefone)}`)}
                  >
                    <Phone className="w-4 h-4 mr-1" />
                    WhatsApp
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => setSelectedClient(cliente)}
                  >
                    <Eye className="w-4 h-4 mr-1" />
                    Ver
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => openEditModal(cliente)}>
                    <Edit className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Modal de Detalhes */}
      <Dialog open={!!selectedClient} onOpenChange={() => setSelectedClient(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="w-12 h-12 bg-primary text-white rounded-full flex items-center justify-center font-semibold text-lg">
                {selectedClient?.nome.charAt(0)}
              </div>
              <div>
                <div>{selectedClient?.nome}</div>
                <div className="text-sm text-muted-foreground font-normal">
                  {selectedClient?.email} • {selectedClient?.telefone}
                </div>
              </div>
            </DialogTitle>
          </DialogHeader>

          {selectedClient && (
            <div className="space-y-6">
              <div>
                <h3 className="font-medium mb-3">📊 Informações Financeiras</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Limite:</span>
                    <div className="font-medium">{formatCurrency(selectedClient.limiteCredito)}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Utilizado:</span>
                    <div className="font-medium">{formatCurrency(selectedClient.creditoUtilizado)}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Disponível:</span>
                    <div className="font-medium text-green-600">
                      {formatCurrency(selectedClient.limiteCredito - selectedClient.creditoUtilizado)}
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Score Interno:</span>
                    <div className="font-medium">{selectedClient.scoreInterno}/1000</div>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-medium mb-3">📅 Histórico de Pagamentos</h3>
                {loadingParcelas ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                ) : parcelasCliente.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma parcela registrada.</p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {parcelasCliente.map((p) => {
                      const statusColor = p.status === 'paga'
                        ? 'bg-green-100 text-green-800 hover:bg-green-100'
                        : p.status === 'vencida'
                        ? 'bg-red-100 text-red-800 hover:bg-red-100'
                        : 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100';
                      const statusLabel = p.status === 'paga' ? 'Pago' : p.status === 'vencida' ? 'Vencida' : 'Pendente';
                      return (
                        <div key={p.id} className="flex items-center justify-between text-sm py-2 border-b">
                          <span>• {formatDate(p.dataVencimento)} - Parcela {p.numero} - {formatCurrency(p.valor)}</span>
                          <Badge className={statusColor}>{statusLabel}</Badge>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div>
                <h3 className="font-medium mb-3">🕸️ Rede de Indicações</h3>
                <div className="text-sm space-y-1">
                  <p>
                    <span className="text-muted-foreground">Indicou:</span>{' '}
                    <span className="font-medium">
                      {indicados.length} pessoa(s)
                    </span>
                  </p>
                  {indicados.length > 0 && (
                    <div className="ml-4 mt-1 space-y-1">
                      {indicados.map((ind: any) => (
                        <p key={ind.id} className="text-xs text-muted-foreground">
                          • {ind.nome}
                        </p>
                      ))}
                    </div>
                  )}
                  {selectedClient.indicadoPor && (
                    <p>
                      <span className="text-muted-foreground">Indicado por:</span>{' '}
                      <span className="font-medium">
                        {clientes.find((c) => c.id === selectedClient.indicadoPor)?.nome ?? 'N/A'}
                      </span>
                    </p>
                  )}
                  <p>
                    <span className="text-muted-foreground">Bônus acumulado:</span>{' '}
                    <span className="font-medium text-green-600">
                      {formatCurrency(selectedClient.bonusAcumulado)}
                    </span>
                  </p>
                </div>
              </div>

              <div className="flex gap-2">
                <Button className="flex-1 bg-primary hover:bg-primary/90" onClick={() => openEditModal(selectedClient!)}>
                  <Edit className="w-4 h-4 mr-2" />
                  Editar
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 text-green-600 border-green-200 hover:bg-green-50"
                  onClick={() => {
                    setSelectedClient(null);
                    navigate(`/whatsapp?telefone=${encodeURIComponent(selectedClient!.telefone)}`);
                  }}
                >
                  <Phone className="w-4 h-4 mr-2" />
                  WhatsApp
                </Button>
                <Button variant="destructive" className="flex-1" onClick={() => handleBloquear(selectedClient!)}>
                  <Ban className="w-4 h-4 mr-2" />
                  {selectedClient!.status === 'vencido' ? 'Desbloquear' : 'Bloquear'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      {/* Modal Criar / Editar Cliente */}
      <Dialog open={modalOpen} onOpenChange={(open) => { if (!open) { setModalOpen(false); setEditingId(null); setForm(EMPTY_FORM); } }}>
        <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingId ? 'Editar Cliente' : 'Novo Cliente'}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-6">
            {/* Left column – Personal data & address */}
            <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Nome *</Label>
                <Input value={form.nome} onChange={(e) => setForm(p => ({ ...p, nome: e.target.value }))} placeholder="Nome completo" />
              </div>
              <div>
                <Label>Email *</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm(p => ({ ...p, email: e.target.value }))} placeholder="email@exemplo.com" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Telefone *</Label>
                <Input value={form.telefone} onChange={(e) => setForm(p => ({ ...p, telefone: e.target.value }))} placeholder="5511999999999" />
              </div>
              <div>
                <Label>CPF</Label>
                <Input value={form.cpf} onChange={(e) => setForm(p => ({ ...p, cpf: formatCpf(e.target.value) }))} placeholder="000.000.000-00" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Profissão</Label>
                <Input value={form.profissao} onChange={(e) => setForm(p => ({ ...p, profissao: e.target.value }))} placeholder="Ex: Engenheiro, Médico, Autônomo..." />
              </div>
              <div>
                <Label>Renda Mensal</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">R$</span>
                  <Input
                    className="pl-10"
                    placeholder="5.500,00"
                    value={form.renda_mensal}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/[^\d]/g, '');
                      if (!raw) { setForm(p => ({ ...p, renda_mensal: '' })); return; }
                      const num = parseInt(raw, 10) / 100;
                      setForm(p => ({ ...p, renda_mensal: num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }));
                    }}
                  />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Sexo</Label>
                <Select value={form.sexo} onValueChange={(v) => setForm(p => ({ ...p, sexo: v as Sexo }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="masculino">Masculino</SelectItem>
                    <SelectItem value="feminino">Feminino</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>CEP</Label>
                <Input value={form.cep} onChange={(e) => setForm(p => ({ ...p, cep: formatCep(e.target.value) }))} placeholder="00000-000" />
                {cepLoading && <span className="text-xs text-muted-foreground">Buscando...</span>}
              </div>
              <div>
                <Label>Número</Label>
                <Input value={form.numero} onChange={(e) => setForm(p => ({ ...p, numero: e.target.value }))} placeholder="Nº" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2">
                <Label>Rua</Label>
                <Input value={form.rua} onChange={(e) => setForm(p => ({ ...p, rua: e.target.value }))} placeholder="Nome da rua" />
              </div>
              <div>
                <Label>Bairro</Label>
                <Input value={form.bairro} onChange={(e) => setForm(p => ({ ...p, bairro: e.target.value }))} placeholder="Bairro" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Estado</Label>
                <Select value={form.estado} onValueChange={(v) => { setEstadoUserChanged(true); setForm(p => ({ ...p, estado: v })); }}>
                  <SelectTrigger><SelectValue placeholder="UF" /></SelectTrigger>
                  <SelectContent>
                    {ESTADOS_BR.map(uf => (
                      <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Cidade</Label>
                <Popover open={cidadeOpen} onOpenChange={setCidadeOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" className="w-full justify-between font-normal" disabled={!form.estado || cidadesLoading}>
                      {cidadesLoading ? 'Carregando...' : form.cidade || 'Selecione...'}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[300px] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Buscar cidade..." />
                      <CommandList>
                        <CommandEmpty>Nenhuma cidade encontrada.</CommandEmpty>
                        <CommandGroup className="max-h-48 overflow-y-auto">
                          {cidadesLista.map(c => (
                            <CommandItem key={c} value={c} onSelect={(val) => { setForm(p => ({ ...p, cidade: val })); setCidadeOpen(false); }}>
                              <Check className={cn('mr-2 h-4 w-4', form.cidade === c ? 'opacity-100' : 'opacity-0')} />
                              {c}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Tipo Chave PIX</Label>
                <Select value={form.pix_key_type} onValueChange={(v) => setForm(p => ({ ...p, pix_key_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cpf">CPF</SelectItem>
                    <SelectItem value="cnpj">CNPJ</SelectItem>
                    <SelectItem value="email">E-mail</SelectItem>
                    <SelectItem value="phone">Telefone</SelectItem>
                    <SelectItem value="random">Aleatória</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label>Chave PIX <span className="text-muted-foreground text-xs">(opcional)</span></Label>
                <Input value={form.pix_key} onChange={(e) => setForm(p => ({ ...p, pix_key: e.target.value }))} placeholder="Informe a chave PIX" />
              </div>
            </div>
            </div>{/* end left column */}

            {/* Right column – Documents & References */}
            <div className="space-y-4">
            {/* Documentos */}
            <div>
              <Label className="flex items-center gap-2 mb-3 text-base font-semibold">
                <FileImage className="h-4 w-4" />
                Documentos do Cliente
              </Label>
              <div className="grid grid-cols-3 gap-3">
                {/* Doc Frente */}
                <div>
                  <p className="text-xs font-medium mb-1">Doc. Frente (RG/CNH)</p>
                  {docFrontPreview ? (
                    <div className="relative rounded-lg overflow-hidden border h-28">
                      <img src={docFrontPreview} alt="Frente" className="w-full h-full object-contain bg-muted" />
                      <button
                        type="button"
                        onClick={() => removeDocPreview('front')}
                        className="absolute top-1 right-1 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center gap-1 p-3 border-2 border-dashed rounded-lg cursor-pointer hover:border-primary/50 h-28 justify-center">
                      <Upload className="h-5 w-5 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Selecionar</span>
                      <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleDocSelect('front', f); }} />
                    </label>
                  )}
                </div>
                {/* Doc Verso */}
                <div>
                  <p className="text-xs font-medium mb-1">Doc. Verso</p>
                  {docBackPreview ? (
                    <div className="relative rounded-lg overflow-hidden border h-28">
                      <img src={docBackPreview} alt="Verso" className="w-full h-full object-contain bg-muted" />
                      <button
                        type="button"
                        onClick={() => removeDocPreview('back')}
                        className="absolute top-1 right-1 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center gap-1 p-3 border-2 border-dashed rounded-lg cursor-pointer hover:border-primary/50 h-28 justify-center">
                      <Upload className="h-5 w-5 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Selecionar</span>
                      <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleDocSelect('back', f); }} />
                    </label>
                  )}
                </div>
                {/* Comprovante Endereço */}
                <div>
                  <p className="text-xs font-medium mb-1">Comp. Endereço</p>
                  {comprovantePreview ? (
                    <div className="relative rounded-lg overflow-hidden border h-28">
                      <img src={comprovantePreview} alt="Comprovante" className="w-full h-full object-contain bg-muted" />
                      <button
                        type="button"
                        onClick={() => removeDocPreview('comprovante')}
                        className="absolute top-1 right-1 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center gap-1 p-3 border-2 border-dashed rounded-lg cursor-pointer hover:border-primary/50 h-28 justify-center">
                      <Upload className="h-5 w-5 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Selecionar</span>
                      <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleDocSelect('comprovante', f); }} />
                    </label>
                  )}
                </div>
              </div>
            </div>

            {/* Referências */}
            <div className="border-t pt-4 mt-2">
              <Label className="flex items-center gap-2 mb-3 text-base font-semibold">
                <Users className="h-4 w-4" />
                Contatos de Referência
              </Label>
              <div className="space-y-3">
                {form.contatos_referencia.map((contact, idx) => (
                  <div key={idx} className="p-3 rounded-lg border space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Referência {idx + 1}</p>
                    <div className="grid grid-cols-3 gap-2">
                      <Input
                        placeholder="Nome"
                        className="h-8 text-sm"
                        value={contact.nome}
                        onChange={(e) => setForm(p => {
                          const refs = [...p.contatos_referencia];
                          refs[idx] = { ...refs[idx], nome: e.target.value };
                          return { ...p, contatos_referencia: refs };
                        })}
                      />
                      <Input
                        placeholder="Telefone"
                        className="h-8 text-sm"
                        value={contact.telefone}
                        onChange={(e) => setForm(p => {
                          const refs = [...p.contatos_referencia];
                          refs[idx] = { ...refs[idx], telefone: e.target.value };
                          return { ...p, contatos_referencia: refs };
                        })}
                      />
                      <Input
                        placeholder="Parentesco"
                        className="h-8 text-sm"
                        value={contact.parentesco}
                        onChange={(e) => setForm(p => {
                          const refs = [...p.contatos_referencia];
                          refs[idx] = { ...refs[idx], parentesco: e.target.value };
                          return { ...p, contatos_referencia: refs };
                        })}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            </div>{/* end right column */}
          </div>{/* end 2-col grid */}

            <div className="flex gap-3 pt-2">
              <Button className="flex-1 bg-primary hover:bg-primary/90" onClick={handleSave} disabled={isSaving || !form.nome || !form.email || !form.telefone}>
                {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {editingId ? 'Atualizar' : 'Criar Cliente'}
              </Button>
              <Button className="flex-1" variant="outline" onClick={() => { setModalOpen(false); setEditingId(null); setForm(EMPTY_FORM); resetDocState(); }}>
                Cancelar
              </Button>
            </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
