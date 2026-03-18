/**
 * @module chatInternoService
 * @description Serviço para chat interno entre admin e funcionários via Supabase.
 * Suporta Realtime subscriptions para mensagens em tempo real.
 */
import { supabase } from '../lib/supabase';
import type { ChatInterno, ChatInternoInsert } from '../lib/database.types';

type ChatInternoRow = ChatInterno;
type ChatInternoIns = ChatInternoInsert;
type ChatInternoUpd = { lida?: boolean };

// ── Queries ────────────────────────────────────────────────

/** Listar usuários disponíveis para chat (profiles exceto o próprio) */
export async function getUsuariosChat(meuId: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, email, role, avatar_url')
    .neq('id', meuId)
    .order('name');

  if (error) throw new Error(error.message);
  return (data ?? []) as { id: string; name: string; email: string; role: string; avatar_url: string | null }[];
}

/** Buscar mensagens entre dois usuários, ordenadas cronologicamente */
export async function getMensagensEntreUsuarios(
  userId1: string,
  userId2: string
): Promise<ChatInterno[]> {
  const { data, error } = await supabase
    .from('chat_interno')
    .select('*')
    .or(
      `and(de_user_id.eq.${userId1},para_user_id.eq.${userId2}),and(de_user_id.eq.${userId2},para_user_id.eq.${userId1})`
    )
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as ChatInternoRow[];
}

/** Contar mensagens não lidas recebidas pelo usuário */
export async function getContagemNaoLidas(meuId: string): Promise<number> {
  const { count, error } = await supabase
    .from('chat_interno')
    .select('*', { count: 'exact', head: true })
    .eq('para_user_id', meuId)
    .eq('lida', false);

  if (error) throw new Error(error.message);
  return count ?? 0;
}

/** Contar não-lidas agrupadas por remetente */
export async function getNaoLidasPorRemetente(
  meuId: string
): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from('chat_interno')
    .select('de_user_id')
    .eq('para_user_id', meuId)
    .eq('lida', false);

  if (error) throw new Error(error.message);

  const counts: Record<string, number> = {};
  const rows = (data ?? []) as { de_user_id: string }[];
  rows.forEach((row) => {
    counts[row.de_user_id] = (counts[row.de_user_id] || 0) + 1;
  });
  return counts;
}

// ── Mutations ──────────────────────────────────────────────

/** Enviar mensagem interna */
export async function enviarMensagemInterna(
  msg: ChatInternoInsert
): Promise<ChatInterno> {
  const { data, error } = await supabase
    .from('chat_interno')
    .insert(msg as ChatInternoIns as any)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as ChatInternoRow;
}

/** Upload de áudio para Storage e envio como mensagem */
export async function enviarAudio(
  deUserId: string,
  paraUserId: string,
  audioBlob: Blob,
  duracaoSeg: number
): Promise<ChatInterno> {
  const filename = `${deUserId}/${Date.now()}.webm`;
  const { error: uploadErr } = await supabase.storage
    .from('chat-audio')
    .upload(filename, audioBlob, { contentType: 'audio/webm' });

  if (uploadErr) throw new Error(uploadErr.message);

  const { data: urlData } = supabase.storage
    .from('chat-audio')
    .getPublicUrl(filename);

  return enviarMensagemInterna({
    de_user_id: deUserId,
    para_user_id: paraUserId,
    conteudo: '🎙️ Áudio',
    tipo: 'audio',
    metadata: { audio_url: urlData.publicUrl, duracao_seg: duracaoSeg },
  });
}

/** Enviar card de atenção para cliente */
export async function enviarAtencaoCliente(
  deUserId: string,
  paraUserId: string,
  cliente: { id: string; nome: string; status: string; telefone: string }
): Promise<ChatInterno> {
  return enviarMensagemInterna({
    de_user_id: deUserId,
    para_user_id: paraUserId,
    conteudo: `⚠️ Atenção ao cliente: ${cliente.nome}`,
    tipo: 'atencao_cliente',
    metadata: {
      cliente_id: cliente.id,
      cliente_nome: cliente.nome,
      cliente_status: cliente.status,
      cliente_telefone: cliente.telefone,
    },
  });
}

/** Enviar card de atenção para empréstimo */
export async function enviarAtencaoEmprestimo(
  deUserId: string,
  paraUserId: string,
  emprestimo: {
    id: string;
    cliente_nome: string;
    valor_total: number;
    parcelas_pagas: number;
    total_parcelas: number;
    status: string;
  }
): Promise<ChatInterno> {
  return enviarMensagemInterna({
    de_user_id: deUserId,
    para_user_id: paraUserId,
    conteudo: `⚠️ Atenção ao empréstimo de ${emprestimo.cliente_nome}`,
    tipo: 'atencao_emprestimo',
    metadata: {
      emprestimo_id: emprestimo.id,
      cliente_nome: emprestimo.cliente_nome,
      valor_total: emprestimo.valor_total,
      parcelas_pagas: emprestimo.parcelas_pagas,
      total_parcelas: emprestimo.total_parcelas,
      status: emprestimo.status,
    },
  });
}

/** Marcar como lidas todas as mensagens de um remetente para mim */
export async function marcarLidas(
  meuId: string,
  deUserId: string
): Promise<void> {
  const { error } = await (supabase
    .from('chat_interno') as any)
    .update({ lida: true })
    .eq('para_user_id', meuId)
    .eq('de_user_id', deUserId)
    .eq('lida', false);

  if (error) throw new Error(error.message);
}

// ── Realtime ───────────────────────────────────────────────

/**
 * Subscribir para novas mensagens internas em tempo real.
 * Escuta INSERT na tabela chat_interno onde para_user_id = meuId.
 */
export function subscribeToChatInterno(
  meuId: string,
  onNewMessage: (msg: ChatInterno) => void
): () => void {
  const channel = supabase
    .channel(`chat_interno:${meuId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_interno',
        filter: `para_user_id=eq.${meuId}`,
      },
      (payload) => {
        onNewMessage(payload.new as ChatInterno);
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
