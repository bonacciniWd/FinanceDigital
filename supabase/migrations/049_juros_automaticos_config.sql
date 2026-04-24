-- =====================================================================
-- 049_juros_automaticos_config.sql
-- Torna configuráveis os parâmetros de juros automáticos por atraso.
-- Chaves inseridas em configuracoes_sistema:
--   juros_fixo_dia  (R$/dia para dívidas abaixo do limiar)
--   juros_perc_dia  (fração por dia, ex.: 0.10 = 10%)
--   juros_limiar    (R$ que separa regra fixa da percentual)
--   juros_dias_max  (dias máximos de acumulação)
-- Somente inseridas se ainda não existirem (idempotente).
-- =====================================================================

INSERT INTO configuracoes_sistema (chave, valor, descricao)
VALUES
  ('juros_fixo_dia', '100'::jsonb, 'Juros automáticos: valor fixo R$/dia para dívidas abaixo do limiar'),
  ('juros_perc_dia', '0.10'::jsonb, 'Juros automáticos: fração do valor original por dia (0.10 = 10%)'),
  ('juros_limiar',   '1000'::jsonb, 'Juros automáticos: valor em R$ que separa regra fixa da percentual'),
  ('juros_dias_max', '365'::jsonb,  'Juros automáticos: dias máximos de acumulação (após isso, juros param de correr)')
ON CONFLICT (chave) DO NOTHING;
