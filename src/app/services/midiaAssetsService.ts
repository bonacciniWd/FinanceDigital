/**
 * @module midiaAssetsService
 * @description CRUD da tabela `midia_assets` (catálogo de mídias do Cloudinary).
 *
 * RLS:
 *   - SELECT: qualquer authenticated.
 *   - INSERT/UPDATE/DELETE: admin/gerencia.
 */
import { supabase } from '../lib/supabase';

export type MidiaTipo = 'promocional' | 'lembrete_cobranca' | 'status_template';
export type MidiaFormato = 'image' | 'video';
export type MidiaStatusIA = 'pendente' | 'processando' | 'pronto' | 'erro';

export interface MidiaAsset {
  id: string;
  tipo: MidiaTipo;
  formato: MidiaFormato;
  public_id: string;
  secure_url: string;
  thumb_url: string | null;
  duration_s: number | null;
  width: number | null;
  height: number | null;
  bytes: number | null;
  titulo: string;
  descricao: string | null;
  caption: string | null;
  ativo: boolean;
  status_ia: MidiaStatusIA;
  prompt_ia: string | null;
  erro_ia: string | null;
  cliente_id: string | null;
  emprestimo_id: string | null;
  consentimento_lgpd_em: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
}

export interface CreateMidiaAssetInput {
  tipo: MidiaTipo;
  formato: MidiaFormato;
  public_id: string;
  secure_url: string;
  thumb_url?: string | null;
  duration_s?: number | null;
  width?: number | null;
  height?: number | null;
  bytes?: number | null;
  titulo: string;
  descricao?: string | null;
  caption?: string | null;
  prompt_ia?: string | null;
  cliente_id?: string | null;
  emprestimo_id?: string | null;
}

export async function listMidiaAssets(filtro?: { tipo?: MidiaTipo; ativo?: boolean }) {
  let q = supabase.from('midia_assets').select('*').order('created_at', { ascending: false });
  if (filtro?.tipo) q = q.eq('tipo', filtro.tipo);
  if (filtro?.ativo !== undefined) q = q.eq('ativo', filtro.ativo);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as MidiaAsset[];
}

export async function createMidiaAsset(input: CreateMidiaAssetInput): Promise<MidiaAsset> {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('midia_assets')
    .insert({ ...input, created_by: user?.id ?? null })
    .select('*')
    .single();
  if (error) throw error;
  return data as MidiaAsset;
}

export async function updateMidiaAsset(id: string, patch: Partial<MidiaAsset>): Promise<MidiaAsset> {
  const { data, error } = await supabase
    .from('midia_assets')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data as MidiaAsset;
}

export async function deleteMidiaAsset(id: string): Promise<void> {
  const { error } = await supabase.from('midia_assets').delete().eq('id', id);
  if (error) throw error;
}
