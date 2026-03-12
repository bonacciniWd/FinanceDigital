/**
 * @module FluxoEditorPage
 * @description Editor visual de fluxos de chatbot com ReactFlow.
 *
 * Permite criar, editar e conectar etapas do fluxo de forma visual
 * usando drag & drop. Cada nó representa uma etapa do chatbot e pode
 * ser configurado com mensagens, botões, condições, ações e esperas.
 *
 * O estado completo (posições, conexões, config) é salvo no campo
 * `config` JSONB de cada `fluxos_chatbot_etapas`.
 *
 * @route /chat/fluxos/:id/editor
 * @access Protegido — perfis admin, gerente
 */
import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router';
import Lottie from 'lottie-react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Panel,
  useNodesState,
  useEdgesState,
  ReactFlowProvider,
  type Node,
  type Edge,
  type Connection,
  type NodeTypes,
  MarkerType,
  Handle,
  Position,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  ArrowLeft,
  Save,
  Plus,
  MessageSquare,
  GitBranch,
  Zap,
  Clock,
  XCircle,
  Trash2,
  Loader2,
  Settings,
  X,
  Check,
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as fluxosChatbotService from '../services/fluxosChatbotService';
import type {
  FluxoChatbotEtapaInsert,
  FluxoEtapaTipo,
  Json,
} from '../lib/database.types';
import flowLoaderAnimation from '../assets/flow-loader.json';

// ── Constantes ──
const PRELOAD_DURATION_MS = 5000;

const loadingMessages = [
  'Carregando estrutura do fluxo...',
  'Mapeando conexões entre nós...',
  'Preparando editor visual...',
  'Renderizando componentes...',
  'Quase pronto...',
];

// ══════════════════════════════════════════════════════════
// ── Tipos de config para cada tipo de nó ─────────────────
// ══════════════════════════════════════════════════════════

interface NodePosition {
  x: number;
  y: number;
}

interface ButtonConfig {
  label: string;
  value: string;
}

interface MensagemConfig {
  position: NodePosition;
  buttons?: ButtonConfig[];
  media_url?: string;
  media_type?: 'image' | 'video' | 'document' | 'audio';
  delay_ms?: number;
}

interface CondicaoConfig {
  position: NodePosition;
  variable: string;
  operator: string;
  value: string;
}

interface AcaoConfig {
  position: NodePosition;
  action_type: string;
  params: Record<string, string>;
}

interface EsperaConfig {
  position: NodePosition;
  duration_ms: number;
  duration_label: string;
}

interface FinalizarConfig {
  position: NodePosition;
  close_reason?: string;
}

type EtapaConfig = MensagemConfig | CondicaoConfig | AcaoConfig | EsperaConfig | FinalizarConfig;

// ── Helper: parse JSON config safely ──
function parseConfig(config: Json): Partial<EtapaConfig> {
  if (typeof config === 'object' && config !== null && !Array.isArray(config)) {
    return config as unknown as Partial<EtapaConfig>;
  }
  return {};
}

// ══════════════════════════════════════════════════════════
// ── Custom Nodes ─────────────────────────────────────────
// ══════════════════════════════════════════════════════════

const nodeColors: Record<string, { bg: string; border: string; icon: string }> = {
  trigger: { bg: 'bg-blue-50 dark:bg-blue-950', border: 'border-blue-400 dark:border-blue-600', icon: 'text-blue-600 dark:text-blue-400' },
  mensagem: { bg: 'bg-green-50 dark:bg-green-950', border: 'border-green-400 dark:border-green-600', icon: 'text-green-600 dark:text-green-400' },
  condicao: { bg: 'bg-yellow-50 dark:bg-yellow-950', border: 'border-yellow-400 dark:border-yellow-600', icon: 'text-yellow-600 dark:text-yellow-400' },
  acao: { bg: 'bg-purple-50 dark:bg-purple-950', border: 'border-purple-400 dark:border-purple-600', icon: 'text-purple-600 dark:text-purple-400' },
  espera: { bg: 'bg-orange-50 dark:bg-orange-950', border: 'border-orange-400 dark:border-orange-600', icon: 'text-orange-600 dark:text-orange-400' },
  finalizar: { bg: 'bg-red-50 dark:bg-red-950', border: 'border-red-400 dark:border-red-600', icon: 'text-red-600 dark:text-red-400' },
};

const nodeIcons: Record<string, React.ReactNode> = {
  trigger: <Zap className="w-4 h-4" />,
  mensagem: <MessageSquare className="w-4 h-4" />,
  condicao: <GitBranch className="w-4 h-4" />,
  acao: <Settings className="w-4 h-4" />,
  espera: <Clock className="w-4 h-4" />,
  finalizar: <XCircle className="w-4 h-4" />,
};

const nodeLabels: Record<string, string> = {
  trigger: 'Gatilho',
  mensagem: 'Mensagem',
  condicao: 'Condição',
  acao: 'Ação',
  espera: 'Espera',
  finalizar: 'Finalizar',
};

/** Nó de gatilho (start, não editável) */
function TriggerNode({ data }: NodeProps) {
  const d = data as Record<string, unknown>;
  const colors = nodeColors.trigger;
  return (
    <div className={`rounded-xl border-2 ${colors.border} ${colors.bg} p-4 min-w-[220px] shadow-md`}>
      <div className="flex items-center gap-2 mb-2">
        <div className={`${colors.icon}`}>{nodeIcons.trigger}</div>
        <span className="font-semibold text-sm">Gatilho</span>
        <Badge variant="secondary" className="text-[10px] ml-auto">{String(d.gatilho || '')}</Badge>
      </div>
      {!!d.palavra_chave && (
        <p className="text-xs text-muted-foreground">Palavras: "{String(d.palavra_chave)}"</p>
      )}
      {!!d.cron_expression && (
        <p className="text-xs text-muted-foreground">Cron: {String(d.cron_expression)}</p>
      )}
      <Handle type="source" position={Position.Bottom} className="!w-3 !h-3 !bg-blue-500 !border-2 !border-white" />
    </div>
  );
}

/** Nó de mensagem */
function MensagemNode({ data, selected }: NodeProps) {
  const d = data as Record<string, unknown>;
  const colors = nodeColors.mensagem;
  const config = (d.config || {}) as Partial<MensagemConfig>;
  return (
    <div className={`rounded-xl border-2 ${selected ? 'border-primary ring-2 ring-primary/20' : colors.border} ${colors.bg} p-4 min-w-[240px] max-w-[300px] shadow-md`}>
      <Handle type="target" position={Position.Top} className="!w-3 !h-3 !bg-green-500 !border-2 !border-white" />
      <div className="flex items-center gap-2 mb-2">
        <div className={`${colors.icon}`}>{nodeIcons.mensagem}</div>
        <span className="font-semibold text-sm">Mensagem</span>
        {config.media_type && (
          <Badge variant="outline" className="text-[9px] ml-auto">{config.media_type}</Badge>
        )}
      </div>
      <p className="text-xs text-foreground/80 line-clamp-3 whitespace-pre-wrap">{String(d.conteudo || '(sem conteúdo)')}</p>
      {config.buttons && config.buttons.length > 0 && (
        <div className="mt-2 space-y-1">
          {config.buttons.map((btn: ButtonConfig, i: number) => (
            <div key={i} className="text-[10px] bg-white/60 dark:bg-white/10 rounded px-2 py-0.5 border">
              🔘 {btn.label}
            </div>
          ))}
        </div>
      )}
      {config.delay_ms && config.delay_ms > 0 && (
        <p className="text-[10px] text-muted-foreground mt-1">⏱ {(config.delay_ms / 1000)}s delay</p>
      )}
      <Handle type="source" position={Position.Bottom} className="!w-3 !h-3 !bg-green-500 !border-2 !border-white" />
    </div>
  );
}

/** Nó de condição (2 saídas: sim/não) */
function CondicaoNode({ data, selected }: NodeProps) {
  const d = data as Record<string, unknown>;
  const colors = nodeColors.condicao;
  const config = (d.config || {}) as Partial<CondicaoConfig>;
  return (
    <div className={`rounded-xl border-2 ${selected ? 'border-primary ring-2 ring-primary/20' : colors.border} ${colors.bg} p-4 min-w-[240px] shadow-md`}>
      <Handle type="target" position={Position.Top} className="!w-3 !h-3 !bg-yellow-500 !border-2 !border-white" />
      <div className="flex items-center gap-2 mb-2">
        <div className={`${colors.icon}`}>{nodeIcons.condicao}</div>
        <span className="font-semibold text-sm">Condição</span>
      </div>
      <p className="text-xs text-foreground/80">{String(d.conteudo || '(sem condição)')}</p>
      {config.variable && (
        <p className="text-[10px] text-muted-foreground mt-1">
          {config.variable} {config.operator} "{config.value}"
        </p>
      )}
      <div className="flex justify-between mt-3 text-[10px]">
        <span className="text-green-600 font-medium">✓ Sim</span>
        <span className="text-red-600 font-medium">✗ Não</span>
      </div>
      <Handle type="source" position={Position.Bottom} id="sim" className="!w-3 !h-3 !bg-green-500 !border-2 !border-white" style={{ left: '30%' }} />
      <Handle type="source" position={Position.Bottom} id="nao" className="!w-3 !h-3 !bg-red-500 !border-2 !border-white" style={{ left: '70%' }} />
    </div>
  );
}

/** Nó de ação */
function AcaoNode({ data, selected }: NodeProps) {
  const d = data as Record<string, unknown>;
  const colors = nodeColors.acao;
  const config = (d.config || {}) as Partial<AcaoConfig>;
  return (
    <div className={`rounded-xl border-2 ${selected ? 'border-primary ring-2 ring-primary/20' : colors.border} ${colors.bg} p-4 min-w-[220px] shadow-md`}>
      <Handle type="target" position={Position.Top} className="!w-3 !h-3 !bg-purple-500 !border-2 !border-white" />
      <div className="flex items-center gap-2 mb-2">
        <div className={`${colors.icon}`}>{nodeIcons.acao}</div>
        <span className="font-semibold text-sm">Ação</span>
        {config.action_type && (
          <Badge variant="outline" className="text-[9px] ml-auto">{config.action_type}</Badge>
        )}
      </div>
      <p className="text-xs text-foreground/80">{String(d.conteudo || '(sem ação configurada)')}</p>
      <Handle type="source" position={Position.Bottom} className="!w-3 !h-3 !bg-purple-500 !border-2 !border-white" />
    </div>
  );
}

/** Nó de espera */
function EsperaNode({ data, selected }: NodeProps) {
  const d = data as Record<string, unknown>;
  const colors = nodeColors.espera;
  const config = (d.config || {}) as Partial<EsperaConfig>;
  return (
    <div className={`rounded-xl border-2 ${selected ? 'border-primary ring-2 ring-primary/20' : colors.border} ${colors.bg} p-4 min-w-[200px] shadow-md`}>
      <Handle type="target" position={Position.Top} className="!w-3 !h-3 !bg-orange-500 !border-2 !border-white" />
      <div className="flex items-center gap-2 mb-2">
        <div className={`${colors.icon}`}>{nodeIcons.espera}</div>
        <span className="font-semibold text-sm">Espera</span>
      </div>
      <p className="text-xs text-foreground/80">
        {String(config.duration_label || d.conteudo || '(tempo não configurado)')}
      </p>
      <Handle type="source" position={Position.Bottom} className="!w-3 !h-3 !bg-orange-500 !border-2 !border-white" />
    </div>
  );
}

/** Nó de finalização */
function FinalizarNode({ data, selected }: NodeProps) {
  const d = data as Record<string, unknown>;
  const colors = nodeColors.finalizar;
  const config = (d.config || {}) as Partial<FinalizarConfig>;
  return (
    <div className={`rounded-xl border-2 ${selected ? 'border-primary ring-2 ring-primary/20' : colors.border} ${colors.bg} p-4 min-w-[200px] shadow-md`}>
      <Handle type="target" position={Position.Top} className="!w-3 !h-3 !bg-red-500 !border-2 !border-white" />
      <div className="flex items-center gap-2 mb-2">
        <div className={`${colors.icon}`}>{nodeIcons.finalizar}</div>
        <span className="font-semibold text-sm">Finalizar</span>
      </div>
      <p className="text-xs text-foreground/80">
        {String(config.close_reason || d.conteudo || 'Encerrar conversa')}
      </p>
    </div>
  );
}

// ── Registrar tipos de nós ──
const customNodeTypes: NodeTypes = {
  trigger: TriggerNode,
  mensagem: MensagemNode,
  condicao: CondicaoNode,
  acao: AcaoNode,
  espera: EsperaNode,
  finalizar: FinalizarNode,
};

// ══════════════════════════════════════════════════════════
// ── Painel de edição lateral ─────────────────────────────
// ══════════════════════════════════════════════════════════

interface EditPanelProps {
  node: Node | null;
  onUpdate: (nodeId: string, data: Record<string, unknown>) => void;
  onDelete: (nodeId: string) => void;
  onClose: () => void;
}

function EditPanel({ node, onUpdate, onDelete, onClose }: EditPanelProps) {
  if (!node || node.type === 'trigger') return null;

  const tipo = node.type as FluxoEtapaTipo;
  const data = node.data;
  const config = (data.config || {}) as Record<string, unknown>;

  const [conteudo, setConteudo] = useState(String(data.conteudo || ''));
  const [buttons, setButtons] = useState<ButtonConfig[]>(
    (config.buttons as ButtonConfig[]) || []
  );
  const [mediaUrl, setMediaUrl] = useState(String(config.media_url || ''));
  const [mediaType, setMediaType] = useState(String(config.media_type || ''));
  const [delayMs, setDelayMs] = useState(Number(config.delay_ms || 0));
  const [variable, setVariable] = useState(String(config.variable || ''));
  const [operator, setOperator] = useState(String(config.operator || 'equals'));
  const [condValue, setCondValue] = useState(String(config.value || ''));
  const [actionType, setActionType] = useState(String(config.action_type || ''));
  const [durationMs, setDurationMs] = useState(Number(config.duration_ms || 0));
  const [durationLabel, setDurationLabel] = useState(String(config.duration_label || ''));
  const [closeReason, setCloseReason] = useState(String(config.close_reason || ''));

  // Sync quando troca de nó
  useEffect(() => {
    const cfg = (node.data.config || {}) as Record<string, unknown>;
    setConteudo(String(node.data.conteudo || ''));
    setButtons((cfg.buttons as ButtonConfig[]) || []);
    setMediaUrl(String(cfg.media_url || ''));
    setMediaType(String(cfg.media_type || ''));
    setDelayMs(Number(cfg.delay_ms || 0));
    setVariable(String(cfg.variable || ''));
    setOperator(String(cfg.operator || 'equals'));
    setCondValue(String(cfg.value || ''));
    setActionType(String(cfg.action_type || ''));
    setDurationMs(Number(cfg.duration_ms || 0));
    setDurationLabel(String(cfg.duration_label || ''));
    setCloseReason(String(cfg.close_reason || ''));
  }, [node.id, node.data]);

  const handleSave = () => {
    const baseConfig: Record<string, unknown> = { ...(config as Record<string, unknown>), position: config.position };

    if (tipo === 'mensagem') {
      Object.assign(baseConfig, {
        buttons: buttons.filter((b) => b.label),
        media_url: mediaUrl || undefined,
        media_type: mediaType || undefined,
        delay_ms: delayMs || undefined,
      });
    } else if (tipo === 'condicao') {
      Object.assign(baseConfig, { variable, operator, value: condValue });
    } else if (tipo === 'acao') {
      Object.assign(baseConfig, { action_type: actionType });
    } else if (tipo === 'espera') {
      Object.assign(baseConfig, { duration_ms: durationMs, duration_label: durationLabel });
    } else if (tipo === 'finalizar') {
      Object.assign(baseConfig, { close_reason: closeReason });
    }

    onUpdate(node.id, { conteudo, config: baseConfig });
  };

  const addButton = () => {
    setButtons([...buttons, { label: '', value: '' }]);
  };

  const removeButton = (idx: number) => {
    setButtons(buttons.filter((_, i) => i !== idx));
  };

  const updateButton = (idx: number, field: 'label' | 'value', val: string) => {
    const updated = [...buttons];
    updated[idx] = { ...updated[idx], [field]: val };
    setButtons(updated);
  };

  return (
    <div className="w-[360px] border-l bg-card h-full overflow-y-auto">
      <div className="p-4 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={nodeColors[tipo]?.icon || ''}>
            {nodeIcons[tipo]}
          </div>
          <h3 className="font-semibold">{nodeLabels[tipo]}</h3>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      <div className="p-4 space-y-4">
        {/* Conteúdo (comum a todos) */}
        <div>
          <label className="text-sm font-medium mb-1 block">
            {tipo === 'mensagem' ? 'Texto da Mensagem' :
              tipo === 'condicao' ? 'Descrição da Condição' :
              tipo === 'acao' ? 'Descrição da Ação' :
              tipo === 'espera' ? 'Descrição' : 'Mensagem Final'}
          </label>
          <Textarea
            value={conteudo}
            onChange={(e) => setConteudo(e.target.value)}
            placeholder="Digite o conteúdo..."
            rows={tipo === 'mensagem' ? 4 : 2}
          />
        </div>

        {/* ── Campos específicos de Mensagem ── */}
        {tipo === 'mensagem' && (
          <>
            {/* Botões interativos */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">Botões Interativos</label>
                <Button variant="outline" size="sm" onClick={addButton} disabled={buttons.length >= 3}>
                  <Plus className="w-3 h-3 mr-1" />Adicionar
                </Button>
              </div>
              {buttons.map((btn, idx) => (
                <div key={idx} className="flex gap-2 mb-2">
                  <Input
                    placeholder="Rótulo"
                    value={btn.label}
                    onChange={(e) => updateButton(idx, 'label', e.target.value)}
                    className="flex-1"
                  />
                  <Input
                    placeholder="Valor"
                    value={btn.value}
                    onChange={(e) => updateButton(idx, 'value', e.target.value)}
                    className="flex-1"
                  />
                  <Button variant="ghost" size="icon" onClick={() => removeButton(idx)}>
                    <Trash2 className="w-3 h-3 text-destructive" />
                  </Button>
                </div>
              ))}
              <p className="text-[10px] text-muted-foreground">Máx. 3 botões por mensagem (WhatsApp API)</p>
            </div>

            {/* Mídia */}
            <div>
              <label className="text-sm font-medium mb-1 block">Mídia (opcional)</label>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <Select value={mediaType} onValueChange={setMediaType}>
                  <SelectTrigger><SelectValue placeholder="Tipo" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhuma</SelectItem>
                    <SelectItem value="image">Imagem</SelectItem>
                    <SelectItem value="video">Vídeo</SelectItem>
                    <SelectItem value="document">Documento</SelectItem>
                    <SelectItem value="audio">Áudio</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {mediaType && mediaType !== 'none' && (
                <Input
                  placeholder="URL da mídia"
                  value={mediaUrl}
                  onChange={(e) => setMediaUrl(e.target.value)}
                />
              )}
            </div>

            {/* Delay */}
            <div>
              <label className="text-sm font-medium mb-1 block">Delay antes de enviar (ms)</label>
              <Input
                type="number"
                min={0}
                step={500}
                value={delayMs}
                onChange={(e) => setDelayMs(Number(e.target.value))}
                placeholder="0"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                {delayMs > 0 ? `${(delayMs / 1000).toFixed(1)}s` : 'Sem delay'}
              </p>
            </div>
          </>
        )}

        {/* ── Campos específicos de Condição ── */}
        {tipo === 'condicao' && (
          <>
            <div>
              <label className="text-sm font-medium mb-1 block">Variável</label>
              <Select value={variable} onValueChange={setVariable}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="resposta">Resposta do Cliente</SelectItem>
                  <SelectItem value="horario">Horário Atual</SelectItem>
                  <SelectItem value="departamento">Departamento</SelectItem>
                  <SelectItem value="status_cliente">Status do Cliente</SelectItem>
                  <SelectItem value="parcelas_atrasadas">Parcelas Atrasadas</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Operador</label>
              <Select value={operator} onValueChange={setOperator}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="equals">Igual a</SelectItem>
                  <SelectItem value="contains">Contém</SelectItem>
                  <SelectItem value="not_equals">Diferente de</SelectItem>
                  <SelectItem value="greater_than">Maior que</SelectItem>
                  <SelectItem value="less_than">Menor que</SelectItem>
                  <SelectItem value="starts_with">Começa com</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Valor</label>
              <Input
                placeholder="Valor esperado"
                value={condValue}
                onChange={(e) => setCondValue(e.target.value)}
              />
            </div>
          </>
        )}

        {/* ── Campos específicos de Ação ── */}
        {tipo === 'acao' && (
          <div>
            <label className="text-sm font-medium mb-1 block">Tipo de Ação</label>
            <Select value={actionType} onValueChange={setActionType}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="transferir_atendente">Transferir p/ Atendente</SelectItem>
                <SelectItem value="transferir_departamento">Transferir p/ Departamento</SelectItem>
                <SelectItem value="adicionar_tag">Adicionar Tag</SelectItem>
                <SelectItem value="remover_tag">Remover Tag</SelectItem>
                <SelectItem value="webhook">Chamar Webhook</SelectItem>
                <SelectItem value="atualizar_status">Atualizar Status</SelectItem>
                <SelectItem value="criar_tarefa">Criar Tarefa</SelectItem>
                <SelectItem value="enviar_email">Enviar E-mail</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {/* ── Campos específicos de Espera ── */}
        {tipo === 'espera' && (
          <>
            <div>
              <label className="text-sm font-medium mb-1 block">Duração (milissegundos)</label>
              <Input
                type="number"
                min={0}
                step={1000}
                value={durationMs}
                onChange={(e) => setDurationMs(Number(e.target.value))}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Rótulo</label>
              <Input
                placeholder="ex: Aguardar 5 minutos"
                value={durationLabel}
                onChange={(e) => setDurationLabel(e.target.value)}
              />
            </div>
          </>
        )}

        {/* ── Campos específicos de Finalizar ── */}
        {tipo === 'finalizar' && (
          <div>
            <label className="text-sm font-medium mb-1 block">Motivo do Encerramento</label>
            <Input
              placeholder="ex: Atendimento concluído"
              value={closeReason}
              onChange={(e) => setCloseReason(e.target.value)}
            />
          </div>
        )}

        {/* Ações do painel */}
        <div className="flex gap-2 pt-4 border-t">
          <Button className="flex-1" onClick={handleSave}>
            <Check className="w-4 h-4 mr-1" />Aplicar
          </Button>
          <Button
            variant="destructive"
            size="icon"
            onClick={() => onDelete(node.id)}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// ── Toolbar de novos nós ─────────────────────────────────
// ══════════════════════════════════════════════════════════

interface AddNodeToolbarProps {
  onAdd: (tipo: FluxoEtapaTipo) => void;
}

function AddNodeToolbar({ onAdd }: AddNodeToolbarProps) {
  const tipos: { tipo: FluxoEtapaTipo; icon: React.ReactNode; label: string }[] = [
    { tipo: 'mensagem', icon: <MessageSquare className="w-4 h-4" />, label: 'Mensagem' },
    { tipo: 'condicao', icon: <GitBranch className="w-4 h-4" />, label: 'Condição' },
    { tipo: 'acao', icon: <Settings className="w-4 h-4" />, label: 'Ação' },
    { tipo: 'espera', icon: <Clock className="w-4 h-4" />, label: 'Espera' },
    { tipo: 'finalizar', icon: <XCircle className="w-4 h-4" />, label: 'Finalizar' },
  ];

  return (
    <div className="flex gap-2 bg-card border rounded-xl p-2 shadow-lg">
      {tipos.map(({ tipo, icon, label }) => {
        const colors = nodeColors[tipo];
        return (
          <Button
            key={tipo}
            variant="outline"
            size="sm"
            className={`${colors.bg} ${colors.border} hover:scale-105 transition-transform`}
            onClick={() => onAdd(tipo)}
          >
            <span className={colors.icon}>{icon}</span>
            <span className="ml-1.5 text-xs">{label}</span>
          </Button>
        );
      })}
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// ── Componente principal do editor ───────────────────────
// ══════════════════════════════════════════════════════════

function FluxoEditorContent() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const nodeCounterRef = useRef(0);

  // ── Buscar fluxo com etapas ──
  const { data: fluxo, isLoading, error } = useQuery({
    queryKey: ['fluxo-editor', id],
    queryFn: () => fluxosChatbotService.getFluxoById(id!),
    enabled: !!id,
  });

  // ── Converter etapas → nós + edges do ReactFlow ──
  useEffect(() => {
    if (!fluxo) return;

    const etapas = fluxo.fluxos_chatbot_etapas || [];

    // Nó de gatilho (sempre existe)
    const triggerNode: Node = {
      id: 'trigger',
      type: 'trigger',
      position: { x: 300, y: 50 },
      data: {
        gatilho: fluxo.gatilho,
        palavra_chave: fluxo.palavra_chave,
        cron_expression: fluxo.cron_expression,
      },
      draggable: true,
      deletable: false,
    };

    // Converter etapas existentes em nós
    const etapaNodes: Node[] = etapas.map((etapa, idx) => {
      const cfg = parseConfig(etapa.config);
      const position = (cfg as { position?: NodePosition }).position || {
        x: 300,
        y: 200 + idx * 180,
      };

      return {
        id: etapa.id,
        type: etapa.tipo,
        position,
        data: {
          conteudo: etapa.conteudo,
          config: cfg,
          etapaId: etapa.id,
          ordem: etapa.ordem,
        },
      };
    });

    // Construir edges a partir dos campos proximo_sim / proximo_nao e config.connections
    const etapaEdges: Edge[] = [];
    etapas.forEach((etapa) => {
      const cfg = parseConfig(etapa.config);
      const connections = (cfg as { connections?: Array<{ targetId: string; label?: string; sourceHandle?: string }> }).connections;

      if (connections && connections.length > 0) {
        connections.forEach((conn, idx) => {
          etapaEdges.push({
            id: `e-${etapa.id}-${conn.targetId}-${idx}`,
            source: etapa.id,
            target: conn.targetId,
            sourceHandle: conn.sourceHandle || undefined,
            label: conn.label,
            type: 'smoothstep',
            animated: true,
            markerEnd: { type: MarkerType.ArrowClosed },
            style: { strokeWidth: 2 },
          });
        });
      } else {
        // Fallback: usar proximo_sim / proximo_nao
        if (etapa.proximo_sim) {
          etapaEdges.push({
            id: `e-${etapa.id}-sim`,
            source: etapa.id,
            target: etapa.proximo_sim,
            sourceHandle: etapa.tipo === 'condicao' ? 'sim' : undefined,
            label: etapa.tipo === 'condicao' ? 'Sim' : undefined,
            type: 'smoothstep',
            animated: true,
            markerEnd: { type: MarkerType.ArrowClosed },
            style: { strokeWidth: 2 },
          });
        }
        if (etapa.proximo_nao && etapa.tipo === 'condicao') {
          etapaEdges.push({
            id: `e-${etapa.id}-nao`,
            source: etapa.id,
            target: etapa.proximo_nao,
            sourceHandle: 'nao',
            label: 'Não',
            type: 'smoothstep',
            animated: true,
            markerEnd: { type: MarkerType.ArrowClosed },
            style: { strokeWidth: 2, stroke: '#ef4444' },
          });
        }
      }
    });

    // Edge do trigger para a primeira etapa (se existir e não houver conexão explícita)
    if (etapas.length > 0) {
      const firstEtapa = etapas.sort((a, b) => a.ordem - b.ordem)[0];
      const triggerCfg = parseConfig(firstEtapa.config);
      const hasTriggerConnection = (triggerCfg as { fromTrigger?: boolean }).fromTrigger;

      // Verificar se já existe edge do trigger
      const hasTriggerEdge = etapaEdges.some((e) => e.source === 'trigger');
      if (!hasTriggerEdge) {
        etapaEdges.push({
          id: `e-trigger-${firstEtapa.id}`,
          source: 'trigger',
          target: firstEtapa.id,
          type: 'smoothstep',
          animated: true,
          markerEnd: { type: MarkerType.ArrowClosed },
          style: { strokeWidth: 2 },
        });
      }
    }

    nodeCounterRef.current = etapas.length;
    setNodes([triggerNode, ...etapaNodes]);
    setEdges(etapaEdges);
    setHasChanges(false);
  }, [fluxo, setNodes, setEdges]);

  // ── Handlers ReactFlow ──
  const onConnect = useCallback(
    (params: Connection) => {
      const sourceNode = nodes.find((n) => n.id === params.source);
      const label = sourceNode?.type === 'condicao'
        ? (params.sourceHandle === 'nao' ? 'Não' : 'Sim')
        : undefined;

      const newEdge: Edge = {
        id: `e-${params.source}-${params.target}-${Date.now()}`,
        source: params.source,
        target: params.target,
        sourceHandle: params.sourceHandle,
        targetHandle: params.targetHandle,
        type: 'smoothstep',
        animated: true,
        label,
        markerEnd: { type: MarkerType.ArrowClosed },
        style: {
          strokeWidth: 2,
          ...(params.sourceHandle === 'nao' ? { stroke: '#ef4444' } : {}),
        },
      };

      setEdges((eds) => [...eds, newEdge]);
      setHasChanges(true);
    },
    [nodes, setEdges]
  );

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  const onNodeDragStop = useCallback(() => {
    setHasChanges(true);
  }, []);

  // ── Adicionar novo nó ──
  const handleAddNode = useCallback(
    (tipo: FluxoEtapaTipo) => {
      nodeCounterRef.current += 1;
      const newId = `new-${tipo}-${nodeCounterRef.current}-${Date.now()}`;
      const newNode: Node = {
        id: newId,
        type: tipo,
        position: {
          x: 250 + Math.random() * 100,
          y: 200 + nodes.length * 100 + Math.random() * 50,
        },
        data: {
          conteudo: '',
          config: { position: { x: 0, y: 0 } },
          etapaId: null,
          ordem: nodeCounterRef.current,
        },
      };

      setNodes((nds) => [...nds, newNode]);
      setSelectedNode(newNode);
      setHasChanges(true);
    },
    [nodes, setNodes]
  );

  // ── Atualizar dados de nó (do painel) ──
  const handleUpdateNode = useCallback(
    (nodeId: string, updates: Record<string, unknown>) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === nodeId ? { ...n, data: { ...n.data, ...updates } } : n
        )
      );
      // Atualizar selectedNode também
      setSelectedNode((prev) =>
        prev && prev.id === nodeId ? { ...prev, data: { ...prev.data, ...updates } } : prev
      );
      setHasChanges(true);
    },
    [setNodes]
  );

  // ── Deletar nó ──
  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      setNodes((nds) => nds.filter((n) => n.id !== nodeId));
      setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
      setSelectedNode(null);
      setHasChanges(true);
    },
    [setNodes, setEdges]
  );

  // ── Salvar tudo no Supabase ──
  const handleSave = useCallback(async () => {
    if (!fluxo || !id) return;

    setIsSaving(true);
    try {
      const etapaNodes = nodes.filter((n) => n.type !== 'trigger');
      const existingIds = (fluxo.fluxos_chatbot_etapas || []).map((e) => e.id);

      // Separar nós novos vs existentes
      const toCreate: FluxoChatbotEtapaInsert[] = [];
      const toUpdate: Array<{ id: string; data: Record<string, unknown> }> = [];

      // Mapear edges por source para construir connections
      const edgesBySource: Record<string, Array<{ targetId: string; label?: string; sourceHandle?: string }>> = {};
      edges.forEach((edge) => {
        if (edge.source === 'trigger') return; // Trigger edges derivam da ordem
        if (!edgesBySource[edge.source]) edgesBySource[edge.source] = [];
        edgesBySource[edge.source].push({
          targetId: edge.target,
          label: edge.label as string | undefined,
          sourceHandle: edge.sourceHandle || undefined,
        });
      });

      etapaNodes.forEach((node, index) => {
        const connections = edgesBySource[node.id] || [];
        const configData = {
          ...((node.data.config || {}) as Record<string, unknown>),
          position: { x: node.position.x, y: node.position.y },
          connections,
        };

        // Determinar proximo_sim e proximo_nao para compatibilidade
        let proximo_sim: string | null = null;
        let proximo_nao: string | null = null;

        if (node.type === 'condicao') {
          const simConn = connections.find((c) => c.sourceHandle === 'sim' || c.label === 'Sim');
          const naoConn = connections.find((c) => c.sourceHandle === 'nao' || c.label === 'Não');
          proximo_sim = simConn?.targetId || null;
          proximo_nao = naoConn?.targetId || null;
        } else if (connections.length > 0) {
          proximo_sim = connections[0].targetId;
        }

        const isExisting = existingIds.includes(node.id);

        if (isExisting) {
          toUpdate.push({
            id: node.id,
            data: {
              ordem: index,
              tipo: node.type as FluxoEtapaTipo,
              conteudo: String(node.data.conteudo || ''),
              config: configData as unknown as Json,
              proximo_sim,
              proximo_nao,
            },
          });
        } else {
          toCreate.push({
            fluxo_id: id,
            ordem: index,
            tipo: node.type as FluxoEtapaTipo,
            conteudo: String(node.data.conteudo || ''),
            config: configData as unknown as Json,
            proximo_sim,
            proximo_nao,
          });
        }
      });

      // Deletar nós removidos
      const currentNodeIds = new Set(etapaNodes.map((n) => n.id));
      const toDelete = existingIds.filter((eid) => !currentNodeIds.has(eid));

      // Executar operações
      const promises: Promise<unknown>[] = [];

      // Deletes
      toDelete.forEach((eid) => {
        promises.push(fluxosChatbotService.deletarEtapa(eid));
      });

      // Updates
      toUpdate.forEach(({ id: etapaId, data }) => {
        promises.push(fluxosChatbotService.atualizarEtapa(etapaId, data));
      });

      await Promise.all(promises);

      // Creates (depois dos deletes/updates para evitar conflitos de ordem)
      if (toCreate.length > 0) {
        await fluxosChatbotService.criarEtapasBatch(toCreate);
      }

      // Atualizar edge do trigger → primeira etapa
      const triggerEdge = edges.find((e) => e.source === 'trigger');
      if (triggerEdge) {
        // Salvar referência para o trigger no fluxo config se necessário
      }

      queryClient.invalidateQueries({ queryKey: ['fluxo-editor', id] });
      queryClient.invalidateQueries({ queryKey: ['fluxos-com-etapas'] });
      setHasChanges(false);
    } catch (err) {
      console.error('Erro ao salvar fluxo:', err);
      alert('Erro ao salvar. Tente novamente.');
    } finally {
      setIsSaving(false);
    }
  }, [fluxo, id, nodes, edges, queryClient]);

  // ── Loading / Error states ──
  // Loading is handled by the wrapper preload screen
  if (isLoading) return null;

  if (error || !fluxo) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-background text-center">
        <XCircle className="w-12 h-12 text-destructive mb-4" />
        <h2 className="text-xl font-semibold mb-2">Fluxo não encontrado</h2>
        <p className="text-muted-foreground mb-4">O fluxo solicitado não existe ou foi removido.</p>
        <Button onClick={() => navigate('/chat/fluxos')}>
          <ArrowLeft className="w-4 h-4 mr-2" />Voltar aos Fluxos
        </Button>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-card shrink-0">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/chat/fluxos')}>
            <ArrowLeft className="w-4 h-4 mr-1" />Voltar
          </Button>
          <div>
            <h1 className="text-lg font-semibold flex items-center gap-2">
              <GitBranch className="w-5 h-5 text-primary" />
              {fluxo.nome}
            </h1>
            <p className="text-xs text-muted-foreground">
              {fluxo.departamento} · {fluxo.fluxos_chatbot_etapas?.length || 0} etapas ·
              {hasChanges ? (
                <span className="text-yellow-600 ml-1">● Alterações não salvas</span>
              ) : (
                <span className="text-green-600 ml-1">✓ Salvo</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            {nodes.filter((n) => n.type !== 'trigger').length} nós · {edges.length} conexões
          </Badge>
          <Button
            onClick={handleSave}
            disabled={isSaving || !hasChanges}
            className="bg-primary hover:bg-primary/90"
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-1" />
            )}
            Salvar
          </Button>
        </div>
      </div>

      {/* Editor canvas + painel lateral */}
      <div className="flex-1 flex">
        <div className="flex-1 relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={(changes) => {
              onEdgesChange(changes);
              setHasChanges(true);
            }}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            onNodeDragStop={onNodeDragStop}
            nodeTypes={customNodeTypes}
            fitView
            fitViewOptions={{ padding: 0.3 }}
            defaultEdgeOptions={{
              type: 'smoothstep',
              animated: true,
              markerEnd: { type: MarkerType.ArrowClosed },
              style: { strokeWidth: 2 },
            }}
            deleteKeyCode={['Backspace', 'Delete']}
            snapToGrid
            snapGrid={[15, 15]}
          >
            <Background gap={15} size={1} />
            <Controls />
            <MiniMap
              nodeColor={(node) => {
                const colors: Record<string, string> = {
                  trigger: '#3b82f6',
                  mensagem: '#22c55e',
                  condicao: '#eab308',
                  acao: '#a855f7',
                  espera: '#f97316',
                  finalizar: '#ef4444',
                };
                return colors[node.type || ''] || '#94a3b8';
              }}
              maskColor="rgba(0,0,0,0.1)"
              className="!bg-card !border"
            />
            <Panel position="top-center">
              <AddNodeToolbar onAdd={handleAddNode} />
            </Panel>
          </ReactFlow>
        </div>

        {/* Painel lateral de edição */}
        {selectedNode && selectedNode.type !== 'trigger' && (
          <EditPanel
            node={selectedNode}
            onUpdate={handleUpdateNode}
            onDelete={handleDeleteNode}
            onClose={() => setSelectedNode(null)}
          />
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// ── Tela de preload com Lottie (5 segundos) ──────────────
// ══════════════════════════════════════════════════════════

function PreloadScreen({ onComplete }: { onComplete: () => void }) {
  const [progress, setProgress] = useState(0);
  const [messageIdx, setMessageIdx] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - start;
      const pct = Math.min((elapsed / PRELOAD_DURATION_MS) * 100, 100);
      setProgress(pct);

      // Trocar mensagem a cada ~1s
      const idx = Math.min(
        Math.floor(elapsed / (PRELOAD_DURATION_MS / loadingMessages.length)),
        loadingMessages.length - 1
      );
      setMessageIdx(idx);

      if (elapsed >= PRELOAD_DURATION_MS) {
        clearInterval(interval);
        onComplete();
      }
    }, 50);

    return () => clearInterval(interval);
  }, [onComplete]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background">
      {/* Lottie animation */}
      <div className="w-40 h-40 mb-6">
        <Lottie
          animationData={flowLoaderAnimation}
          loop
          autoplay
          style={{ width: '100%', height: '100%' }}
        />
      </div>

      {/* Title */}
      <h2 className="text-xl font-semibold text-foreground mb-2">Preparando Editor de Fluxos</h2>

      {/* Dynamic message */}
      <p className="text-sm text-muted-foreground mb-6 h-5 transition-all duration-300">
        {loadingMessages[messageIdx]}
      </p>

      {/* Progress bar */}
      <div className="w-72 h-2 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all duration-100 ease-linear"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Percentage */}
      <p className="text-xs text-muted-foreground mt-3">
        {Math.round(progress)}%
      </p>
    </div>
  );
}

// ── Wrapper com ReactFlowProvider + Preload ──
export default function FluxoEditorPage() {
  const [preloadDone, setPreloadDone] = useState(false);

  const handlePreloadComplete = useCallback(() => {
    setPreloadDone(true);
  }, []);

  return (
    <>
      {!preloadDone && <PreloadScreen onComplete={handlePreloadComplete} />}
      <div className={preloadDone ? '' : 'invisible h-0 overflow-hidden'}>
        <ReactFlowProvider>
          <FluxoEditorContent />
        </ReactFlowProvider>
      </div>
    </>
  );
}
