-- Migration 027: Profissão no cadastro de clientes + campo na verificação
-- + observação/conta bancária em parcelas para pagamento completo/parcial

-- ── 1. Profissão no cadastro de clientes ──────────────────
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS profissao TEXT DEFAULT NULL;

COMMENT ON COLUMN clientes.profissao IS 'Profissão informada no cadastro do cliente';

-- ── 2. Profissão informada na verificação de identidade ───
ALTER TABLE identity_verifications
  ADD COLUMN IF NOT EXISTS profissao_informada TEXT DEFAULT NULL;

COMMENT ON COLUMN identity_verifications.profissao_informada IS 'Profissão informada pelo cliente na verificação — comparada com cadastro';

-- ── 3. Observação e conta bancária em parcelas ────────────
ALTER TABLE parcelas
  ADD COLUMN IF NOT EXISTS observacao TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS conta_bancaria TEXT DEFAULT NULL;

COMMENT ON COLUMN parcelas.observacao IS 'Observação livre ao registrar pagamento';
COMMENT ON COLUMN parcelas.conta_bancaria IS 'Conta bancária usada para receber o pagamento';
