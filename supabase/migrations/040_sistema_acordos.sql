-- ============================================================
-- Migration 040: Sistema de Acordos / Renegociação
-- ============================================================
-- Cria tabela de acordos (renegociações), adiciona coluna
-- acordo_id em parcelas para separar pagamento limpo de acordo,
-- e configs de entrada % e máximo de parcelas.
-- ============================================================

-- ── Enum de status do acordo ───────────────────────────────
DO $$ BEGIN
  CREATE TYPE acordo_status AS ENUM ('ativo', 'quitado', 'quebrado', 'cancelado');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Tabela: acordos ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS acordos (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Vínculos
  cliente_id        UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  kanban_card_id    UUID REFERENCES kanban_cobranca(id) ON DELETE SET NULL,
  criado_por        UUID REFERENCES profiles(id) ON DELETE SET NULL,

  -- Origem: "bot" ou "manual"
  origem            VARCHAR(20) NOT NULL DEFAULT 'manual',

  -- Valores
  valor_divida_original NUMERIC(12,2) NOT NULL,   -- total com juros no momento do acordo
  valor_entrada         NUMERIC(12,2) NOT NULL DEFAULT 0,
  entrada_percentual    NUMERIC(5,2) NOT NULL DEFAULT 30,
  valor_restante        NUMERIC(12,2) NOT NULL DEFAULT 0,
  num_parcelas          INTEGER NOT NULL DEFAULT 1,
  valor_parcela         NUMERIC(12,2) NOT NULL DEFAULT 0,
  dia_pagamento         INTEGER NOT NULL DEFAULT 10,  -- dia do mês (1-28)

  -- Datas
  data_acordo           TIMESTAMPTZ NOT NULL DEFAULT now(),
  data_primeira_parcela DATE,

  -- Cobrança da entrada
  entrada_charge_id     UUID REFERENCES woovi_charges(id) ON DELETE SET NULL,
  entrada_paga          BOOLEAN NOT NULL DEFAULT false,

  -- Parcelas originais congeladas (IDs das parcelas que geraram o acordo)
  parcelas_originais_ids UUID[] NOT NULL DEFAULT '{}',

  -- Status
  status            acordo_status NOT NULL DEFAULT 'ativo',
  observacao         TEXT,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_acordos_cliente ON acordos(cliente_id);
CREATE INDEX idx_acordos_status ON acordos(status);
CREATE INDEX idx_acordos_kanban ON acordos(kanban_card_id);

CREATE TRIGGER acordos_updated_at
  BEFORE UPDATE ON acordos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Coluna acordo_id em parcelas ───────────────────────────
-- Parcelas com acordo_id != NULL são de acordo (não faturamento direto)
ALTER TABLE parcelas
  ADD COLUMN IF NOT EXISTS acordo_id UUID REFERENCES acordos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_parcelas_acordo ON parcelas(acordo_id);

-- ── Coluna congelada em parcelas ───────────────────────────
-- Parcelas congeladas não acumulam juros e não geram notificações
ALTER TABLE parcelas
  ADD COLUMN IF NOT EXISTS congelada BOOLEAN NOT NULL DEFAULT false;

-- ── RLS para acordos ──────────────────────────────────────
ALTER TABLE acordos ENABLE ROW LEVEL SECURITY;

CREATE POLICY acordos_select ON acordos
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY acordos_insert ON acordos
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'gerencia', 'cobranca'))
  );

CREATE POLICY acordos_update ON acordos
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'gerencia', 'cobranca'))
  );

-- ── Realtime ──────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'acordos'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE acordos;
  END IF;
END $$;

-- ── Configs padrão ────────────────────────────────────────
INSERT INTO configuracoes_sistema (chave, valor) VALUES
  ('acordo_entrada_percentual', '30'),
  ('acordo_max_parcelas', '12'),
  ('acordo_desconto_juros_percentual', '0')
ON CONFLICT (chave) DO NOTHING;
