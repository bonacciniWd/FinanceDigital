-- 050: Conciliação automática + OCR de comprovantes + pagamentos órfãos
--
-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  Adiciona infraestrutura para:                                   ║
-- ║   1. Match automático de pagamentos sem parcela_id (Bloco 1)     ║
-- ║   2. OCR de comprovantes manuais via Tesseract.js (Bloco 2)      ║
-- ║   3. Anexar imagens do WhatsApp ao cadastro (Bloco 3)            ║
-- ╚══════════════════════════════════════════════════════════════════╝

-- ══════════════════════════════════════════════════════════════
-- 1. Tabela pagamentos_orfaos
--    Armazena pagamentos PIX recebidos cuja conciliação automática
--    falhou (sem parcela_id ou múltiplas candidatas).
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS pagamentos_orfaos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- dados do pagamento
  valor NUMERIC(14,2) NOT NULL,
  e2e_id TEXT,                                  -- EndToEnd ID PIX (BCB)
  txid TEXT,                                    -- txid quando charge identificado mas sem parcela
  cpf_pagador TEXT,
  nome_pagador TEXT,
  recebido_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  gateway TEXT,                                 -- 'efi' | 'woovi' | 'manual'
  raw_payload JSONB,                            -- payload original do webhook para auditoria
  -- conciliação
  cliente_id UUID REFERENCES clientes(id) ON DELETE SET NULL,
  parcela_id_match UUID REFERENCES parcelas(id) ON DELETE SET NULL,
  candidatas JSONB,                             -- array de parcela_ids candidatas (quando >1 match)
  status TEXT NOT NULL DEFAULT 'nao_conciliado'
    CHECK (status IN ('nao_conciliado','conciliado_auto','conciliado_manual','ignorado')),
  conciliado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  conciliado_em TIMESTAMPTZ,
  observacao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pagamentos_orfaos_status ON pagamentos_orfaos(status);
CREATE INDEX IF NOT EXISTS idx_pagamentos_orfaos_cliente ON pagamentos_orfaos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_orfaos_e2e ON pagamentos_orfaos(e2e_id);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_pagamentos_orfaos_e2e ON pagamentos_orfaos(e2e_id) WHERE e2e_id IS NOT NULL;

ALTER TABLE pagamentos_orfaos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "orfaos_select_auth" ON pagamentos_orfaos
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "orfaos_update_admin_gerencia" ON pagamentos_orfaos
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','gerencia','cobranca'))
  );

-- service role bypassa RLS, então webhooks inserem normalmente

-- ══════════════════════════════════════════════════════════════
-- 2. Colunas OCR em parcelas
-- ══════════════════════════════════════════════════════════════
ALTER TABLE parcelas
  ADD COLUMN IF NOT EXISTS comprovante_valor_ocr NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS comprovante_data_ocr DATE,
  ADD COLUMN IF NOT EXISTS comprovante_chave_ocr TEXT,
  ADD COLUMN IF NOT EXISTS comprovante_ocr_score NUMERIC(5,2),    -- 0-100 (% de confiança)
  ADD COLUMN IF NOT EXISTS comprovante_ocr_status TEXT
    CHECK (comprovante_ocr_status IN ('auto_aprovado','divergencia','manual','sem_ocr','falha_ocr'));

COMMENT ON COLUMN parcelas.comprovante_ocr_status IS
'auto_aprovado=valor bate dentro do threshold; divergencia=atendente confirmou apesar; manual=OCR desativado ou pulou; sem_ocr=não tentou; falha_ocr=erro técnico';

-- Estender constraint de pagamento_tipo (criada na 033) para incluir novos tipos
ALTER TABLE parcelas DROP CONSTRAINT IF EXISTS parcelas_pagamento_tipo_check;
ALTER TABLE parcelas ADD CONSTRAINT parcelas_pagamento_tipo_check
  CHECK (pagamento_tipo IN ('pix', 'manual', 'automatico', 'pix_match_auto', 'pix_orfao_conciliado'));

-- ══════════════════════════════════════════════════════════════
-- 3. Configurações: OCR + match automático
-- ══════════════════════════════════════════════════════════════
INSERT INTO configuracoes_sistema (chave, valor, descricao) VALUES
  ('ocr_comprovantes', '{"enabled": true, "provider": "tesseract", "auto_approve_threshold_pct": 10, "require_dual_confirm_on_mismatch": true}'::jsonb,
   'OCR de comprovantes de pagamento. provider: tesseract|google_vision; auto_approve_threshold_pct: % de divergência tolerada; require_dual_confirm: exige checkbox de confirmação ao salvar com divergência'),
  ('conciliacao_automatica', '{"enabled": true, "tolerancia_pct": 10, "match_por_cpf": true}'::jsonb,
   'Match automático de pagamentos PIX sem parcela_id. tolerancia_pct: % máximo de diferença entre valor pago e valor da parcela')
ON CONFLICT (chave) DO NOTHING;

-- ══════════════════════════════════════════════════════════════
-- 4. RPC helper: tentar conciliar pagamento órfão
--    Usado tanto pelos webhooks quanto pela UI manual.
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION conciliar_pagamento_orfao(
  p_orfao_id UUID,
  p_parcela_id UUID,
  p_marcar_paga BOOLEAN DEFAULT true
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_orfao RECORD;
  v_parcela RECORD;
  v_role TEXT;
BEGIN
  SELECT role INTO v_role FROM profiles WHERE id = auth.uid();
  IF v_role NOT IN ('admin','gerencia','cobranca') THEN
    RAISE EXCEPTION 'Permissão negada';
  END IF;

  SELECT * INTO v_orfao FROM pagamentos_orfaos WHERE id = p_orfao_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Órfão não encontrado'; END IF;
  IF v_orfao.status != 'nao_conciliado' THEN RAISE EXCEPTION 'Já conciliado/ignorado'; END IF;

  SELECT * INTO v_parcela FROM parcelas WHERE id = p_parcela_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Parcela não encontrada'; END IF;

  UPDATE pagamentos_orfaos SET
    status = 'conciliado_manual',
    parcela_id_match = p_parcela_id,
    cliente_id = v_parcela.cliente_id,
    conciliado_por = auth.uid(),
    conciliado_em = now()
  WHERE id = p_orfao_id;

  IF p_marcar_paga AND v_parcela.status != 'paga' THEN
    UPDATE parcelas SET
      status = 'paga',
      data_pagamento = COALESCE(data_pagamento, v_orfao.recebido_em::date),
      pagamento_tipo = COALESCE(pagamento_tipo, 'pix_orfao_conciliado')
    WHERE id = p_parcela_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'parcela_id', p_parcela_id);
END;
$$;

GRANT EXECUTE ON FUNCTION conciliar_pagamento_orfao(UUID, UUID, BOOLEAN) TO authenticated;
