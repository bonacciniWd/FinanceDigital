-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  Migration 047 — Valor total a receber e valor de parcela manual         ║
-- ║  em analises_credito                                                     ║
-- ║                                                                          ║
-- ║  Objetivo:                                                               ║
-- ║  • Separar "valor solicitado" (PIX que sai para o cliente) do            ║
-- ║    "valor total a receber" (quanto a empresa recebe de volta).           ║
-- ║  • Permitir definir manualmente o valor de cada parcela, já que nem      ║
-- ║    sempre é fixo (às vezes cobramos mais, outras menos).                 ║
-- ║  • Colunas são opcionais (NULL) para não quebrar análises existentes.    ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

ALTER TABLE public.analises_credito
  ADD COLUMN IF NOT EXISTS valor_total_receber numeric,
  ADD COLUMN IF NOT EXISTS valor_parcela numeric;

COMMENT ON COLUMN public.analises_credito.valor_total_receber IS
  'Valor total que a empresa receberá do cliente ao final do contrato (principal + lucro/juros embutidos). Se NULL, considera igual a valor_solicitado (sem lucro embutido); juros de mora são aplicados apenas em caso de atraso.';

COMMENT ON COLUMN public.analises_credito.valor_parcela IS
  'Valor manual de cada parcela. Se NULL, o approve-credit calcula via tabela Price ou divisão simples.';
