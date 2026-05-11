-- 075: Geração de mídia via IA (Gemini) para Marketing
--
-- Adiciona suporte a:
--   1. status_schedule pode ter prompt_ia + auto_generate (sem midia_asset fixa)
--      → o cron, quando dispara, chama Gemini, gera imagem, faz upload no
--        Cloudinary e cria/atualiza midia_assets antes de postar.
--   2. midia_assets.gerado_por para auditar a fonte (manual, gemini, sora).
--   3. midia_assets.parent_schedule_id para vincular asset gerado à agenda
--      que o originou (permite "trocar imagem a cada execução").

ALTER TABLE midia_assets
  ADD COLUMN IF NOT EXISTS gerado_por TEXT NOT NULL DEFAULT 'manual'
    CHECK (gerado_por IN ('manual','gemini','sora','outro')),
  ADD COLUMN IF NOT EXISTS parent_schedule_id UUID;

-- midia_asset_id passa a ser opcional (slot pode ser auto-gen "stateless")
ALTER TABLE status_schedule
  ALTER COLUMN midia_asset_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS auto_generate BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS prompt_ia TEXT,
  ADD COLUMN IF NOT EXISTS provedor_ia TEXT NOT NULL DEFAULT 'gemini'
    CHECK (provedor_ia IN ('gemini','sora','manual')),
  ADD COLUMN IF NOT EXISTS regenerar_a_cada_post BOOLEAN NOT NULL DEFAULT true,
  -- caption padrão (opcional) — se nulo, usa caption do midia_asset
  ADD COLUMN IF NOT EXISTS caption_override TEXT;

-- Garante coerência: se auto_generate=true precisa de prompt_ia
ALTER TABLE status_schedule
  DROP CONSTRAINT IF EXISTS chk_status_schedule_origem;
ALTER TABLE status_schedule
  ADD CONSTRAINT chk_status_schedule_origem CHECK (
    (auto_generate = true AND prompt_ia IS NOT NULL AND length(trim(prompt_ia)) > 0)
    OR
    (auto_generate = false AND midia_asset_id IS NOT NULL)
  );

-- FK do parent_schedule_id (após a coluna existir)
ALTER TABLE midia_assets
  DROP CONSTRAINT IF EXISTS midia_assets_parent_schedule_fk;
ALTER TABLE midia_assets
  ADD CONSTRAINT midia_assets_parent_schedule_fk
  FOREIGN KEY (parent_schedule_id) REFERENCES status_schedule(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_midia_assets_parent_schedule
  ON midia_assets(parent_schedule_id) WHERE parent_schedule_id IS NOT NULL;

COMMENT ON COLUMN status_schedule.auto_generate IS
  'Se true, cron chama generate-image-gemini com prompt_ia antes de postar.';
COMMENT ON COLUMN status_schedule.regenerar_a_cada_post IS
  'Se true, gera imagem nova a cada execução. Se false, gera 1x e reusa.';
