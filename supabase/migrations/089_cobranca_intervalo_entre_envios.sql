-- ============================================================
-- Migration 089: Intervalo entre envios consecutivos na fila
-- ============================================================
-- Adiciona delay (em segundos) entre disparos consecutivos
-- processados pela edge function `processar-fila-cobranca`.
-- Serve como anti-ban WhatsApp (evita rajadas).
-- ============================================================

ALTER TABLE cobranca_agendamentos
  ADD COLUMN IF NOT EXISTS intervalo_entre_envios_seg INTEGER NOT NULL DEFAULT 60
    CHECK (intervalo_entre_envios_seg >= 0 AND intervalo_entre_envios_seg <= 3600);

COMMENT ON COLUMN cobranca_agendamentos.intervalo_entre_envios_seg IS
  'Pausa (segundos) aplicada entre cada envio consecutivo desta regra para evitar bloqueio.';
