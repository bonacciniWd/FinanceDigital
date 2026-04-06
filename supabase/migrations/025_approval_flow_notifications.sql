-- ============================================================
-- Migration 025: Fluxo de aprovação completo + notificações WhatsApp
--
-- 1. Adiciona campos de configuração de parcelas em analises_credito
-- 2. Adiciona conceito de instância sistema em whatsapp_instancias
-- 3. Cria tabela notificacoes_log para evitar duplicidade
-- 4. Adiciona coluna data_resultado em analises_credito
-- ============================================================

-- ── 1. Novos campos em analises_credito ──────────────────

ALTER TABLE analises_credito
  ADD COLUMN IF NOT EXISTS numero_parcelas INTEGER,
  ADD COLUMN IF NOT EXISTS periodicidade VARCHAR(20) DEFAULT 'mensal',
  ADD COLUMN IF NOT EXISTS dia_pagamento INTEGER,
  ADD COLUMN IF NOT EXISTS data_resultado TIMESTAMPTZ;

COMMENT ON COLUMN analises_credito.numero_parcelas IS 'Quantidade de parcelas desejadas pelo cliente';
COMMENT ON COLUMN analises_credito.periodicidade IS 'Frequência: semanal, quinzenal, mensal';
COMMENT ON COLUMN analises_credito.dia_pagamento IS 'Dia do pagamento: 0-6 (dom-sab) para semanal, 1-31 para mensal';
COMMENT ON COLUMN analises_credito.data_resultado IS 'Data/hora em que a análise foi aprovada ou recusada';

-- ── 2. Instância sistema do WhatsApp ─────────────────────

ALTER TABLE whatsapp_instancias
  ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN whatsapp_instancias.is_system IS 'Se true, é a instância fixa do sistema usada para notificações automáticas';

-- Garantir que só exista UMA instância sistema
CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_instancias_system
  ON whatsapp_instancias (is_system) WHERE is_system = true;

-- ── 3. Tabela de log de notificações ─────────────────────

CREATE TABLE IF NOT EXISTS notificacoes_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parcela_id      UUID REFERENCES parcelas(id) ON DELETE CASCADE,
  emprestimo_id   UUID REFERENCES emprestimos(id) ON DELETE CASCADE,
  cliente_id      UUID REFERENCES clientes(id) ON DELETE CASCADE,
  tipo            VARCHAR(50) NOT NULL,  -- aprovacao, reprovacao, lembrete_3dias, lembrete_vespera, vencida_ontem
  telefone        TEXT,
  mensagem        TEXT,
  status          VARCHAR(20) NOT NULL DEFAULT 'enviado', -- enviado, erro
  erro_detalhe    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notificacoes_parcela ON notificacoes_log(parcela_id);
CREATE INDEX IF NOT EXISTS idx_notificacoes_tipo_data ON notificacoes_log(tipo, created_at);
CREATE INDEX IF NOT EXISTS idx_notificacoes_cliente ON notificacoes_log(cliente_id);

-- RLS para notificacoes_log
ALTER TABLE notificacoes_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notificacoes_select" ON notificacoes_log
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "notificacoes_insert" ON notificacoes_log
  FOR INSERT WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'gerencia')
  );

-- Edge functions usam service role, então RLS não bloqueia inserts automáticos

-- ── 4. Garantir que emprestimos tenha colunas extras ─────
-- (As colunas vendedor_id, cobrador_id, aprovado_por, aprovado_em, analise_id, gateway
--  já foram adicionadas na migration 023. Verificamos por segurança.)

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'emprestimos' AND column_name = 'data_contratacao') THEN
    -- Alias: data_contrato já existe no schema base. Não precisamos de data_contratacao separado.
    -- O approve-credit usava data_contratacao mas a coluna real é data_contrato.
    NULL;
  END IF;
END $$;
