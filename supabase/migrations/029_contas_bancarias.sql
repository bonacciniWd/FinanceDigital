-- ════════════════════════════════════════════════════════════
-- Migration 029 — Tabela contas_bancarias (contas configuráveis)
-- ════════════════════════════════════════════════════════════
-- Substitui as opções hardcoded (CONTA PRINCIPAL, SECUNDÁRIA, CAIXA)
-- por uma tabela configurável que inclui contas manuais e gateways.

CREATE TABLE IF NOT EXISTS contas_bancarias (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome        TEXT NOT NULL,
  tipo        TEXT NOT NULL DEFAULT 'manual'
              CHECK (tipo IN ('manual', 'gateway')),
  gateway_id  UUID REFERENCES gateways_pagamento(id) ON DELETE SET NULL,
  ativo       BOOLEAN NOT NULL DEFAULT true,
  padrao      BOOLEAN NOT NULL DEFAULT false,
  ordem       INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índice para consulta rápida
CREATE INDEX IF NOT EXISTS idx_contas_bancarias_ativo ON contas_bancarias (ativo, ordem);

-- ── Seed: contas manuais ───────────────────────────────────
INSERT INTO contas_bancarias (nome, tipo, padrao, ordem) VALUES
  ('CONTA PRINCIPAL', 'manual', true, 1),
  ('CONTA SECUNDÁRIA', 'manual', false, 2),
  ('CAIXA', 'manual', false, 3)
ON CONFLICT DO NOTHING;

-- ── Seed: contas gateway (vinculadas) ──────────────────────
INSERT INTO contas_bancarias (nome, tipo, gateway_id, ativo, ordem)
SELECT 'Woovi (OpenPix)', 'gateway', id, ativo, 10
FROM gateways_pagamento WHERE nome = 'woovi'
ON CONFLICT DO NOTHING;

INSERT INTO contas_bancarias (nome, tipo, gateway_id, ativo, ordem)
SELECT 'EFI Bank', 'gateway', id, ativo, 11
FROM gateways_pagamento WHERE nome = 'efi'
ON CONFLICT DO NOTHING;

-- ── RLS ────────────────────────────────────────────────────
ALTER TABLE contas_bancarias ENABLE ROW LEVEL SECURITY;

-- Leitura: qualquer autenticado
CREATE POLICY "contas_bancarias_select"
  ON contas_bancarias FOR SELECT TO authenticated
  USING (true);

-- Escrita: apenas admin/gerencia
CREATE POLICY "contas_bancarias_admin"
  ON contas_bancarias FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'gerencia')
    )
  );
