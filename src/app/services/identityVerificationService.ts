/**
 * @module identityVerificationService
 * @description Serviço para verificação de identidade em análises de crédito.
 * Gerencia verificações, upload de documentos/vídeo e logs de auditoria.
 *
 * @see database.types para tipagem completa
 */
import { supabase } from '../lib/supabase';
import type {
  IdentityVerificationRow,
  IdentityVerificationInsert,
  IdentityVerificationUpdate,
  IdentityVerificationComAnalise,
  VerificationLogRow,
  VerificationLogInsert,
  VerificationStatus,
} from '../lib/database.types';

const VERIFICATION_SELECT_WITH_ANALISE = `
  *,
  analises_credito!identity_verifications_analise_id_fkey (
    cliente_nome,
    cpf,
    valor_solicitado,
    renda_mensal,
    score_serasa,
    status
  )
` as const;

// ── Queries ────────────────────────────────────────────────

/** Buscar verificação por ID (com dados da análise) */
export async function getVerificationById(
  id: string
): Promise<IdentityVerificationComAnalise | null> {
  const { data, error } = await supabase
    .from('identity_verifications')
    .select(VERIFICATION_SELECT_WITH_ANALISE)
    .eq('id', id)
    .single();

  if (error) throw new Error(error.message);
  return data as IdentityVerificationComAnalise | null;
}

/** Buscar verificações de uma análise específica */
export async function getVerificationsByAnalise(
  analiseId: string
): Promise<IdentityVerificationComAnalise[]> {
  const { data, error } = await supabase
    .from('identity_verifications')
    .select(VERIFICATION_SELECT_WITH_ANALISE)
    .eq('analise_id', analiseId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as IdentityVerificationComAnalise[];
}

/** Buscar verificações por status (fila do analista) */
export async function getVerificationsByStatus(
  status: VerificationStatus
): Promise<IdentityVerificationComAnalise[]> {
  const { data, error } = await supabase
    .from('identity_verifications')
    .select(VERIFICATION_SELECT_WITH_ANALISE)
    .eq('status', status)
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as IdentityVerificationComAnalise[];
}

/** Buscar todas as verificações pendentes ou que precisam de atenção */
export async function getPendingVerifications(): Promise<IdentityVerificationComAnalise[]> {
  const { data, error } = await supabase
    .from('identity_verifications')
    .select(VERIFICATION_SELECT_WITH_ANALISE)
    .in('status', ['pending'])
    .not('video_url', 'is', null)
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as IdentityVerificationComAnalise[];
}

// ── Mutations ──────────────────────────────────────────────

/** Criar nova verificação de identidade */
export async function createVerification(
  data: IdentityVerificationInsert
): Promise<IdentityVerificationRow> {
  const { data: result, error } = await supabase
    .from('identity_verifications')
    .insert(data)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return result;
}

/** Atualizar verificação (status, URLs, etc.) */
export async function updateVerification(
  id: string,
  updates: IdentityVerificationUpdate
): Promise<IdentityVerificationRow> {
  const { data, error } = await supabase
    .from('identity_verifications')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

// ── Logs de Auditoria ──────────────────────────────────────

/** Buscar logs de uma verificação */
export async function getVerificationLogs(
  verificationId: string
): Promise<VerificationLogRow[]> {
  const { data, error } = await supabase
    .from('verification_logs')
    .select('*')
    .eq('verification_id', verificationId)
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Registrar ação no log de auditoria */
export async function createVerificationLog(
  log: VerificationLogInsert
): Promise<VerificationLogRow> {
  const { data, error } = await supabase
    .from('verification_logs')
    .insert(log)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

// ── Storage ────────────────────────────────────────────────

/** Upload de arquivo para o bucket identity-verification */
export async function uploadVerificationFile(
  file: File | Blob,
  path: string
): Promise<string> {
  const { error } = await supabase.storage
    .from('identity-verification')
    .upload(path, file, {
      cacheControl: '3600',
      upsert: false,
    });

  if (error) throw new Error(error.message);

  const { data: urlData } = supabase.storage
    .from('identity-verification')
    .getPublicUrl(path);

  return urlData.publicUrl;
}

/** Gerar URL assinada temporária para visualização */
export async function getSignedUrl(
  path: string,
  expiresIn = 3600
): Promise<string> {
  const { data, error } = await supabase.storage
    .from('identity-verification')
    .createSignedUrl(path, expiresIn);

  if (error) throw new Error(error.message);
  return data.signedUrl;
}
