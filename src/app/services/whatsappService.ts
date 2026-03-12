/**
 * @module whatsappService
 * @description Serviço para WhatsApp — instâncias, envio de mensagens e log.
 *
 * Comunica com as Edge Functions:
 *   - manage-instance  → CRUD de instâncias
 *   - send-whatsapp    → Envio de mensagens
 *
 * Queries diretas ao Supabase:
 *   - whatsapp_instancias  → listagem / status
 *   - whatsapp_mensagens_log → histórico de mensagens
 *
 * @see database.types para tipagem completa
 */
import { supabase } from '../lib/supabase';
import type {
  WhatsappInstancia,
  WhatsappInstanciaInsert,
  WhatsappMensagemLog,
} from '../lib/database.types';

/**
 * Invoca a Edge Function manage-instance.
 * O SDK Supabase envia automaticamente o JWT da sessão ativa no header Authorization.
 * Extrai a mensagem de erro real do body da resposta em caso de falha.
 */
async function invokeManageInstance(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('manage-instance', { body });
  if (error) {
    let msg = error.message || 'Erro na Edge Function';
    try {
      // FunctionsHttpError.context pode ser um plain object (json já parseado)
      // ou uma Response dependendo da versão do SDK
      const ctx = (error as { context?: unknown }).context;
      if (ctx && typeof ctx === 'object') {
        const json = typeof (ctx as Response).json === 'function'
          ? await (ctx as Response).clone().json()
          : ctx as Record<string, unknown>;
        if (typeof json.error === 'string') {
          msg = json.error;
          // Incluir details se disponível
          if (json.details) {
            const detailStr = typeof json.details === 'string'
              ? json.details
              : JSON.stringify(json.details);
            msg += ` | ${detailStr}`;
          }
        }
      }
    } catch { /* ignora erros de parse */ }
    throw new Error(msg);
  }
  if (data?.error) {
    let msg = data.error;
    if (data.details) {
      const detailStr = typeof data.details === 'string'
        ? data.details
        : JSON.stringify(data.details);
      msg += ` | ${detailStr}`;
    }
    throw new Error(msg);
  }
  return data;
}

// ══════════════════════════════════════════════════════════
// ── Instâncias ────────────────────────────────────────────
// ══════════════════════════════════════════════════════════

/** Listar todas as instâncias WhatsApp */
export async function getInstancias(): Promise<WhatsappInstancia[]> {
  const { data, error } = await supabase
    .from('whatsapp_instancias')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Buscar instância por ID */
export async function getInstanciaById(id: string): Promise<WhatsappInstancia> {
  const { data, error } = await supabase
    .from('whatsapp_instancias')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/** Criar instância via Edge Function (manage-instance → create) */
export async function criarInstancia(params: {
  instance_name: string;
  evolution_url?: string;
  evolution_global_apikey?: string;
  departamento?: string;
  phone_number?: string;
}): Promise<{ instancia: WhatsappInstancia; qr_code: string | null }> {
  return invokeManageInstance({ action: 'create', ...params });
}

/** Conectar instância (gerar QR Code) */
export async function conectarInstancia(instanciaId: string): Promise<{
  qr_code: string | null;
  status: string;
}> {
  return invokeManageInstance({ action: 'connect', instancia_id: instanciaId });
}

/** Desconectar instância */
export async function desconectarInstancia(instanciaId: string): Promise<void> {
  await invokeManageInstance({ action: 'disconnect', instancia_id: instanciaId });
}

/** Verificar status da instância */
export async function statusInstancia(instanciaId: string): Promise<{
  status: string;
  evolution_state: string;
  phone_number: string | null;
}> {
  return invokeManageInstance({ action: 'status', instancia_id: instanciaId });
}

/** Deletar instância */
export async function deletarInstancia(instanciaId: string): Promise<void> {
  await invokeManageInstance({ action: 'delete', instancia_id: instanciaId });
}

/** Reiniciar instância */
export async function reiniciarInstancia(instanciaId: string): Promise<void> {
  await invokeManageInstance({ action: 'restart', instancia_id: instanciaId });
}

/** Configurar webhook na instância */
export async function configurarWebhook(instanciaId: string): Promise<{
  webhook_url: string;
}> {
  return invokeManageInstance({ action: 'set_webhook', instancia_id: instanciaId });
}

/**
 * Sincroniza TODAS as instâncias do servidor Evolution (Fly.io) com o banco.
 * Para cada instância encontrada: upserta no banco e configura webhook automaticamente.
 * Ideal ao trocar de URL (ngrok → Fly.io) ou após restart do servidor.
 */
export interface SyncAllResult {
  success: boolean;
  total: number;
  synced: number;
  webhook_url: string;
  evolution_url: string;
  results: Array<{
    instance_name: string;
    success: boolean;
    status?: string;
    webhook_configured?: boolean;
    instancia_id?: string;
    error?: string;
  }>;
}

export async function syncAll(): Promise<SyncAllResult> {
  return invokeManageInstance({ action: 'sync_all' });
}

// ══════════════════════════════════════════════════════════
// ── Envio de mensagens ────────────────────────────────────
// ══════════════════════════════════════════════════════════

export interface EnviarMensagemParams {
  instancia_id: string;
  telefone: string;
  conteudo: string;
  tipo?: 'text' | 'image' | 'document' | 'audio';
  media_url?: string;
  media_base64?: string;  // base64 pré-computado no browser (evita fetch no edge function)
  audio_seconds?: number;
  cliente_id?: string;
  fluxo_id?: string;
}

/** Enviar mensagem via Edge Function send-whatsapp */
export async function enviarMensagem(params: EnviarMensagemParams): Promise<{
  message_id: string;
  message_id_wpp: string | null;
}> {
  const { data, error } = await supabase.functions.invoke('send-whatsapp', {
    body: params,
  });

  if (error) {
    // Detectar erro de CORS/502: acontece quando o gateway do Supabase mata a função
    // antes de retornar (Evolution API offline, ngrok desconectado ou URL desatualizada).
    const rawMsg = error.message || '';
    if (
      rawMsg.includes('Failed to send a request') ||
      rawMsg.includes('Failed to fetch') ||
      rawMsg.includes('NetworkError') ||
      rawMsg === '' ||
      rawMsg === 'undefined'
    ) {
      throw new Error(
        'Não foi possível conectar à Evolution API (erro 502). ' +
        'Verifique se o ngrok está ativo e se a URL da instância está atualizada nas configurações.'
      );
    }

    // Tentar extrair detalhes do erro do contexto da resposta
    let msg = rawMsg;
    try {
      const ctx = (error as { context?: unknown }).context;
      if (ctx && typeof ctx === 'object') {
        const json = typeof (ctx as Response).json === 'function'
          ? await (ctx as Response).clone().json()
          : ctx as Record<string, unknown>;
        if (typeof json.error === 'string') msg = json.error;
        if (json.details) {
          const d = json.details as Record<string, unknown>;
          const msgs = (d?.response as Record<string, unknown>)?.message;
          if (Array.isArray(msgs) && msgs[0]) {
            const first = msgs[0];
            if (first?.exists === false) msg = `Número ${first.number} não encontrado no WhatsApp`;
            else if (Array.isArray(first)) msg = first.join(', ');
          }
        }
      }
    } catch { /* ignora */ }
    throw new Error(msg);
  }

  if (data?.success === false) {
    // Error retornado com status 200 (para não engolir detalhes)
    // Se é @lid, usar a mensagem clara do backend diretamente
    if (data.is_lid) {
      throw new Error(data.error || 'Contato com ID interno do WhatsApp. Responda pelo celular.');
    }
    let msg = data.error || 'Falha ao enviar mensagem';
    const d = data.details as Record<string, unknown> | undefined;
    const msgs = (d?.response as Record<string, unknown> | undefined)?.message;
    if (Array.isArray(msgs) && msgs[0]) {
      const first = msgs[0];
      if (!Array.isArray(first) && first?.exists === false) {
        const numDisplay = String(first.number || '').replace(/@.*$/, '');
        msg = `Número ${numDisplay} não encontrado no WhatsApp`;
      } else if (Array.isArray(first)) {
        msg = first.join(', ');
      }
    }
    throw new Error(msg);
  }

  if (data?.error) throw new Error(data.error);
  return data;
}

// ══════════════════════════════════════════════════════════
// ── Log de mensagens (queries diretas) ────────────────────
// ══════════════════════════════════════════════════════════

/** Buscar mensagens por telefone (conversa completa) */
export async function getMensagensByTelefone(
  telefone: string,
  limit = 100
): Promise<WhatsappMensagemLog[]> {
  const { data, error } = await supabase
    .from('whatsapp_mensagens_log')
    .select('*')
    .eq('telefone', telefone)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Buscar mensagens por instância */
export async function getMensagensByInstancia(
  instanciaId: string,
  limit = 200
): Promise<WhatsappMensagemLog[]> {
  const { data, error } = await supabase
    .from('whatsapp_mensagens_log')
    .select('*')
    .eq('instancia_id', instanciaId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Listar conversas (últimas mensagens agrupadas por telefone) */
export async function getConversas(instanciaId?: string): Promise<
  {
    telefone: string;
    jid: string;           // JID completo para envio (ex: 62771@lid ou 5511@s.whatsapp.net)
    push_name: string | null;
    ultima_msg: string;
    direcao: string;
    created_at: string;
    total: number;
  }[]
> {
  // Buscar mensagens recentes e agrupar no client-side
  let query = supabase
    .from('whatsapp_mensagens_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500);

  if (instanciaId) {
    query = query.eq('instancia_id', instanciaId);
  }

  const { data: rawData, error } = await query;
  if (error) throw new Error(error.message);
  const data = (rawData ?? []) as WhatsappMensagemLog[];
  const grouped = new Map<string, {
    telefone: string;
    jid: string;
    push_name: string | null;
    ultima_msg: string;
    direcao: string;
    created_at: string;
    total: number;
  }>();

  for (const msg of data ?? []) {
    const meta = (msg.metadata ?? {}) as Record<string, unknown>;
    const pushName = typeof meta.push_name === 'string' ? meta.push_name : null;

    // Resolver o melhor JID disponível para envio:
    // 1. Se metadata.jid existe e NÃO é @lid → usa esse (JID real)
    // 2. Se is_lid_only ou jid é @lid → manter @lid (bloqueia envio no frontend)
    // 3. Fallback: construir do telefone
    let jid: string;
    const rawJid = typeof meta.jid === 'string' ? meta.jid : '';
    if (rawJid && !rawJid.endsWith('@lid')) {
      // JID real disponível (resolvido pelo webhook)
      jid = rawJid;
    } else if (rawJid.endsWith('@lid')) {
      // LID sem número real — manter @lid para bloquear envio
      jid = rawJid;
    } else {
      // Sem metadata — construir do telefone
      jid = `${msg.telefone}@s.whatsapp.net`;
    }

    const key = msg.telefone;
    if (!grouped.has(key)) {
      grouped.set(key, {
        telefone: msg.telefone,
        jid,
        push_name: pushName,
        ultima_msg: msg.conteudo || '',
        direcao: msg.direcao,
        created_at: msg.created_at,
        total: 1,
      });
    } else {
      const entry = grouped.get(key)!;
      entry.total++;
      if (!entry.push_name && pushName) entry.push_name = pushName;
      // Promover para JID melhor: trocar @lid por @s.whatsapp.net se aparecer
      if (entry.jid.endsWith('@lid') && !jid.endsWith('@lid')) entry.jid = jid;
      else if (msg.direcao === 'entrada' && !jid.endsWith('@lid')) entry.jid = jid;
    }
  }

  return Array.from(grouped.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

/** Buscar total de mensagens enviadas/recebidas */
export async function getEstatisticas(instanciaId?: string): Promise<{
  total_enviadas: number;
  total_recebidas: number;
  total_falhas: number;
}> {
  let baseQuery = supabase.from('whatsapp_mensagens_log').select('direcao, status');
  if (instanciaId) {
    baseQuery = baseQuery.eq('instancia_id', instanciaId);
  }

  const { data: rawMsgs, error } = await baseQuery;
  if (error) throw new Error(error.message);
  const msgs = (rawMsgs ?? []) as Pick<WhatsappMensagemLog, 'direcao' | 'status'>[];
  return {
    total_enviadas: msgs.filter((m) => m.direcao === 'saida').length,
    total_recebidas: msgs.filter((m) => m.direcao === 'entrada').length,
    total_falhas: msgs.filter((m) => m.status === 'erro').length,
  };
}

// ══════════════════════════════════════════════════════════
// ── Realtime ──────────────────────────────────────────────
// ══════════════════════════════════════════════════════════

let msgChannelCounter = 0;

/**
 * Subscrever a novas mensagens em tempo real.
 * Cada chamada cria um canal com nome único para evitar conflitos
 * quando múltiplos hooks (mensagens + conversas) assinam ao mesmo tempo.
 */
export function subscribeToMensagens(
  callback: (msg: WhatsappMensagemLog) => void
): () => void {
  const channelName = `wpp-msgs-rt-${++msgChannelCounter}-${Date.now()}`;

  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'whatsapp_mensagens_log',
      },
      (payload) => {
        console.log('[realtime] Nova mensagem recebida:', payload.new);
        callback(payload.new as WhatsappMensagemLog);
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'whatsapp_mensagens_log',
      },
      (payload) => {
        console.log('[realtime] Mensagem atualizada:', payload.new);
        callback(payload.new as WhatsappMensagemLog);
      }
    )
    .subscribe((status) => {
      console.log(`[realtime] Canal ${channelName}: ${status}`);
    });

  return () => {
    supabase.removeChannel(channel);
  };
}

/** Subscrever a mudanças de status de instâncias */
export function subscribeToInstancias(
  callback: (instancia: WhatsappInstancia) => void
): () => void {
  const channelName = `wpp-inst-rt-${Date.now()}`;

  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'whatsapp_instancias',
      },
      (payload) => {
        console.log('[realtime] Instância atualizada:', payload.new);
        callback(payload.new as WhatsappInstancia);
      }
    )
    .subscribe((status) => {
      console.log(`[realtime] Canal ${channelName}: ${status}`);
    });

  return () => {
    supabase.removeChannel(channel);
  };
}
