-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  Migration 024 — Comissão de Gerência                                 ║
-- ║                                                                        ║
-- ║  1. Adiciona percentual_gerencia na tabela agentes_comissoes           ║
-- ║  2. Atualiza trigger para calcular comissão de gerentes ativos         ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ══════════════════════════════════════════════════════════════
-- 1. NOVA COLUNA: percentual_gerencia
-- ══════════════════════════════════════════════════════════════

ALTER TABLE agentes_comissoes
  ADD COLUMN IF NOT EXISTS percentual_gerencia NUMERIC(5,2) NOT NULL DEFAULT 0
    CHECK (percentual_gerencia >= 0 AND percentual_gerencia <= 100);

COMMENT ON COLUMN agentes_comissoes.percentual_gerencia IS '% sobre o valor da parcela liquidada para o gerente';

-- ══════════════════════════════════════════════════════════════
-- 2. TRIGGER ATUALIZADO: inclui comissão de gerência
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

  -- Comissão do gerente (% sobre valor da parcela liquidada)
  -- Busca todos os gerentes com percentual_gerencia > 0
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
