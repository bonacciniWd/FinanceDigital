-- ══════════════════════════════════════════════════════════
-- Migration 004: Tabela de mapeamento LID → telefone real
--
-- WhatsApp Multi-Device usa IDs internos (@lid) que a Evolution API v1.x
-- não consegue enviar mensagens. Esta tabela armazena o mapeamento
-- LID → número real para permitir envios automatizados.
--
-- Fontes de resolução (em ordem de prioridade):
--   1. Histórico de mensagens (lid_jid_original em metadata)
--   2. Tabela clientes (match por nome/pushName)
--   3. Input manual do operador via UI
-- ══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS whatsapp_lid_map (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lid_jid     TEXT NOT NULL UNIQUE,              -- ex: "62771517513738@lid"
  real_phone  TEXT NOT NULL,                      -- ex: "5547989279037"
  real_jid    TEXT NOT NULL,                      -- ex: "5547989279037@s.whatsapp.net"
  push_name   TEXT,                               -- ex: "Denis W"
  source      TEXT NOT NULL DEFAULT 'manual',     -- manual | webhook_history | clientes_match
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_lid_map_lid ON whatsapp_lid_map(lid_jid);
CREATE INDEX idx_lid_map_phone ON whatsapp_lid_map(real_phone);

-- Trigger para updated_at
CREATE TRIGGER whatsapp_lid_map_updated_at
  BEFORE UPDATE ON whatsapp_lid_map
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Popular com dados históricos existentes ──────────────
-- Mensagens antigas que já têm lid_jid_original no metadata
INSERT INTO whatsapp_lid_map (lid_jid, real_phone, real_jid, push_name, source)
SELECT DISTINCT ON (metadata->>'lid_jid_original')
  metadata->>'lid_jid_original' AS lid_jid,
  telefone AS real_phone,
  metadata->>'jid' AS real_jid,
  metadata->>'push_name' AS push_name,
  'webhook_history' AS source
FROM whatsapp_mensagens_log
WHERE metadata->>'lid_jid_original' IS NOT NULL
  AND metadata->>'jid' IS NOT NULL
  AND (metadata->>'jid') LIKE '%@s.whatsapp.net'
ORDER BY metadata->>'lid_jid_original', created_at DESC
ON CONFLICT (lid_jid) DO NOTHING;

-- ── Corrigir mensagens existentes com telefone = dígitos do @lid ──
-- Atualiza telefone e metadata.jid para o número real usando o mapeamento
UPDATE whatsapp_mensagens_log m
SET
  telefone = lm.real_phone,
  metadata = m.metadata
    || jsonb_build_object('jid', lm.real_jid)
    || jsonb_build_object('lid_jid_original', m.metadata->>'jid')
FROM whatsapp_lid_map lm
WHERE (m.metadata->>'jid') = lm.lid_jid
  AND m.telefone != lm.real_phone;

-- Também corrigir os que têm telefone = dígitos do LID (sem @)
UPDATE whatsapp_mensagens_log m
SET
  telefone = lm.real_phone,
  metadata = m.metadata
    || jsonb_build_object('jid', lm.real_jid)
    || jsonb_build_object('lid_jid_original', lm.lid_jid)
FROM whatsapp_lid_map lm
WHERE m.telefone = replace(lm.lid_jid, '@lid', '')
  AND m.telefone != lm.real_phone;

-- ── RLS desabilitado (service_role sempre usado) ─────────
ALTER TABLE whatsapp_lid_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to lid_map"
  ON whatsapp_lid_map
  FOR ALL
  USING (true)
  WITH CHECK (true);
