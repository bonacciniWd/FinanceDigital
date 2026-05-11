/**
 * @module videoIaService
 * @description Interface de geração de vídeo de cobrança por IA (Módulo 3 — futuro).
 *
 * Hoje retorna mock. Quando Sora (ou alternativa) estiver disponível, implementar
 * em uma Edge Function `generate-cobranca-video` que:
 *   1. Verifica `clientes.aceite_video_cobranca = true` (LGPD).
 *   2. Cria registro em `midia_assets` com status_ia='processando'.
 *   3. Chama a API de geração (Sora) — texto + foto base.
 *   4. No callback, faz upload da saída para Cloudinary e atualiza
 *      `midia_assets` (status_ia='pronto', secure_url, public_id).
 *   5. Atualiza `emprestimos.id_video_cobranca` e
 *      `emprestimos.status_processamento_ia='pronto'`.
 *
 * @see supabase/migrations/074_marketing_midia_e_lgpd.sql
 */

export interface GenerateCobrancaVideoInput {
  clienteId: string;
  emprestimoId: string;
  prompt: string;
  baseImageUrl?: string;
  voiceText?: string;
}

export interface VideoIaJob {
  jobId: string;
  status: 'pendente' | 'processando' | 'pronto' | 'erro';
  midiaAssetId?: string;
  message?: string;
}

/**
 * STUB — substituir por chamada à Edge Function quando Sora estiver liberado.
 */
export async function generateCobrancaVideo(
  _input: GenerateCobrancaVideoInput
): Promise<VideoIaJob> {
  return {
    jobId: `mock-${Date.now()}`,
    status: 'pendente',
    message:
      'Geração de vídeo IA ainda não habilitada. Aguardando liberação do Sora / alternativa.',
  };
}

export async function getJobStatus(jobId: string): Promise<VideoIaJob> {
  return { jobId, status: 'pendente', message: 'Pipeline IA não habilitado.' };
}
