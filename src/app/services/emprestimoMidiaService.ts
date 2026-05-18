/**
 * @module emprestimoMidiaService
 * @description CRUD para a aba de Mídias/Links compartilhados (tabela `emprestimo_midias`).
 *
 * Use através dos hooks em `useEmprestimoMidias`. O upload de arquivos
 * vai para o bucket `emprestimo-midias` e a URL pública é gravada em
 * `storage_path`.
 */
import { supabase } from '../lib/supabase';

export type MidiaTipo = 'imagem' | 'video' | 'documento' | 'link' | 'observacao';

export interface EmprestimoMidia {
  id: string;
  tipo: MidiaTipo;
  titulo: string;
  descricao: string | null;
  storage_path: string | null;
  url_externa: string | null;
  mime_type: string | null;
  tamanho_bytes: number | null;
  emprestimo_ids: string[];
  cliente_ids: string[];
  tags: string[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

const BUCKET = 'emprestimo-midias';

export async function listMidias(filtros?: {
  emprestimoId?: string;
  clienteId?: string;
  tipo?: MidiaTipo;
  tag?: string;
}): Promise<EmprestimoMidia[]> {
  let q = supabase.from('emprestimo_midias').select('*').order('created_at', { ascending: false });
  if (filtros?.tipo) q = q.eq('tipo', filtros.tipo);
  if (filtros?.emprestimoId) q = q.contains('emprestimo_ids', [filtros.emprestimoId]);
  if (filtros?.clienteId) q = q.contains('cliente_ids', [filtros.clienteId]);
  if (filtros?.tag) q = q.contains('tags', [filtros.tag]);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as EmprestimoMidia[];
}

export function publicUrl(storagePath: string): string {
  return supabase.storage.from(BUCKET).getPublicUrl(storagePath).data.publicUrl;
}

export async function uploadArquivo(file: File): Promise<{ path: string; size: number; mime: string }> {
  const ext = file.name.split('.').pop() ?? 'bin';
  const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || 'application/octet-stream',
    cacheControl: '3600',
    upsert: false,
  });
  if (error) throw error;
  return { path, size: file.size, mime: file.type };
}

export async function criarMidia(input: {
  tipo: MidiaTipo;
  titulo: string;
  descricao?: string | null;
  storage_path?: string | null;
  url_externa?: string | null;
  mime_type?: string | null;
  tamanho_bytes?: number | null;
  emprestimo_ids?: string[];
  cliente_ids?: string[];
  tags?: string[];
}): Promise<EmprestimoMidia> {
  const { data: { user } } = await supabase.auth.getUser();
  const payload = {
    tipo: input.tipo,
    titulo: input.titulo,
    descricao: input.descricao ?? null,
    storage_path: input.storage_path ?? null,
    url_externa: input.url_externa ?? null,
    mime_type: input.mime_type ?? null,
    tamanho_bytes: input.tamanho_bytes ?? null,
    emprestimo_ids: input.emprestimo_ids ?? [],
    cliente_ids: input.cliente_ids ?? [],
    tags: input.tags ?? [],
    created_by: user?.id ?? null,
  };
  const { data, error } = await supabase.from('emprestimo_midias').insert(payload).select().single();
  if (error) throw error;
  return data as EmprestimoMidia;
}

export async function updateMidia(id: string, patch: Partial<EmprestimoMidia>): Promise<EmprestimoMidia> {
  const { data, error } = await supabase
    .from('emprestimo_midias')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as EmprestimoMidia;
}

export async function deletarMidia(id: string): Promise<void> {
  const { data: row } = await supabase
    .from('emprestimo_midias')
    .select('storage_path')
    .eq('id', id)
    .maybeSingle();
  const { error } = await supabase.from('emprestimo_midias').delete().eq('id', id);
  if (error) throw error;
  if (row?.storage_path) {
    await supabase.storage.from(BUCKET).remove([row.storage_path]).catch(() => {});
  }
}

/** Subscreve Realtime na tabela. Retorna função de unsubscribe. */
export function subscribeMidias(onChange: () => void): () => void {
  const channel = supabase
    .channel(`midias-${crypto.randomUUID()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'emprestimo_midias' }, () => onChange())
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
