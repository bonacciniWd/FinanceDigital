-- Migration 070: Extrato consolidado da conta EFI
-- Armazena TODAS as movimentações da conta (PIX, TED, tarifas, recargas,
-- devoluções, etc.) importadas via JSON exportado do app/portal EFI.
--
-- Contexto: a API REST da EFI Bank só expõe PIX recebidos (/v2/pix) e
-- enviados (/v2/gn/pix/enviados). Para conciliação completa (incluindo
-- TED, tarifas, recargas, boletos pagos, etc.) é necessário importar o
-- extrato exportado manualmente do painel EFI até que a API Extrato
-- (produto separado) esteja habilitada.
--
-- Estrutura do JSON exportado (referência):
--   {
--     "Tipo": "Pix recebido via chave • Eco Sistem Ltda",
--     "Protocolo": 3786465238,
--     "Data": "08/04/2026",
--     "Valor": "3000,00",     // negativo = saída
--     "Saldo": "3001,25"      // saldo após o lançamento
--   }
--
-- Linhas "Saldo Diário" são informativas (saldo de abertura) e ficam
-- separadas em coluna `eh_saldo_diario` para serem ignoradas em totais.

CREATE TABLE IF NOT EXISTS extrato_movimentacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Identificação única do lançamento na EFI (deduplica reimports).
  -- NULL apenas em linhas de "Saldo Diário".
  protocolo BIGINT,
  -- Categoria normalizada derivada do campo "Tipo".
  categoria TEXT NOT NULL CHECK (categoria IN (
    'pix_recebido',
    'pix_enviado',
    'pix_devolucao_recebida',
    'pix_devolucao_enviada',
    'tarifa',
    'recarga_celular',
    'ted_recebido',
    'ted_enviado',
    'boleto_pago',
    'boleto_recebido',
    'saldo_diario',
    'outros'
  )),
  -- "entrada" para valor > 0; "saida" para valor < 0; "info" para saldo diário.
  direction TEXT NOT NULL CHECK (direction IN ('entrada','saida','info')),
  -- Texto completo do campo "Tipo" (categoria + " • " + nome contraparte).
  descricao_completa TEXT NOT NULL,
  -- Nome da contraparte extraído do "Tipo" (após " • ").
  contraparte_nome TEXT,
  -- Data do lançamento (yyyy-mm-dd).
  data DATE NOT NULL,
  -- Valor sempre positivo no nosso schema; o sinal vai para `direction`.
  valor NUMERIC(14,2) NOT NULL,
  -- Saldo da conta após o lançamento (quando informado).
  saldo_apos NUMERIC(14,2),
  -- Marca linhas "Saldo Diário" para excluir de totalizações.
  eh_saldo_diario BOOLEAN NOT NULL DEFAULT false,
  -- Origem: 'json_import' (upload manual), 'api_extrato' (futuro), 'manual' (lançamento manual).
  source TEXT NOT NULL DEFAULT 'json_import',
  -- Payload bruto do lançamento (debug/auditoria).
  raw JSONB,
  -- Auditoria.
  imported_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Deduplicação por protocolo (quando presente).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_extrato_movimentacoes_protocolo
  ON extrato_movimentacoes(protocolo)
  WHERE protocolo IS NOT NULL;

-- Saldo Diário deduplicado por data (uma linha por dia).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_extrato_movimentacoes_saldo_diario
  ON extrato_movimentacoes(data)
  WHERE eh_saldo_diario = true;

CREATE INDEX IF NOT EXISTS idx_extrato_movimentacoes_data
  ON extrato_movimentacoes(data DESC);
CREATE INDEX IF NOT EXISTS idx_extrato_movimentacoes_categoria
  ON extrato_movimentacoes(categoria);
CREATE INDEX IF NOT EXISTS idx_extrato_movimentacoes_direction
  ON extrato_movimentacoes(direction);

ALTER TABLE extrato_movimentacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "extrato_movimentacoes_select_auth" ON extrato_movimentacoes
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "extrato_movimentacoes_admin_gerencia" ON extrato_movimentacoes
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','gerencia'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','gerencia'))
  );

COMMENT ON TABLE extrato_movimentacoes IS
  'Extrato consolidado da conta EFI com TODOS os tipos de movimentação (não apenas PIX). Importado via JSON exportado do painel EFI.';
