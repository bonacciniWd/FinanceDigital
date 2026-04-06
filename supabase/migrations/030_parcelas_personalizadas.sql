-- ════════════════════════════════════════════════════════════
-- Migration 030 — Parcelas personalizadas (intervalo + dia útil + datas)
-- ════════════════════════════════════════════════════════════
-- Permite configurações flexíveis de pagamento:
--   • Diário, Semanal, Quinzenal, Mensal (existentes)
--   • Personalizado: intervalo em dias, dia útil, datas específicas

ALTER TABLE analises_credito
  ADD COLUMN IF NOT EXISTS intervalo_dias   INTEGER,
  ADD COLUMN IF NOT EXISTS dia_util         BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS datas_personalizadas TEXT;

COMMENT ON COLUMN analises_credito.intervalo_dias IS
  'Intervalo em dias entre parcelas (usado quando periodicidade = personalizado)';
COMMENT ON COLUMN analises_credito.dia_util IS
  'Se true, ajusta vencimentos para o próximo dia útil';
COMMENT ON COLUMN analises_credito.datas_personalizadas IS
  'Datas específicas de vencimento (JSON array de strings ISO ou dd/mm/aaaa)';
