/**
 * @module statusScheduleService
 * @description CRUD de `status_schedule` — agenda semanal de posts em status WhatsApp.
 *
 * Cada slot define `dia_semana` (0=Dom .. 6=Sáb), `hora`, `minuto`, vínculo
 * com uma `midia_asset` e uma `whatsapp_instancia`.
 *
 * O cron (`cron-post-status`) varre a cada 15 min e publica os slots elegíveis.
 */
import { supabase } from '../lib/supabase';

export interface StatusScheduleSlot {
  id: string;
  midia_asset_id: string | null;
  instancia_id: string;
  dia_semana: number;
  hora: number;
  minuto: number;
  ativo: boolean;
  auto_generate: boolean;
  prompt_ia: string | null;
  provedor_ia: 'gemini' | 'sora' | 'manual';
  regenerar_a_cada_post: boolean;
  caption_override: string | null;
  ultimo_post_em: string | null;
  ultimo_post_status: 'sucesso' | 'erro' | null;
  ultimo_post_erro: string | null;
  total_posts: number;
  observacao: string | null;
  created_at: string;
  midia?: {
    id: string;
    titulo: string;
    formato: 'image' | 'video';
    secure_url: string;
    thumb_url: string | null;
  } | null;
  instancia?: {
    id: string;
    instance_name: string;
    status: string;
  };
}

export interface CreateStatusScheduleInput {
  midia_asset_id?: string | null;
  instancia_id: string;
  dia_semana: number;
  hora: number;
  minuto: number;
  ativo?: boolean;
  auto_generate?: boolean;
  prompt_ia?: string | null;
  provedor_ia?: 'gemini' | 'sora' | 'manual';
  regenerar_a_cada_post?: boolean;
  caption_override?: string | null;
  observacao?: string | null;
}

export async function listSchedule() {
  const { data, error } = await supabase
    .from('status_schedule')
    .select(`
      *,
      midia:midia_assets!midia_asset_id(id, titulo, formato, secure_url, thumb_url),
      instancia:whatsapp_instancias(id, instance_name, status)
    `)
    .order('dia_semana', { ascending: true })
    .order('hora', { ascending: true })
    .order('minuto', { ascending: true });
  if (error) throw error;
  return (data ?? []) as StatusScheduleSlot[];
}

export async function createSlot(input: CreateStatusScheduleInput): Promise<StatusScheduleSlot> {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('status_schedule')
    .insert({ ...input, created_by: user?.id ?? null })
    .select('*')
    .single();
  if (error) throw error;
  return data as StatusScheduleSlot;
}

export async function updateSlot(id: string, patch: Partial<StatusScheduleSlot>): Promise<void> {
  const { error } = await supabase.from('status_schedule').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deleteSlot(id: string): Promise<void> {
  const { error } = await supabase.from('status_schedule').delete().eq('id', id);
  if (error) throw error;
}

export async function listLog(limit = 50) {
  const { data, error } = await supabase
    .from('status_post_log')
    .select('*')
    .order('posted_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}
