-- 069: Marketing Mídia (Cloudinary) + Status Schedule + LGPD opt-in + IA cobrança (stub)
--
-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  Módulo Marketing/Mídia:                                         ║
-- ║   1. midia_assets  → catálogo de mídias hospedadas no Cloudinary ║
-- ║   2. status_schedule → agendamento semanal de posts em status    ║
-- ║   3. clientes.aceite_video_cobranca → opt-in LGPD para Módulo 3  ║
-- ║   4. emprestimos.id_video_cobranca + status_processamento_ia     ║
-- ║                                                                  ║
-- ║  Stack:                                                          ║
-- ║   • Cloudinary (free 25 GB) p/ storage de mídia                  ║
-- ║   • Edge function cron-post-status varre status_schedule a cada  ║
-- ║     15 min e envia para WhatsApp via Evolution API (sendStatus). ║
-- ║   • Geração via Sora (futuro) → status_processamento_ia controla ║
-- ║     pipeline assíncrono.                                         ║
-- ╚══════════════════════════════════════════════════════════════════╝

-- ══════════════════════════════════════════════════════════════
-- 1. midia_assets — catálogo de mídias (Cloudinary)
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS midia_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Tipo de uso
  tipo TEXT NOT NULL CHECK (tipo IN (
    'promocional',         -- imagem/vídeo de marketing genérico
    'lembrete_cobranca',   -- vídeo gerado por IA p/ cobrança 1:1 (Módulo 3 — futuro)
    'status_template'      -- modelo p/ rodízio em status do WhatsApp
  )),
  formato TEXT NOT NULL CHECK (formato IN ('image','video')),
  -- Cloudinary
  public_id TEXT NOT NULL UNIQUE,            -- ex: "marketing-assets/promo_outubro_01"
  secure_url TEXT NOT NULL,                  -- URL https assinada/pública (depende do tipo)
  thumb_url TEXT,                            -- URL da thumb (vídeo) ou versão otimizada (imagem)
  duration_s INT,                            -- duração em segundos (vídeo)
  width INT,
  height INT,
  bytes BIGINT,
  -- Metadados de uso
  titulo TEXT NOT NULL,
  descricao TEXT,
  caption TEXT,                              -- texto que vai junto no status do WhatsApp
  ativo BOOLEAN NOT NULL DEFAULT true,
  -- IA / processamento (futuro: Sora p/ Módulo 3)
  status_ia TEXT NOT NULL DEFAULT 'pronto'
    CHECK (status_ia IN ('pendente','processando','pronto','erro')),
  prompt_ia TEXT,
  erro_ia TEXT,
  -- Vínculos (somente p/ lembrete_cobranca)
  cliente_id UUID REFERENCES clientes(id) ON DELETE SET NULL,
  emprestimo_id UUID REFERENCES emprestimos(id) ON DELETE SET NULL,
  consentimento_lgpd_em TIMESTAMPTZ,         -- snapshot do aceite no momento da geração
  -- Auditoria
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_midia_assets_tipo ON midia_assets(tipo);
CREATE INDEX IF NOT EXISTS idx_midia_assets_ativo ON midia_assets(ativo) WHERE ativo = true;
CREATE INDEX IF NOT EXISTS idx_midia_assets_cliente ON midia_assets(cliente_id) WHERE cliente_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_midia_assets_status_ia ON midia_assets(status_ia) WHERE status_ia IN ('pendente','processando');

ALTER TABLE midia_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "midia_assets_select_auth" ON midia_assets
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "midia_assets_admin_gerencia" ON midia_assets
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','gerencia'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','gerencia'))
  );

-- Trigger updated_at
CREATE OR REPLACE FUNCTION trg_midia_assets_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS midia_assets_set_updated_at ON midia_assets;
CREATE TRIGGER midia_assets_set_updated_at BEFORE UPDATE ON midia_assets
  FOR EACH ROW EXECUTE FUNCTION trg_midia_assets_updated_at();

-- ══════════════════════════════════════════════════════════════
-- 2. status_schedule — agendamento semanal de posts em status
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS status_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  midia_asset_id UUID NOT NULL REFERENCES midia_assets(id) ON DELETE CASCADE,
  instancia_id UUID NOT NULL REFERENCES whatsapp_instancias(id) ON DELETE CASCADE,
  -- Recorrência semanal
  dia_semana INT NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),  -- 0=Dom .. 6=Sáb
  hora INT NOT NULL CHECK (hora BETWEEN 0 AND 23),
  minuto INT NOT NULL CHECK (minuto BETWEEN 0 AND 59),
  -- Estado / controle
  ativo BOOLEAN NOT NULL DEFAULT true,
  ultimo_post_em TIMESTAMPTZ,
  ultimo_post_status TEXT CHECK (ultimo_post_status IN ('sucesso','erro')),
  ultimo_post_erro TEXT,
  total_posts INT NOT NULL DEFAULT 0,
  -- Auditoria
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  observacao TEXT
);

CREATE INDEX IF NOT EXISTS idx_status_schedule_ativo ON status_schedule(ativo) WHERE ativo = true;
CREATE INDEX IF NOT EXISTS idx_status_schedule_dow_time ON status_schedule(dia_semana, hora, minuto) WHERE ativo = true;

ALTER TABLE status_schedule ENABLE ROW LEVEL SECURITY;

CREATE POLICY "status_schedule_select_auth" ON status_schedule
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "status_schedule_admin_gerencia" ON status_schedule
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','gerencia'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','gerencia'))
  );

-- ══════════════════════════════════════════════════════════════
-- 3. status_post_log — auditoria de cada execução do cron
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS status_post_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID REFERENCES status_schedule(id) ON DELETE SET NULL,
  midia_asset_id UUID REFERENCES midia_assets(id) ON DELETE SET NULL,
  instancia_id UUID REFERENCES whatsapp_instancias(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('sucesso','erro','pulado')),
  erro_msg TEXT,
  evolution_response TEXT,
  posted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_status_post_log_posted_at ON status_post_log(posted_at DESC);

ALTER TABLE status_post_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "status_post_log_select_auth" ON status_post_log
  FOR SELECT TO authenticated USING (true);

-- ══════════════════════════════════════════════════════════════
-- 4. LGPD — opt-in para vídeo de cobrança (Módulo 3, futuro)
-- ══════════════════════════════════════════════════════════════
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS aceite_video_cobranca BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS aceite_video_cobranca_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS aceite_video_cobranca_ip TEXT;

COMMENT ON COLUMN clientes.aceite_video_cobranca IS
  'LGPD: cliente autorizou uso da imagem para vídeo de cobrança personalizado. Opt-in capturado no /cadastro/:token.';

-- ══════════════════════════════════════════════════════════════
-- 5. emprestimos — campos p/ pipeline de IA (Módulo 3 — Sora)
-- ══════════════════════════════════════════════════════════════
ALTER TABLE emprestimos
  ADD COLUMN IF NOT EXISTS id_video_cobranca UUID REFERENCES midia_assets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status_processamento_ia TEXT
    CHECK (status_processamento_ia IN ('nao_aplicavel','pendente','processando','pronto','erro','enviado'))
    DEFAULT 'nao_aplicavel';

COMMENT ON COLUMN emprestimos.status_processamento_ia IS
  'Pipeline de geração de vídeo de cobrança IA (Sora — futuro). Trigger: parcela > 16 dias atraso + cliente.aceite_video_cobranca.';
