-- ============================================================
-- 011: Chat Interno — suporte a áudio e cards de atenção
-- ============================================================

-- Adicionar colunas tipo e metadata à tabela chat_interno
ALTER TABLE chat_interno
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'texto',
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}';

-- tipo: 'texto' | 'audio' | 'atencao_cliente' | 'atencao_emprestimo'
-- metadata:
--   audio    → { audio_url: string, duracao_seg: number }
--   cliente  → { cliente_id, cliente_nome, cliente_status, cliente_telefone }
--   emprest. → { emprestimo_id, cliente_nome, valor_total, parcelas_pagas, total_parcelas, status }

COMMENT ON COLUMN chat_interno.tipo IS 'texto | audio | atencao_cliente | atencao_emprestimo';
COMMENT ON COLUMN chat_interno.metadata IS 'JSON com dados extras: audio_url, cliente_id, emprestimo_id, etc.';

-- Storage bucket para áudios do chat interno
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-audio', 'chat-audio', true)
ON CONFLICT (id) DO NOTHING;

-- RLS para o bucket chat-audio
CREATE POLICY "Authenticated can upload chat audio"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'chat-audio');

CREATE POLICY "Authenticated can update chat audio"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'chat-audio');

CREATE POLICY "Public read chat audio"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'chat-audio');
