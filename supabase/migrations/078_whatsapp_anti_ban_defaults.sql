-- ===========================================================
-- 078_whatsapp_anti_ban_defaults.sql
-- ===========================================================
-- Configurações de anti-ban para cron-notificacoes (WhatsApp).
-- Valores padrão conservadores para evitar banimento da Evolution API.
-- A página /configuracoes/sistema permite ajuste em runtime.
-- ===========================================================

INSERT INTO configuracoes_sistema (chave, valor) VALUES
  ('cron_max_msgs_dia', '25'::jsonb),
  ('cron_delay_ms', '8000'::jsonb),
  ('cron_skip_cold_outreach', 'true'::jsonb),
  ('cron_max_msgs_por_numero_dia', '2'::jsonb)
ON CONFLICT (chave) DO NOTHING;
