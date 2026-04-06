-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  Migration 023 — Fluxo PIX seguro + Sistema de Comissões              ║
-- ║                                                                        ║
-- ║  1. Rastreabilidade em empréstimos (vendedor, cobrador, aprovador)     ║
-- ║  2. Rastreabilidade em woovi_transactions e woovi_charges              ║
-- ║  3. Tabela de configuração de comissões por agente                     ║
-- ║  4. Tabela de comissões calculadas por liquidação                      ║
-- ║  5. Tabela de gateways de pagamento (multi-gateway: Woovi + EFI)      ║
-- ║  6. Trigger automático para calcular comissões ao pagar parcela        ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ══════════════════════════════════════════════════════════════
-- 1. RASTREABILIDADE NOS EMPRÉSTIMOS
-- ══════════════════════════════════════════════════════════════

-- Quem vendeu a operação (agente comercial)
ALTER TABLE emprestimos
  ADD COLUMN IF NOT EXISTS vendedor_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- Quem é responsável pela cobrança
ALTER TABLE emprestimos
  ADD COLUMN IF NOT EXISTS cobrador_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- Quem aprovou o crédito (financeiro/gerência)
ALTER TABLE emprestimos
  ADD COLUMN IF NOT EXISTS aprovado_por UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- Quando foi aprovado
ALTER TABLE emprestimos
  ADD COLUMN IF NOT EXISTS aprovado_em TIMESTAMPTZ;

-- Link com a análise de crédito original
ALTER TABLE emprestimos
  ADD COLUMN IF NOT EXISTS analise_id UUID REFERENCES analises_credito(id) ON DELETE SET NULL;

-- Qual gateway foi usado para liberar
ALTER TABLE emprestimos
  ADD COLUMN IF NOT EXISTS gateway VARCHAR(20) DEFAULT 'woovi';

-- Índices para consultas frequentes
CREATE INDEX IF NOT EXISTS idx_emprestimos_vendedor ON emprestimos(vendedor_id);
CREATE INDEX IF NOT EXISTS idx_emprestimos_cobrador ON emprestimos(cobrador_id);
CREATE INDEX IF NOT EXISTS idx_emprestimos_aprovador ON emprestimos(aprovado_por);

-- ══════════════════════════════════════════════════════════════
-- 2. RASTREABILIDADE NAS TRANSAÇÕES WOOVI
-- ══════════════════════════════════════════════════════════════

-- Quem autorizou o pagamento PIX (financeiro)
ALTER TABLE woovi_transactions
  ADD COLUMN IF NOT EXISTS autorizado_por UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- Quando foi autorizado
ALTER TABLE woovi_transactions
  ADD COLUMN IF NOT EXISTS autorizado_em TIMESTAMPTZ;

-- Quem criou a cobrança
ALTER TABLE woovi_charges
  ADD COLUMN IF NOT EXISTS criado_por UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- Qual gateway processou
ALTER TABLE woovi_charges
  ADD COLUMN IF NOT EXISTS gateway VARCHAR(20) DEFAULT 'woovi';

ALTER TABLE woovi_transactions
  ADD COLUMN IF NOT EXISTS gateway VARCHAR(20) DEFAULT 'woovi';

-- ══════════════════════════════════════════════════════════════
-- 3. TABELA DE CONFIGURAÇÃO DE COMISSÕES POR AGENTE
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS agentes_comissoes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agente_id           UUID NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  percentual_venda    NUMERIC(5,2) NOT NULL DEFAULT 0
    CHECK (percentual_venda >= 0 AND percentual_venda <= 100),
  percentual_cobranca NUMERIC(5,2) NOT NULL DEFAULT 0
    CHECK (percentual_cobranca >= 0 AND percentual_cobranca <= 100),
  percentual_gerencia NUMERIC(5,2) NOT NULL DEFAULT 0
    CHECK (percentual_gerencia >= 0 AND percentual_gerencia <= 100),
  ativo               BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE agentes_comissoes IS 'Configuração de % de comissão por agente (venda, cobrança e gerência)';
COMMENT ON COLUMN agentes_comissoes.percentual_venda IS '% sobre cada liquidação para o vendedor';
COMMENT ON COLUMN agentes_comissoes.percentual_cobranca IS '% sobre cada liquidação para o cobrador';
COMMENT ON COLUMN agentes_comissoes.percentual_gerencia IS '% sobre o valor do empréstimo para o gerente';

CREATE TRIGGER agentes_comissoes_updated_at
  BEFORE UPDATE ON agentes_comissoes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ══════════════════════════════════════════════════════════════
-- 4. TABELA DE COMISSÕES CALCULADAS (POR LIQUIDAÇÃO)
-- ══════════════════════════════════════════════════════════════

CREATE TYPE comissao_tipo AS ENUM ('venda', 'cobranca', 'gerencia');
CREATE TYPE comissao_status AS ENUM ('pendente', 'aprovado', 'pago');

CREATE TABLE IF NOT EXISTS comissoes_liquidacoes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parcela_id      UUID NOT NULL REFERENCES parcelas(id) ON DELETE CASCADE,
  emprestimo_id   UUID NOT NULL REFERENCES emprestimos(id) ON DELETE CASCADE,
  agente_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tipo            comissao_tipo NOT NULL,
  valor_base      NUMERIC(12,2) NOT NULL,     -- valor da liquidação (parcela paga)
  percentual      NUMERIC(5,2) NOT NULL,       -- % aplicado
  valor_comissao  NUMERIC(12,2) NOT NULL,      -- resultado do cálculo
  mes_referencia  DATE NOT NULL,               -- primeiro dia do mês
  status          comissao_status NOT NULL DEFAULT 'pendente',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE comissoes_liquidacoes IS 'Comissões calculadas automaticamente a cada liquidação de parcela';

CREATE INDEX IF NOT EXISTS idx_comissoes_agente ON comissoes_liquidacoes(agente_id);
CREATE INDEX IF NOT EXISTS idx_comissoes_mes ON comissoes_liquidacoes(mes_referencia);
CREATE INDEX IF NOT EXISTS idx_comissoes_emprestimo ON comissoes_liquidacoes(emprestimo_id);
CREATE INDEX IF NOT EXISTS idx_comissoes_parcela ON comissoes_liquidacoes(parcela_id);
CREATE INDEX IF NOT EXISTS idx_comissoes_status ON comissoes_liquidacoes(status);

-- Constraint: impede duplicata de comissão por parcela+agente+tipo
ALTER TABLE comissoes_liquidacoes
  ADD CONSTRAINT uq_comissao_parcela_agente_tipo
  UNIQUE (parcela_id, agente_id, tipo);

-- ══════════════════════════════════════════════════════════════
-- 5. TABELA DE GATEWAYS DE PAGAMENTO (MULTI-GATEWAY)
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS gateways_pagamento (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome        VARCHAR(50) NOT NULL UNIQUE,       -- 'woovi', 'efi'
  label       TEXT NOT NULL DEFAULT '',           -- 'Woovi (OpenPix)', 'EFI Bank'
  ativo       BOOLEAN NOT NULL DEFAULT false,
  config      JSONB NOT NULL DEFAULT '{}',        -- chaves de API (sensitive!)
  prioridade  INTEGER NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE gateways_pagamento IS 'Configuração de gateways de pagamento PIX (Woovi, EFI, etc.)';

CREATE TRIGGER gateways_pagamento_updated_at
  BEFORE UPDATE ON gateways_pagamento
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Seed: gateway Woovi já existente
INSERT INTO gateways_pagamento (nome, label, ativo, prioridade)
VALUES ('woovi', 'Woovi (OpenPix)', true, 1)
ON CONFLICT (nome) DO NOTHING;

-- Seed: gateway EFI Bank (inativo por padrão)
INSERT INTO gateways_pagamento (nome, label, ativo, prioridade)
VALUES ('efi', 'EFI Bank (Gerencianet)', false, 2)
ON CONFLICT (nome) DO NOTHING;

-- ══════════════════════════════════════════════════════════════
-- 6. FUNÇÃO PARA CALCULAR COMISSÕES AUTOMATICAMENTE
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION calcular_comissao_parcela()
RETURNS TRIGGER AS $$
DECLARE
  v_emprestimo RECORD;
  v_config_vendedor RECORD;
  v_config_cobrador RECORD;
  v_config_gerente RECORD;
  v_mes DATE;
  v_valor_liquidado NUMERIC(12,2);
BEGIN
  -- Só processa quando parcela muda para 'paga'
  IF NEW.status <> 'paga' OR OLD.status = 'paga' THEN
    RETURN NEW;
  END IF;

  -- Valor liquidado = valor da parcela (com juros/multa - desconto)
  v_valor_liquidado := NEW.valor;
  v_mes := date_trunc('month', COALESCE(NEW.data_pagamento, CURRENT_DATE))::DATE;

  -- Buscar empréstimo com vendedor e cobrador
  SELECT * INTO v_emprestimo
  FROM emprestimos
  WHERE id = NEW.emprestimo_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Comissão do vendedor (% sobre liquidação)
  IF v_emprestimo.vendedor_id IS NOT NULL THEN
    SELECT * INTO v_config_vendedor
    FROM agentes_comissoes
    WHERE agente_id = v_emprestimo.vendedor_id AND ativo = true;

    IF FOUND AND v_config_vendedor.percentual_venda > 0 THEN
      INSERT INTO comissoes_liquidacoes
        (parcela_id, emprestimo_id, agente_id, tipo, valor_base, percentual, valor_comissao, mes_referencia)
      VALUES
        (NEW.id, NEW.emprestimo_id, v_emprestimo.vendedor_id, 'venda',
         v_valor_liquidado, v_config_vendedor.percentual_venda,
         ROUND(v_valor_liquidado * v_config_vendedor.percentual_venda / 100, 2),
         v_mes)
      ON CONFLICT (parcela_id, agente_id, tipo) DO NOTHING;
    END IF;
  END IF;

  -- Comissão do cobrador (% sobre liquidação)
  IF v_emprestimo.cobrador_id IS NOT NULL THEN
    SELECT * INTO v_config_cobrador
    FROM agentes_comissoes
    WHERE agente_id = v_emprestimo.cobrador_id AND ativo = true;

    IF FOUND AND v_config_cobrador.percentual_cobranca > 0 THEN
      INSERT INTO comissoes_liquidacoes
        (parcela_id, emprestimo_id, agente_id, tipo, valor_base, percentual, valor_comissao, mes_referencia)
      VALUES
        (NEW.id, NEW.emprestimo_id, v_emprestimo.cobrador_id, 'cobranca',
         v_valor_liquidado, v_config_cobrador.percentual_cobranca,
         ROUND(v_valor_liquidado * v_config_cobrador.percentual_cobranca / 100, 2),
         v_mes)
      ON CONFLICT (parcela_id, agente_id, tipo) DO NOTHING;
    END IF;
  END IF;

  -- Comissão do gerente (% sobre valor do empréstimo, não da parcela)
  -- Busca todos os gerentes com percentual_gerencia > 0 para este empréstimo
  FOR v_config_gerente IN
    SELECT ac.agente_id, ac.percentual_gerencia
    FROM agentes_comissoes ac
    INNER JOIN profiles p ON p.id = ac.agente_id
    WHERE p.role = 'gerencia'
      AND ac.ativo = true
      AND ac.percentual_gerencia > 0
  LOOP
    INSERT INTO comissoes_liquidacoes
      (parcela_id, emprestimo_id, agente_id, tipo, valor_base, percentual, valor_comissao, mes_referencia)
    VALUES
      (NEW.id, NEW.emprestimo_id, v_config_gerente.agente_id, 'gerencia',
       v_valor_liquidado, v_config_gerente.percentual_gerencia,
       ROUND(v_valor_liquidado * v_config_gerente.percentual_gerencia / 100, 2),
       v_mes)
    ON CONFLICT (parcela_id, agente_id, tipo) DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: calcular comissão quando parcela é paga
CREATE TRIGGER trg_calcular_comissao
  AFTER UPDATE ON parcelas
  FOR EACH ROW
  WHEN (NEW.status = 'paga' AND OLD.status IS DISTINCT FROM 'paga')
  EXECUTE FUNCTION calcular_comissao_parcela();

-- ══════════════════════════════════════════════════════════════
-- 7. RLS POLICIES
-- ══════════════════════════════════════════════════════════════

ALTER TABLE agentes_comissoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE comissoes_liquidacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE gateways_pagamento ENABLE ROW LEVEL SECURITY;

-- agentes_comissoes: admin pode tudo, gerencia consulta
CREATE POLICY "agentes_comissoes_admin_full"
  ON agentes_comissoes FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "agentes_comissoes_gerencia_select"
  ON agentes_comissoes FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'gerencia'))
  );

-- comissoes_liquidacoes: gerencia e admin podem ver, admin pode atualizar status
CREATE POLICY "comissoes_liquidacoes_select"
  ON comissoes_liquidacoes FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'gerencia'))
  );

CREATE POLICY "comissoes_liquidacoes_admin_update"
  ON comissoes_liquidacoes FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Trigger insere via SECURITY DEFINER, sem necessidade de INSERT policy para users

-- gateways_pagamento: admin pode tudo, gerencia consulta
CREATE POLICY "gateways_pagamento_admin_full"
  ON gateways_pagamento FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "gateways_pagamento_gerencia_select"
  ON gateways_pagamento FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'gerencia'))
  );
