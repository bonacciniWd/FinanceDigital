/**
 * @module RedeIndicacoesPage
 * @description Mapa interativo da rede de indicações usando ReactFlow.
 *
 * Visualização hierárquica com nós coloridos por status,
 * busca, filtros por status/nível, painel lateral de estatísticas,
 * tooltip no hover e modal de detalhes no clique.
 *
 * @route /rede
 * @access Protegido — todos os perfis autenticados
 * @see useMembrosRede, useBloqueiosAtivos
 */
import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  type Node,
  type Edge,
  type NodeMouseHandler,
  Handle,
  Position,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Slider } from '../components/ui/slider';
import {
  AlertTriangle,
  Search,
  Filter,
  Maximize2,
  Users,
  Ban,
  TrendingUp,
  DollarSign,
  ChevronDown,
  ChevronUp,
  X,
  Layers,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useMembrosRede, useBloqueiosAtivos } from '../hooks/useRedeIndicacoes';
import { useTheme } from '../contexts/ThemeContext';
import type { MembroRede, RedeStats } from '../lib/view-types';

// ── Constantes de cores e layout ─────────────────────────

const STATUS_COLORS_LIGHT: Record<string, { bg: string; border: string; text: string; label: string }> = {
  em_dia: { bg: '#dcfce7', border: '#22c55e', text: '#166534', label: 'Em dia' },
  a_vencer: { bg: '#fef9c3', border: '#eab308', text: '#854d0e', label: 'À vencer' },
  vencido: { bg: '#fecaca', border: '#ef4444', text: '#991b1b', label: 'Vencido' },
};

const STATUS_COLORS_DARK: Record<string, { bg: string; border: string; text: string; label: string }> = {
  em_dia: { bg: '#14532d', border: '#4ade80', text: '#bbf7d0', label: 'Em dia' },
  a_vencer: { bg: '#713f12', border: '#facc15', text: '#fef08a', label: 'À vencer' },
  vencido: { bg: '#7f1d1d', border: '#f87171', text: '#fecaca', label: 'Vencido' },
};

const BLOCKED_COLORS_LIGHT = { bg: '#f3f4f6', border: '#6b7280', text: '#374151', badgeBg: '#e5e7eb', badgeText: '#6b7280', badgeBorder: '#9ca3af' };
const BLOCKED_COLORS_DARK = { bg: '#1f2937', border: '#6b7280', text: '#d1d5db', badgeBg: '#374151', badgeText: '#9ca3af', badgeBorder: '#6b7280' };

const EDGE_COLORS_LIGHT = { normal: '#94a3b8', blocked: '#9ca3af', vencido: '#ef4444' };
const EDGE_COLORS_DARK = { normal: '#475569', blocked: '#6b7280', vencido: '#f87171' };

const MEMBER_STATUS_COLORS: Record<string, { border: string; label: string }> = {
  ativo: { border: '#22c55e', label: 'Ativo' },
  bloqueado: { border: '#6b7280', label: 'Bloqueado' },
  inativo: { border: '#eab308', label: 'Inativo' },
};

const NODE_WIDTH = 200;
const NODE_HEIGHT = 100;
const H_GAP = 60;
const V_GAP = 100;

// ── Custom Node Component ────────────────────────────────

interface NetworkNodeData {
  membro: MembroRede;
  highlighted: boolean;
  [key: string]: unknown;
}

function NetworkNode({ data }: { data: NetworkNodeData }) {
  const { membro, highlighted } = data;
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const statusColors = isDark ? STATUS_COLORS_DARK : STATUS_COLORS_LIGHT;
  const blockedCol = isDark ? BLOCKED_COLORS_DARK : BLOCKED_COLORS_LIGHT;
  const statusInfo = statusColors[membro.clienteStatus] ?? statusColors.em_dia;
  const isBloqueado = membro.status === 'bloqueado';

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  return (
    <>
      <Handle type="target" position={Position.Top} className="!bg-transparent !border-0 !w-0 !h-0" />
      <div
        className={`rounded-lg p-3 shadow-md transition-all duration-200 border-2 ${
          highlighted ? 'ring-4 ring-blue-400 ring-offset-2 dark:ring-blue-500 dark:ring-offset-gray-900' : ''
        }`}
        style={{
          background: isBloqueado ? blockedCol.bg : statusInfo.bg,
          borderColor: isBloqueado ? blockedCol.border : statusInfo.border,
          borderStyle: isBloqueado ? 'dashed' : 'solid',
          width: NODE_WIDTH,
          minHeight: NODE_HEIGHT - 20,
        }}
      >
        {/* Header: Avatar + Nome */}
        <div className="flex items-center gap-2 mb-2">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
            style={{ background: isBloqueado ? blockedCol.border : statusInfo.border }}
          >
            {membro.clienteNome.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm truncate" style={{ color: isBloqueado ? blockedCol.text : statusInfo.text }}>
              {membro.clienteNome}
            </div>
            <div className="text-[10px]" style={{ color: isDark ? '#94a3b8' : '#64748b' }}>Nível {membro.nivel}</div>
          </div>
        </div>
        {/* Footer: Status + Valor */}
        <div className="flex items-center justify-between text-xs">
          <Badge
            className="text-[10px] px-1.5 py-0"
            style={{
              background: isBloqueado ? blockedCol.badgeBg : statusInfo.bg,
              color: isBloqueado ? blockedCol.badgeText : statusInfo.text,
              border: `1px solid ${isBloqueado ? blockedCol.badgeBorder : statusInfo.border}`,
            }}
          >
            {isBloqueado ? '⛔ Bloqueado' : statusInfo.label}
          </Badge>
          <span className="font-medium text-[11px]" style={{ color: isBloqueado ? blockedCol.text : statusInfo.text }}>
            {formatCurrency(membro.clienteValor)}
          </span>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-transparent !border-0 !w-0 !h-0" />
    </>
  );
}

const nodeTypes = { network: NetworkNode };

// ── Layout: Hierarchical tree positioning ────────────────

function computeLayout(membros: MembroRede[], isDark = false): { nodes: Node[]; edges: Edge[] } {
  if (membros.length === 0) return { nodes: [], edges: [] };

  // Build a map of clienteId → membro for quick lookup
  const byCliente = new Map<string, MembroRede>();
  membros.forEach((m) => byCliente.set(m.clienteId, m));

  // Build children map: clienteId → children membros
  const childrenMap = new Map<string, MembroRede[]>();
  const roots: MembroRede[] = [];

  membros.forEach((m) => {
    if (!m.indicadoPor) {
      roots.push(m);
    } else {
      const arr = childrenMap.get(m.indicadoPor) || [];
      arr.push(m);
      childrenMap.set(m.indicadoPor, arr);
    }
  });

  // Calculate subtree widths
  const widths = new Map<string, number>();
  function getWidth(clienteId: string): number {
    if (widths.has(clienteId)) return widths.get(clienteId)!;
    const children = childrenMap.get(clienteId) || [];
    if (children.length === 0) {
      widths.set(clienteId, NODE_WIDTH);
      return NODE_WIDTH;
    }
    const total = children.reduce((sum, c) => sum + getWidth(c.clienteId), 0) + (children.length - 1) * H_GAP;
    const w = Math.max(NODE_WIDTH, total);
    widths.set(clienteId, w);
    return w;
  }

  // Position nodes
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  function position(membro: MembroRede, x: number, y: number) {
    nodes.push({
      id: membro.id,
      type: 'network',
      position: { x: x - NODE_WIDTH / 2, y },
      data: { membro, highlighted: false },
    });

    // Edge from parent
    if (membro.indicadoPor) {
      const parent = byCliente.get(membro.indicadoPor);
      if (parent) {
        const isVencido = membro.clienteStatus === 'vencido';
        const edgeCol = isDark ? EDGE_COLORS_DARK : EDGE_COLORS_LIGHT;
        edges.push({
          id: `edge-${parent.id}-${membro.id}`,
          source: parent.id,
          target: membro.id,
          type: 'smoothstep',
          animated: isVencido,
          style: {
            stroke: isVencido ? edgeCol.vencido : membro.status === 'bloqueado' ? edgeCol.blocked : edgeCol.normal,
            strokeWidth: 2,
            strokeDasharray: membro.status === 'bloqueado' ? '5,5' : undefined,
          },
        });
      }
    }

    // Position children
    const children = childrenMap.get(membro.clienteId) || [];
    if (children.length > 0) {
      const totalW = getWidth(membro.clienteId);
      let startX = x - totalW / 2;
      children.forEach((child) => {
        const childW = getWidth(child.clienteId);
        position(child, startX + childW / 2, y + NODE_HEIGHT + V_GAP);
        startX += childW + H_GAP;
      });
    }
  }

  // Layout all roots side by side
  let totalRootsW = roots.reduce((sum, r) => sum + getWidth(r.clienteId), 0) + (roots.length - 1) * H_GAP * 2;
  let startX = -totalRootsW / 2;
  roots.forEach((root) => {
    const w = getWidth(root.clienteId);
    position(root, startX + w / 2, 0);
    startX += w + H_GAP * 2;
  });

  return { nodes, edges };
}

// ── Compute stats from members ───────────────────────────

function computeStats(membros: MembroRede[]): RedeStats {
  const stats: RedeStats = {
    totalMembros: membros.length,
    emDia: 0,
    aVencer: 0,
    vencidos: 0,
    bloqueados: 0,
    niveis: 0,
    totalBonus: 0,
    totalCarteira: 0,
    redeBloqueada: false,
  };

  membros.forEach((m) => {
    if (m.clienteStatus === 'em_dia') stats.emDia++;
    else if (m.clienteStatus === 'a_vencer') stats.aVencer++;
    else if (m.clienteStatus === 'vencido') stats.vencidos++;
    if (m.status === 'bloqueado') stats.bloqueados++;
    stats.niveis = Math.max(stats.niveis, m.nivel);
    stats.totalBonus += m.clienteBonusAcumulado;
    stats.totalCarteira += m.clienteValor;
  });

  stats.redeBloqueada = stats.bloqueados > 0;
  return stats;
}

// ── Flow wrapper (needs ReactFlowProvider) ───────────────

function RedeFlow() {
  const navigate = useNavigate();
  const { data: allMembros = [], isLoading: loadingMembros } = useMembrosRede();
  const { data: bloqueiosAtivos = [] } = useBloqueiosAtivos();

  // Derive network options from roots (nivel 1) — show root client name as label
  const redesOptions = useMemo(() => {
    const seen = new Set<string>();
    return allMembros
      .filter((m) => m.nivel === 1 && !seen.has(m.redeId) && seen.add(m.redeId))
      .map((m) => ({ id: m.redeId, label: m.clienteNome }));
  }, [allMembros]);
  const { fitView } = useReactFlow();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const statusColors = isDark ? STATUS_COLORS_DARK : STATUS_COLORS_LIGHT;

  // State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilters, setStatusFilters] = useState<string[]>(['em_dia', 'a_vencer', 'vencido']);
  const [memberStatusFilters, setMemberStatusFilters] = useState<string[]>(['ativo', 'bloqueado', 'inativo']);
  const [maxLevel, setMaxLevel] = useState(5);
  const [showBlockedOnly, setShowBlockedOnly] = useState(false);
  const [selectedRede, setSelectedRede] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedMembro, setSelectedMembro] = useState<MembroRede | null>(null);
  const [showStats, setShowStats] = useState(true);

  const [nodes, setNodes, onNodesChange] = useNodesState([]) as unknown as [Node[], (n: Node[] | ((prev: Node[]) => Node[])) => void, (changes: any) => void];
  const [edges, setEdges, onEdgesChange] = useEdgesState([]) as unknown as [Edge[], (e: Edge[] | ((prev: Edge[]) => Edge[])) => void, (changes: any) => void];

  // Filter members
  const filteredMembros = useMemo(() => {
    let filtered = [...allMembros];

    // By rede
    if (selectedRede !== 'all') {
      filtered = filtered.filter((m) => m.redeId === selectedRede);
    }

    // By client status
    filtered = filtered.filter((m) => statusFilters.includes(m.clienteStatus));

    // By member status
    filtered = filtered.filter((m) => memberStatusFilters.includes(m.status));

    // By max level
    filtered = filtered.filter((m) => m.nivel <= maxLevel);

    // By blocked only
    if (showBlockedOnly) {
      const blockedRedeIds = new Set(filtered.filter((m) => m.status === 'bloqueado').map((m) => m.redeId));
      filtered = filtered.filter((m) => blockedRedeIds.has(m.redeId));
    }

    // By search — keep matches + all ancestors to preserve tree connections
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const byCliente = new Map<string, MembroRede>(filtered.map((m) => [m.clienteId, m]));
      const keepIds = new Set<string>();

      function addWithAncestors(m: MembroRede) {
        if (keepIds.has(m.clienteId)) return;
        keepIds.add(m.clienteId);
        if (m.indicadoPor) {
          const parent = byCliente.get(m.indicadoPor);
          if (parent) addWithAncestors(parent);
        }
      }

      filtered
        .filter((m) =>
          m.clienteNome.toLowerCase().includes(q) ||
          m.clienteEmail.toLowerCase().includes(q)
        )
        .forEach(addWithAncestors);

      filtered = filtered.filter((m) => keepIds.has(m.clienteId));
    }

    return filtered;
  }, [allMembros, selectedRede, statusFilters, memberStatusFilters, maxLevel, showBlockedOnly, searchQuery]);

  // Compute layout on filter change
  useEffect(() => {
    const { nodes: newNodes, edges: newEdges } = computeLayout(filteredMembros, isDark);

    // Highlight matching search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      newNodes.forEach((n) => {
        const data = n.data as NetworkNodeData;
        data.highlighted =
          data.membro.clienteNome.toLowerCase().includes(q) ||
          data.membro.clienteEmail.toLowerCase().includes(q);
      });
    }

    setNodes(newNodes);
    setEdges(newEdges);
  }, [filteredMembros, searchQuery, isDark, setNodes, setEdges]);

  // Fit view when nodes change or search narrows results
  useEffect(() => {
    if (nodes.length > 0) {
      setTimeout(() => fitView({ padding: searchQuery.trim() ? 0.4 : 0.2, duration: 400 }), 50);
    }
  }, [nodes.length, fitView, searchQuery]);

  // Stats
  const stats = useMemo(() => computeStats(filteredMembros), [filteredMembros]);

  // Node click handler
  const onNodeClick: NodeMouseHandler = useCallback((_event, node) => {
    const data = node.data as NetworkNodeData;
    setSelectedMembro(data.membro);
  }, []);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const toggleStatusFilter = (status: string) => {
    setStatusFilters((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]
    );
  };

  const toggleMemberStatusFilter = (status: string) => {
    setMemberStatusFilters((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]
    );
  };

  if (loadingMembros) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Rede de Indicações</h1>
          <p className="text-muted-foreground mt-1">Mapa interativo da rede hierárquica de indicações</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowStats(!showStats)}
          >
            {showStats ? <EyeOff className="w-4 h-4 mr-1" /> : <Eye className="w-4 h-4 mr-1" />}
            Estatísticas
          </Button>
        </div>
      </div>

      {/* Alert for active blocks */}
      {bloqueiosAtivos.length > 0 && (
        <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg">
          <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-semibold text-red-800 dark:text-red-300">
              ⚠️ {bloqueiosAtivos.length} bloqueio(s) solidário(s) ativo(s)
            </p>
            <div className="text-sm text-red-700 dark:text-red-400 mt-1 space-y-0.5">
              {bloqueiosAtivos.map((b) => (
                <p key={b.id}>
                  Rede <strong>{b.redeId}</strong> — causa: {b.causadorNome} ({b.motivo})
                </p>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-3 items-center">
          {/* Search */}
          <div className="relative flex-1 min-w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por nome do cliente..."
              className={`pl-10 ${searchQuery ? 'pr-24' : 'pr-10'}`}
            />
            {searchQuery && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                <span className="text-xs font-medium px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                  {filteredMembros.filter((m) => m.clienteNome.toLowerCase().includes(searchQuery.toLowerCase()) || m.clienteEmail.toLowerCase().includes(searchQuery.toLowerCase())).length} resultado(s)
                </span>
                <button
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => setSearchQuery('')}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* Rede selector */}
          <select
            value={selectedRede}
            onChange={(e) => setSelectedRede(e.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="all">Todas as Redes</option>
            {redesOptions.map((r) => (
              <option key={r.id} value={r.id}>{r.label}</option>
            ))}
          </select>

          {/* Filters toggle */}
          <Button variant="outline" size="sm" onClick={() => setShowFilters(!showFilters)}>
            <Filter className="w-4 h-4 mr-1" />
            Filtros
            {showFilters ? <ChevronUp className="w-4 h-4 ml-1" /> : <ChevronDown className="w-4 h-4 ml-1" />}
          </Button>

          {/* Center view */}
          <Button variant="outline" size="sm" onClick={() => fitView({ padding: 0.2, duration: 400 })}>
            <Maximize2 className="w-4 h-4 mr-1" />
            Centralizar
          </Button>
        </div>

        {/* Filter panel */}
        {showFilters && (
          <Card>
            <CardContent className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Status do cliente */}
                <div>
                  <label className="text-sm font-medium mb-2 block">Status do Cliente</label>
                  <div className="space-y-2">
                    {Object.entries(statusColors).map(([status, info]) => (
                      <label key={status} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={statusFilters.includes(status)}
                          onChange={() => toggleStatusFilter(status)}
                          className="rounded"
                        />
                        <span
                          className="w-3 h-3 rounded-full"
                          style={{ background: info.border }}
                        />
                        <span className="text-sm">{info.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Status do membro */}
                <div>
                  <label className="text-sm font-medium mb-2 block">Status na Rede</label>
                  <div className="space-y-2">
                    {Object.entries(MEMBER_STATUS_COLORS).map(([status, info]) => (
                      <label key={status} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={memberStatusFilters.includes(status)}
                          onChange={() => toggleMemberStatusFilter(status)}
                          className="rounded"
                        />
                        <span
                          className="w-3 h-3 rounded-full"
                          style={{ background: info.border }}
                        />
                        <span className="text-sm capitalize">{status}</span>
                      </label>
                    ))}
                    <label className="flex items-center gap-2 cursor-pointer mt-2 pt-2 border-t">
                      <input
                        type="checkbox"
                        checked={showBlockedOnly}
                        onChange={() => setShowBlockedOnly(!showBlockedOnly)}
                        className="rounded"
                      />
                      <Ban className="w-3 h-3 text-red-500" />
                      <span className="text-sm">Apenas redes bloqueadas</span>
                    </label>
                  </div>
                </div>

                {/* Nível */}
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    <Layers className="w-4 h-4 inline mr-1" />
                    Profundidade máxima: {maxLevel}
                  </label>
                  <Slider
                    value={[maxLevel]}
                    onValueChange={(v) => setMaxLevel(v[0])}
                    min={1}
                    max={10}
                    step={1}
                    className="mt-4"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>1</span>
                    <span>5</span>
                    <span>10</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Main content: Flow + Stats sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 h-screen">
        {/* ReactFlow Canvas */}
        <Card className="overflow-hidden">
          <div className="h-full w-full">
            {filteredMembros.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <Users className="w-16 h-16 mb-4 opacity-30" />
                <p className="text-lg font-medium">Nenhum membro encontrado</p>
                <p className="text-sm">Ajuste os filtros para ver a rede</p>
              </div>
            ) : (
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onNodeClick={onNodeClick}
                nodeTypes={nodeTypes}
                fitView
                minZoom={0.1}
                maxZoom={2}
                nodesDraggable={false}
                nodesConnectable={false}
                proOptions={{ hideAttribution: true }}
              >
                <Background gap={20} size={1} color={isDark ? '#1e293b' : '#f1f5f9'} />
                <Controls showInteractive={false} />
                <MiniMap
                  nodeColor={(n) => {
                    const data = n.data as NetworkNodeData;
                    if (data.membro.status === 'bloqueado') return '#9ca3af';
                    return statusColors[data.membro.clienteStatus]?.border ?? '#94a3b8';
                  }}
                  maskColor={isDark ? 'rgba(15, 23, 41, 0.7)' : 'rgba(248, 250, 252, 0.7)'}
                  className="!bg-card !border !border-border !rounded-lg"
                />
              </ReactFlow>
            )}
          </div>
        </Card>

        {/* Stats Sidebar */}
        {showStats && (
          <div className="space-y-4 overflow-y-auto">
            {/* Global stats */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  Estatísticas da Rede
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-2 bg-muted rounded-lg text-center">
                    <div className="text-xl font-bold">{stats.totalMembros}</div>
                    <div className="text-[10px] text-muted-foreground">Total Membros</div>
                  </div>
                  <div className="p-2 bg-muted rounded-lg text-center">
                    <div className="text-xl font-bold">{stats.niveis}</div>
                    <div className="text-[10px] text-muted-foreground">Níveis</div>
                  </div>
                </div>

                {/* Status breakdown */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
                      <span>Em dia</span>
                    </div>
                    <span className="font-semibold">{stats.emDia}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
                      <span>À vencer</span>
                    </div>
                    <span className="font-semibold">{stats.aVencer}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
                      <span>Vencidos</span>
                    </div>
                    <span className="font-semibold text-red-600 dark:text-red-400">{stats.vencidos}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-gray-400" />
                      <span>Bloqueados</span>
                    </div>
                    <span className="font-semibold">{stats.bloqueados}</span>
                  </div>
                </div>

                <div className="pt-2 border-t space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Carteira total</span>
                    <span className="font-semibold">{formatCurrency(stats.totalCarteira)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Bônus acumulado</span>
                    <span className="font-semibold text-green-600 dark:text-green-400">{formatCurrency(stats.totalBonus)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Active blocks */}
            {bloqueiosAtivos.length > 0 && (
              <Card className="border-red-300 dark:border-red-800">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2 text-red-700 dark:text-red-400">
                    <Ban className="w-4 h-4" />
                    Bloqueios Ativos ({bloqueiosAtivos.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {bloqueiosAtivos.map((b) => (
                    <div key={b.id} className="p-2 bg-red-50 dark:bg-red-950/30 rounded text-xs space-y-1">
                      <div className="font-medium text-red-800 dark:text-red-300">{b.redeId}</div>
                      <div className="text-red-600 dark:text-red-400">
                        Causa: {b.causadorNome}
                      </div>
                      <div className="text-red-500 dark:text-red-500">{b.descricao}</div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Recent members */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  Últimos Membros
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {[...allMembros]
                    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                    .slice(0, 5)
                    .map((m) => (
                      <div
                        key={m.id}
                        className="flex items-center gap-2 text-sm p-1.5 rounded hover:bg-muted cursor-pointer"
                        onClick={() => setSelectedMembro(m)}
                      >
                        <div
                          className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold"
                          style={{
                            background:
                              m.status === 'bloqueado'
                                ? '#6b7280'
                                : statusColors[m.clienteStatus]?.border ?? '#94a3b8',
                          }}
                        >
                          {m.clienteNome.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-xs truncate">{m.clienteNome}</div>
                          <div className="text-[10px] text-muted-foreground">{m.redeId} · N{m.nivel}</div>
                        </div>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>

            {/* Legend */}
            <Card>
              <CardContent className="p-3">
                <div className="text-xs font-medium mb-2">Legenda</div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-green-500" />
                    🟢 Em dia
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-yellow-500" />
                    🟡 À vencer
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-red-500" />
                    🔴 Vencido
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-gray-400" />
                    ⚫ Bloqueado
                  </div>
                </div>
                <div className="mt-2 pt-2 border-t space-y-1 text-[10px] text-muted-foreground">
                  <div>— Linha tracejada = membro bloqueado</div>
                  <div>— Linha animada = cliente vencido</div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      <Dialog open={!!selectedMembro} onOpenChange={() => setSelectedMembro(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              {selectedMembro && (
                <>
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold"
                    style={{
                      background:
                        selectedMembro.status === 'bloqueado'
                          ? '#6b7280'
                          : statusColors[selectedMembro.clienteStatus]?.border ?? '#94a3b8',
                    }}
                  >
                    {selectedMembro.clienteNome.charAt(0)}
                  </div>
                  <div>
                    <div>{selectedMembro.clienteNome}</div>
                    <div className="text-sm font-normal text-muted-foreground">
                      {selectedMembro.redeId} · Nível {selectedMembro.nivel}
                    </div>
                  </div>
                </>
              )}
            </DialogTitle>
          </DialogHeader>

          {selectedMembro && (
            <div className="space-y-4">
              {/* Status */}
              <div className="flex items-center gap-3">
                <Badge
                  style={{
                    background: statusColors[selectedMembro.clienteStatus]?.bg,
                    color: statusColors[selectedMembro.clienteStatus]?.text,
                    border: `1px solid ${statusColors[selectedMembro.clienteStatus]?.border}`,
                  }}
                >
                  {statusColors[selectedMembro.clienteStatus]?.label}
                </Badge>
                {selectedMembro.status === 'bloqueado' && (
                  <Badge variant="destructive">⛔ Rede Bloqueada</Badge>
                )}
              </div>

              {/* Info grid */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="p-3 bg-muted rounded-lg">
                  <div className="text-muted-foreground text-xs">Carteira</div>
                  <div className="font-bold">{formatCurrency(selectedMembro.clienteValor)}</div>
                </div>
                <div className="p-3 bg-muted rounded-lg">
                  <div className="text-muted-foreground text-xs">Bônus</div>
                  <div className="font-bold text-green-600 dark:text-green-400">{formatCurrency(selectedMembro.clienteBonusAcumulado)}</div>
                </div>
                <div className="p-3 bg-muted rounded-lg">
                  <div className="text-muted-foreground text-xs">Score</div>
                  <div className="font-bold">{selectedMembro.clienteScoreInterno}</div>
                </div>
                <div className="p-3 bg-muted rounded-lg">
                  <div className="text-muted-foreground text-xs">Desde</div>
                  <div className="font-bold text-xs">
                    {new Date(selectedMembro.createdAt).toLocaleDateString('pt-BR')}
                  </div>
                </div>
              </div>

              {/* Contact */}
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Email</span>
                  <span>{selectedMembro.clienteEmail}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Telefone</span>
                  <span>{selectedMembro.clienteTelefone}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Indicado por</span>
                  <span>
                    {selectedMembro.indicadoPor
                      ? allMembros.find((m) => m.clienteId === selectedMembro.indicadoPor)?.clienteNome ?? selectedMembro.indicadoPor
                      : 'Raiz da rede'}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-2 border-t">
                <Button size="sm" variant="outline" className="flex-1" onClick={() => { setSelectedMembro(null); navigate('/clientes'); }}>
                  Ver no Clientes
                </Button>
                <Button size="sm" variant="outline" className="flex-1" onClick={() => { setSelectedMembro(null); navigate(`/chat?phone=${encodeURIComponent(selectedMembro.clienteTelefone)}`); }}>
                  Enviar Mensagem
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Page export (wrapped with ReactFlowProvider) ─────────

export default function RedeIndicacoesPage() {
  return (
    <ReactFlowProvider>
      <RedeFlow />
    </ReactFlowProvider>
  );
}
