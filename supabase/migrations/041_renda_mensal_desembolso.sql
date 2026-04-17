-- 041: Adicionar renda_mensal em clientes + desembolsado em emprestimos
-- + função RPC para ajustar score_interno

-- ── 1. Renda mensal no cadastro do cliente ──────────────
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS renda_mensal NUMERIC(12,2) DEFAULT 0;

-- ── 2. Controle de desembolso no empréstimo ─────────────
ALTER TABLE emprestimos
  ADD COLUMN IF NOT EXISTS desembolsado BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS desembolsado_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS desembolsado_por UUID REFERENCES auth.users(id);

-- ── 3. Função para ajustar score do cliente ─────────────
CREATE OR REPLACE FUNCTION ajustar_score_cliente(
  p_cliente_id UUID,
  p_delta INTEGER,
  p_motivo TEXT DEFAULT NULL
) RETURNS INTEGER AS $$
DECLARE
  v_score_atual INTEGER;
  v_novo_score INTEGER;
BEGIN
  SELECT score_interno INTO v_score_atual
  FROM clientes WHERE id = p_cliente_id;

  IF NOT FOUND THEN RETURN 0; END IF;

  v_novo_score := GREATEST(0, LEAST(1000, v_score_atual + p_delta));

  UPDATE clientes SET score_interno = v_novo_score, updated_at = now()
  WHERE id = p_cliente_id;

  RETURN v_novo_score;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 4. Atualizar empréstimos existentes que já tiveram PIX enviado ──
-- Se o empréstimo tem gateway != 'auto' e status ativo/quitado, 
-- provavelmente já foi desembolsado
UPDATE emprestimos
SET desembolsado = true, desembolsado_em = aprovado_em
WHERE gateway IS NOT NULL AND gateway != 'auto'
  AND desembolsado = false;
