-- 081_comissoes_config.sql
-- Objetivo: nova arquitetura de comissões baseada em PAPEL/NÍVEL do usuário,
-- substituindo a tabela genérica `comissoes_semanais_config` (que ainda fica
-- para retro-compat, a remoção será feita em migration posterior após backfill
-- manual pelo gerente).
--
-- Tipos de regra:
--   - 'kanban_nivel': cobrador atua em uma faixa N1/N2/N3/N4 do Kanban Cobrança.
--     • N1/N2 → usa pct_sobre_acordos + pct_sobre_parcelas
--     • N3/N4 → usa pct_sobre_acordo_parcela + pct_sobre_emprestimo_em_dia
--     Múltiplos usuários no mesmo nível são suportados via `peso_pct`
--     (ex.: User A 60% + User B 40% = 100% do bolo daquele nível).
--   - 'gerente_pct': % sobre total de entradas da semana (configurável, ~3%).
--   - 'dono_pct': % sobre total de entradas da semana (default ~20%).

BEGIN;

-- ── 1. Tabela ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS comissoes_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  tipo TEXT NOT NULL CHECK (tipo IN ('kanban_nivel', 'gerente_pct', 'dono_pct')),

  -- Apenas para tipo='kanban_nivel'. NULL para gerente/dono.
  nivel_kanban TEXT CHECK (nivel_kanban IN ('n1', 'n2', 'n3', 'n4')),

  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Peso ponderado quando há múltiplos usuários no mesmo (tipo, nivel_kanban).
  -- Soma dos pesos de cada (tipo, nivel) ativos deveria ser 100, mas não é
  -- forçado em DB (validação na UI). Permite 0-100.
  peso_pct NUMERIC(5,2) NOT NULL DEFAULT 100 CHECK (peso_pct >= 0 AND peso_pct <= 100),

  -- ─ Percentuais usados conforme o tipo ─
  -- N1/N2:
  pct_sobre_acordos           NUMERIC(7,4) NOT NULL DEFAULT 0,
  pct_sobre_parcelas          NUMERIC(7,4) NOT NULL DEFAULT 0,
  -- N3/N4:
  pct_sobre_acordo_parcela    NUMERIC(7,4) NOT NULL DEFAULT 0,
  pct_sobre_emprestimo_em_dia NUMERIC(7,4) NOT NULL DEFAULT 0,
  -- Gerente / Dono:
  pct_sobre_total_entradas    NUMERIC(7,4) NOT NULL DEFAULT 0,

  ativo BOOLEAN NOT NULL DEFAULT true,
  observacao TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Coerência: kanban_nivel ⇒ nivel_kanban NOT NULL; gerente/dono ⇒ NULL.
  CONSTRAINT comissoes_config_nivel_chk CHECK (
    (tipo = 'kanban_nivel' AND nivel_kanban IS NOT NULL) OR
    (tipo IN ('gerente_pct', 'dono_pct') AND nivel_kanban IS NULL)
  )
);

-- Evita o mesmo user duplicado no mesmo papel/nível (com index parcial:
-- só vale para registros ativos — desativados podem coexistir como histórico).
CREATE UNIQUE INDEX IF NOT EXISTS comissoes_config_unique_ativo_idx
  ON comissoes_config (user_id, tipo, COALESCE(nivel_kanban, ''))
  WHERE ativo = true;

CREATE INDEX IF NOT EXISTS comissoes_config_tipo_idx        ON comissoes_config (tipo);
CREATE INDEX IF NOT EXISTS comissoes_config_user_idx        ON comissoes_config (user_id);
CREATE INDEX IF NOT EXISTS comissoes_config_ativo_idx       ON comissoes_config (ativo);
CREATE INDEX IF NOT EXISTS comissoes_config_nivel_idx       ON comissoes_config (nivel_kanban) WHERE nivel_kanban IS NOT NULL;

-- ── 2. RLS ───────────────────────────────────────────────────
ALTER TABLE comissoes_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS comissoes_config_select ON comissoes_config;
CREATE POLICY comissoes_config_select ON comissoes_config
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS comissoes_config_admin_all ON comissoes_config;
CREATE POLICY comissoes_config_admin_all ON comissoes_config
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
       WHERE p.id = auth.uid()
         AND p.role IN ('admin', 'gerencia')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
       WHERE p.id = auth.uid()
         AND p.role IN ('admin', 'gerencia')
    )
  );

-- ── 3. Trigger updated_at ────────────────────────────────────
CREATE OR REPLACE FUNCTION touch_comissoes_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_touch_comissoes_config_updated_at ON comissoes_config;
CREATE TRIGGER trg_touch_comissoes_config_updated_at
  BEFORE UPDATE ON comissoes_config
  FOR EACH ROW EXECUTE FUNCTION touch_comissoes_config_updated_at();

COMMENT ON TABLE comissoes_config IS
  'Comissões baseadas em papel/nível (kanban_nivel|gerente_pct|dono_pct). Substitui comissoes_semanais_config.';

COMMIT;
