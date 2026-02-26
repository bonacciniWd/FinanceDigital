/**
 * @module mensagensService
 * @description Serviço para mensagens de chat via Supabase.
 *
 * Suporta Realtime subscriptions para atualizações em tempo real.
 *
 * @see database.types para tipagem completa
 */
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { mockMensagens } from '../lib/mockData';
import type { Mensagem, MensagemInsert } from '../lib/database.types';

// ── Adaptador mock → DB types ──────────────────────────────

function adaptMockMensagem(mock: (typeof mockMensagens)[0]): Mensagem {
  return {
    id: mock.id,
    cliente_id: mock.clienteId,
    remetente: mock.remetente,
    conteudo: mock.conteudo,
    timestamp: mock.timestamp,
    lida: mock.lida,
    tipo: mock.tipo,
    created_at: mock.timestamp,
  };
}

// ── Queries ────────────────────────────────────────────────

/** Buscar mensagens de um cliente, ordenadas por timestamp */
export async function getMensagensByCliente(clienteId: string): Promise<Mensagem[]> {
  if (!isSupabaseConfigured()) {
    return mockMensagens
      .filter((m) => m.clienteId === clienteId)
      .map(adaptMockMensagem);
  }

  const { data, error } = await supabase
    .from('mensagens')
    .select('*')
    .eq('cliente_id', clienteId)
    .order('timestamp', { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Buscar todas as mensagens não lidas (para badge no sidebar) */
export async function getMensagensNaoLidas(): Promise<number> {
  if (!isSupabaseConfigured()) {
    return mockMensagens.filter((m) => !m.lida).length;
  }

  const { count, error } = await supabase
    .from('mensagens')
    .select('*', { count: 'exact', head: true })
    .eq('lida', false);

  if (error) throw new Error(error.message);
  return count ?? 0;
}

/** Buscar últimas mensagens por cliente (para lista de conversas) */
export async function getUltimasMensagens(): Promise<Mensagem[]> {
  if (!isSupabaseConfigured()) {
    // Agrupar por clienteId e pegar a última
    const ultimasPorCliente = new Map<string, Mensagem>();
    mockMensagens.forEach((m) => {
      const adapted = adaptMockMensagem(m);
      const existing = ultimasPorCliente.get(m.clienteId);
      if (!existing || new Date(adapted.timestamp) > new Date(existing.timestamp)) {
        ultimasPorCliente.set(m.clienteId, adapted);
      }
    });
    return Array.from(ultimasPorCliente.values());
  }

  // Supabase: usar distinct on (precisa de raw query ou view)
  const { data, error } = await supabase
    .from('mensagens')
    .select('*')
    .order('timestamp', { ascending: false });

  if (error) throw new Error(error.message);

  // Agrupar client-side
  const ultimasPorCliente = new Map<string, Mensagem>();
  (data ?? []).forEach((m) => {
    if (!ultimasPorCliente.has(m.cliente_id)) {
      ultimasPorCliente.set(m.cliente_id, m);
    }
  });

  return Array.from(ultimasPorCliente.values());
}

// ── Mutations ──────────────────────────────────────────────

/** Enviar nova mensagem */
export async function enviarMensagem(mensagem: MensagemInsert): Promise<Mensagem> {
  if (!isSupabaseConfigured()) {
    // Mock: retornar mensagem fake
    return {
      id: crypto.randomUUID(),
      cliente_id: mensagem.cliente_id,
      remetente: mensagem.remetente,
      conteudo: mensagem.conteudo,
      timestamp: new Date().toISOString(),
      lida: false,
      tipo: mensagem.tipo ?? 'texto',
      created_at: new Date().toISOString(),
    };
  }

  const { data, error } = await supabase
    .from('mensagens')
    .insert(mensagem)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/** Marcar mensagens como lidas */
export async function marcarComoLida(clienteId: string): Promise<void> {
  if (!isSupabaseConfigured()) return;

  const { error } = await supabase
    .from('mensagens')
    .update({ lida: true })
    .eq('cliente_id', clienteId)
    .eq('lida', false);

  if (error) throw new Error(error.message);
}

// ── Realtime ───────────────────────────────────────────────

/**
 * Subscribir para novas mensagens em tempo real (Supabase Realtime).
 * Retorna função de cleanup para unsubscribe.
 */
export function subscribeToMensagens(
  clienteId: string,
  onNewMessage: (mensagem: Mensagem) => void
): () => void {
  if (!isSupabaseConfigured()) {
    // Noop para mock
    return () => {};
  }

  const channel = supabase
    .channel(`mensagens:${clienteId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'mensagens',
        filter: `cliente_id=eq.${clienteId}`,
      },
      (payload) => {
        onNewMessage(payload.new as Mensagem);
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
