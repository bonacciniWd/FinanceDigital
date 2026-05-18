/**
 * @module timelineInteracoesService
 * @description CRUD + Realtime para timeline unificada de interações.
 * Triggers no banco preenchem automaticamente eventos de WhatsApp,
 * mudanças de etapa no kanban, acordos e pagamentos. Apenas
 * `observacao`, `ligacao`, `visita` e `email` exigem insert manual.
 */
import { supabase } from '../lib/supabase';

export type TimelineTipo =
  | 'whatsapp'
  | 'ligacao'
  | 'visita'
  | 'email'
  | 'mudanca_etapa'
  | 'acordo_criado'
  | 'acordo_quebrado'
  | 'acordo_quitado'
  | 'pagamento'
  | 'observacao';

export interface TimelineItem {
  id: string;
  cliente_id: string;
  emprestimo_id: string | null;
  acordo_id: string | null;
  tipo: TimelineTipo;
  titulo: string;
  descricao: string | null;
  metadata: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
}

export async function listTimelineByCliente(clienteId: string, limit = 200): Promise<TimelineItem[]> {
  const { data, error } = await supabase
    .from('timeline_interacoes')
    .select('*')
    .eq('cliente_id', clienteId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as TimelineItem[];
}

export async function registrarInteracaoManual(input: {
  cliente_id: string;
  tipo: Extract<TimelineTipo, 'ligacao' | 'visita' | 'email' | 'observacao'>;
  titulo: string;
  descricao?: string;
  emprestimo_id?: string;
  acordo_id?: string;
  metadata?: Record<string, unknown>;
}): Promise<TimelineItem> {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('timeline_interacoes')
    .insert({
      cliente_id: input.cliente_id,
      tipo: input.tipo,
      titulo: input.titulo,
      descricao: input.descricao ?? null,
      emprestimo_id: input.emprestimo_id ?? null,
      acordo_id: input.acordo_id ?? null,
      metadata: input.metadata ?? {},
      created_by: user?.id ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as TimelineItem;
}

export async function deletarInteracao(id: string): Promise<void> {
  const { error } = await supabase.from('timeline_interacoes').delete().eq('id', id);
  if (error) throw error;
}

export function subscribeTimelineByCliente(clienteId: string, onChange: () => void): () => void {
  const channel = supabase
    .channel(`timeline-${clienteId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'timeline_interacoes', filter: `cliente_id=eq.${clienteId}` },
      () => onChange(),
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

/** Exporta timeline como texto markdown para copiar / baixar. */
export function exportarTimelineMarkdown(cliente: { nome: string; telefone: string }, itens: TimelineItem[]): string {
  const linhas: string[] = [];
  linhas.push(`# Histórico de Interações — ${cliente.nome}`);
  linhas.push(`Telefone: ${cliente.telefone}`);
  linhas.push(`Exportado em: ${new Date().toLocaleString('pt-BR')}`);
  linhas.push('');
  linhas.push(`Total de eventos: **${itens.length}**`);
  linhas.push('');
  for (const it of itens) {
    const data = new Date(it.created_at).toLocaleString('pt-BR');
    linhas.push(`## [${data}] ${it.tipo} — ${it.titulo}`);
    if (it.descricao) linhas.push(it.descricao);
    if (Object.keys(it.metadata ?? {}).length) {
      linhas.push('```json');
      linhas.push(JSON.stringify(it.metadata, null, 2));
      linhas.push('```');
    }
    linhas.push('');
  }
  return linhas.join('\n');
}
