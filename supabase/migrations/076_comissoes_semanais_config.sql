-- 076: Comissões Semanais por funcionário (regras configuráveis)
--
-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  Centraliza no "pote único" da categoria Pagamentos do Gastos     ║
-- ║  Internos — para detalhar por funcionário, configuramos aqui as   ║
-- ║  REGRAS de cada beneficiário (percentual sobre entradas, sobre    ║
-- ║  saídas, valor fixo, ou combinação).                              ║
-- ║                                                                    ║
-- ║  Exemplos iniciais (devem ser inseridos via UI):                  ║
-- ║   • SL    → 8% sobre entradas da semana                            ║
-- ║   • dazl  → 6% sobre entradas da semana                            ║
-- ║   • SP    → 3% sobre entradas da semana                            ║
-- ║   • Grego → R$ 500 fixos por semana                                ║
-- ║   • Apoio → R$ 300 fixos + 1% sobre saídas da semana              ║
-- ║                                                                    ║
-- ║  As regras alimentam:                                             ║
-- ║   1. Card na aba Comissões (visualização do período)              ║
-- ║   2. Seção dedicada no PDF executivo                              ║
-- ║   3. Resumo enviado por WhatsApp via cron semanal                 ║
-- ╚══════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS comissoes_semanais_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,                                       -- nome de exibição (ex.: "SL", "Apoio")
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,  -- vínculo opcional com profile
  tipo TEXT NOT NULL CHECK (tipo IN (
    'pct_entradas',          -- valor_pct % sobre entradas do período
    'pct_saidas',            -- valor_pct % sobre saídas do período
    'fixo',                  -- valor_fixo por semana
    'fixo_pct_entradas',     -- valor_fixo + valor_pct % entradas
    'fixo_pct_saidas'        -- valor_fixo + valor_pct % saídas
  )),
  valor_pct  NUMERIC(7,4) DEFAULT 0,                        -- ex.: 8.0000 = 8%
  valor_fixo NUMERIC(14,2) DEFAULT 0,                       -- ex.: 500.00
  ativo BOOLEAN NOT NULL DEFAULT true,
  ordem INT NOT NULL DEFAULT 0,
  observacao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comissoes_semanais_ativo ON comissoes_semanais_config(ativo);
CREATE INDEX IF NOT EXISTS idx_comissoes_semanais_ordem ON comissoes_semanais_config(ordem);

ALTER TABLE comissoes_semanais_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comissoes_semanais_select_auth" ON comissoes_semanais_config
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "comissoes_semanais_admin_gerencia" ON comissoes_semanais_config
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','gerencia'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','gerencia'))
  );

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION touch_comissoes_semanais_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_touch_comissoes_semanais_updated_at ON comissoes_semanais_config;
CREATE TRIGGER trg_touch_comissoes_semanais_updated_at
  BEFORE UPDATE ON comissoes_semanais_config
  FOR EACH ROW EXECUTE FUNCTION touch_comissoes_semanais_updated_at();

-- ══════════════════════════════════════════════════════════════
-- Destinatários do relatório semanal por WhatsApp
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS relatorio_semanal_destinatarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  telefone TEXT NOT NULL,                       -- DDI+DDD+numero (somente dígitos), ex.: 5511999998888
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_relat_sem_dest_ativo ON relatorio_semanal_destinatarios(ativo);

ALTER TABLE relatorio_semanal_destinatarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "relat_sem_dest_select_auth" ON relatorio_semanal_destinatarios
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "relat_sem_dest_admin_gerencia" ON relatorio_semanal_destinatarios
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','gerencia'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','gerencia'))
  );

DROP TRIGGER IF EXISTS trg_touch_relat_sem_dest_updated_at ON relatorio_semanal_destinatarios;
CREATE TRIGGER trg_touch_relat_sem_dest_updated_at
  BEFORE UPDATE ON relatorio_semanal_destinatarios
  FOR EACH ROW EXECUTE FUNCTION touch_comissoes_semanais_updated_at();

-- ══════════════════════════════════════════════════════════════
-- Log de envios (para auditoria do cron)
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS relatorio_semanal_envios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo_inicio DATE NOT NULL,
  periodo_fim DATE NOT NULL,
  destinatarios JSONB NOT NULL,                 -- [{nome, telefone, status, erro?}]
  mensagem TEXT NOT NULL,
  origem TEXT NOT NULL DEFAULT 'manual' CHECK (origem IN ('manual','cron')),
  total_entradas NUMERIC(14,2),
  total_saidas NUMERIC(14,2),
  total_comissoes NUMERIC(14,2),
  enviado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_relat_sem_envios_periodo ON relatorio_semanal_envios(periodo_inicio DESC);

ALTER TABLE relatorio_semanal_envios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "relat_sem_envios_select_auth" ON relatorio_semanal_envios
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "relat_sem_envios_insert_auth" ON relatorio_semanal_envios
  FOR INSERT TO authenticated WITH CHECK (true);
