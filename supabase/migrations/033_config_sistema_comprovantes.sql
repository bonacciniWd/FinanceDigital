-- 033: Configurações do sistema + comprovantes de pagamento
-- Adiciona tabela de configurações globais e campos para comprovantes nas parcelas.

-- ══════════════════════════════════════════════════════════════
-- 1. Tabela de configurações do sistema
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS configuracoes_sistema (
  chave TEXT PRIMARY KEY,
  valor JSONB NOT NULL DEFAULT 'true'::jsonb,
  descricao TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

ALTER TABLE configuracoes_sistema ENABLE ROW LEVEL SECURITY;

-- Apenas admin e gerencia podem ver/editar
CREATE POLICY "config_select_auth" ON configuracoes_sistema
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "config_update_admin" ON configuracoes_sistema
  FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'gerencia')
    )
  );

CREATE POLICY "config_insert_admin" ON configuracoes_sistema
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'gerencia')
    )
  );

-- Seed: valores padrão
INSERT INTO configuracoes_sistema (chave, valor, descricao) VALUES
  ('mensagens_automaticas_ativas', 'true'::jsonb, 'Ativa/desativa envio automático de mensagens WhatsApp pelo cron de notificações'),
  ('cobv_auto_ativa', 'true'::jsonb, 'Ativa/desativa criação automática de cobranças PIX com vencimento pelo cron'),
  ('multa_percentual', '2'::jsonb, 'Percentual de multa para cobranças com vencimento (cobv)'),
  ('juros_percentual', '1'::jsonb, 'Percentual de juros ao mês para cobranças com vencimento (cobv)')
ON CONFLICT (chave) DO NOTHING;

-- ══════════════════════════════════════════════════════════════
-- 2. Campos extras na tabela parcelas para comprovantes
-- ══════════════════════════════════════════════════════════════
ALTER TABLE parcelas
  ADD COLUMN IF NOT EXISTS comprovante_url TEXT,
  ADD COLUMN IF NOT EXISTS pagamento_tipo TEXT DEFAULT 'pix'
    CHECK (pagamento_tipo IN ('pix', 'manual', 'automatico')),
  ADD COLUMN IF NOT EXISTS confirmado_por UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS confirmado_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS woovi_charge_id TEXT;

-- Índice para buscar parcelas com cobrança vinculada
CREATE INDEX IF NOT EXISTS idx_parcelas_woovi_charge ON parcelas(woovi_charge_id) WHERE woovi_charge_id IS NOT NULL;

-- ══════════════════════════════════════════════════════════════
-- 3. Storage bucket para comprovantes de pagamento
-- ══════════════════════════════════════════════════════════════
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'comprovantes',
  'comprovantes',
  false,
  5242880, -- 5MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Policies para o bucket comprovantes
CREATE POLICY "comprovantes_insert_auth" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'comprovantes');

CREATE POLICY "comprovantes_select_auth" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'comprovantes');

CREATE POLICY "comprovantes_delete_admin" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'comprovantes'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'gerencia')
    )
  );
