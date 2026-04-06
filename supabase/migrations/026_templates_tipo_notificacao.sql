-- ══════════════════════════════════════════════════════════
-- Migration 026: tipo_notificacao em templates_whatsapp
-- Conecta templates à automação (cron + approve-credit)
-- ══════════════════════════════════════════════════════════

-- Adicionar coluna de tipo de notificação
ALTER TABLE templates_whatsapp
  ADD COLUMN IF NOT EXISTS tipo_notificacao TEXT;

COMMENT ON COLUMN templates_whatsapp.tipo_notificacao IS
  'Mapeia o template para uma notificação automática: lembrete_3dias, lembrete_vespera, vencida_ontem, aprovacao. NULL = template manual.';

-- Apenas um template ativo por tipo de notificação
CREATE UNIQUE INDEX IF NOT EXISTS idx_templates_tipo_notificacao_unico
  ON templates_whatsapp (tipo_notificacao)
  WHERE tipo_notificacao IS NOT NULL AND ativo = true;

-- ── Mapear templates existentes (seed) aos tipos ─────────
UPDATE templates_whatsapp
  SET tipo_notificacao = 'lembrete_3dias'
  WHERE nome = 'Lembrete de Vencimento' AND categoria = 'lembrete'
    AND tipo_notificacao IS NULL;

UPDATE templates_whatsapp
  SET tipo_notificacao = 'aprovacao'
  WHERE nome = 'Boas-vindas' AND categoria = 'boas_vindas'
    AND tipo_notificacao IS NULL;

UPDATE templates_whatsapp
  SET tipo_notificacao = 'vencida_ontem'
  WHERE nome = 'Cobrança Amigável' AND categoria = 'cobranca'
    AND tipo_notificacao IS NULL;

-- ── Inserir template faltante: véspera do vencimento ─────
INSERT INTO templates_whatsapp (
  nome, categoria, mensagem_masculino, mensagem_feminino, variaveis, ativo, tipo_notificacao
) VALUES (
  'Vencimento Amanhã', 'lembrete',
  E'⚠️ *Vencimento Amanhã!*\n\nSr. {nome}, sua parcela nº {numeroParcela} de *R$ {valor}* vence amanhã ({data}).\n\nEfetue o pagamento para manter seu crédito em dia!\n\n_FinanceDigital_',
  E'⚠️ *Vencimento Amanhã!*\n\nSra. {nome}, sua parcela nº {numeroParcela} de *R$ {valor}* vence amanhã ({data}).\n\nEfetue o pagamento para manter seu crédito em dia!\n\n_FinanceDigital_',
  ARRAY['nome', 'valor', 'data', 'numeroParcela'],
  true,
  'lembrete_vespera'
) ON CONFLICT DO NOTHING;
