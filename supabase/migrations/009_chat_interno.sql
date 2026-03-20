-- ============================================================
-- 009: Chat Interno (admin ↔ funcionários)
-- ============================================================

-- Tabela de mensagens internas entre usuários do sistema
CREATE TABLE IF NOT EXISTS chat_interno (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  de_user_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  para_user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  conteudo    text NOT NULL,
  lida        boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Índices para consultas rápidas
CREATE INDEX IF NOT EXISTS idx_chat_interno_de     ON chat_interno(de_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_interno_para   ON chat_interno(para_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_interno_conversa ON chat_interno(de_user_id, para_user_id, created_at DESC);

-- RLS
ALTER TABLE chat_interno ENABLE ROW LEVEL SECURITY;

-- Usuário pode ver mensagens que enviou ou recebeu
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'chat_interno_select' AND tablename = 'chat_interno') THEN
    CREATE POLICY chat_interno_select ON chat_interno
      FOR SELECT USING (
        auth.uid() = de_user_id OR auth.uid() = para_user_id
      );
  END IF;
END $$;

-- Qualquer usuário logado pode enviar mensagem
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'chat_interno_insert' AND tablename = 'chat_interno') THEN
    CREATE POLICY chat_interno_insert ON chat_interno
      FOR INSERT WITH CHECK (
        auth.uid() = de_user_id
      );
  END IF;
END $$;

-- Destinatário pode marcar como lida
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'chat_interno_update' AND tablename = 'chat_interno') THEN
    CREATE POLICY chat_interno_update ON chat_interno
      FOR UPDATE USING (
        auth.uid() = para_user_id
      ) WITH CHECK (
        auth.uid() = para_user_id
      );
  END IF;
END $$;

-- Publicar no Realtime (ignorar se já existir)
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE chat_interno;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
