-- ============================================================
-- Migration 086: Timeline unificada de interações por cliente
-- ============================================================
-- Centraliza, em uma única tabela, eventos relevantes para
-- cobrança/relacionamento:
--   • mensagens WhatsApp enviadas pelo sistema
--   • mudanças de etapa no kanban_cobranca
--   • criação/quebra/quitação de acordos
--   • pagamentos registrados
--   • observações manuais (anotação livre por operador)
--
-- Triggers preenchem automaticamente para reduzir trabalho do
-- frontend e garantir consistência. Realtime habilitado para
-- push instantâneo (zero polling no Kanban/ClienteModal).
-- ============================================================

-- ── Enum de tipos ────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE timeline_tipo AS ENUM (
    'whatsapp',
    'ligacao',
    'visita',
    'email',
    'mudanca_etapa',
    'acordo_criado',
    'acordo_quebrado',
    'acordo_quitado',
    'pagamento',
    'observacao'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Tabela ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS timeline_interacoes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  cliente_id      UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  emprestimo_id   UUID REFERENCES emprestimos(id) ON DELETE SET NULL,
  acordo_id       UUID REFERENCES acordos(id) ON DELETE SET NULL,

  tipo            timeline_tipo NOT NULL,
  titulo          TEXT NOT NULL,
  descricao       TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Quem registrou (NULL = sistema)
  created_by      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_timeline_cliente    ON timeline_interacoes(cliente_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_timeline_emprestimo ON timeline_interacoes(emprestimo_id);
CREATE INDEX IF NOT EXISTS idx_timeline_acordo     ON timeline_interacoes(acordo_id);
CREATE INDEX IF NOT EXISTS idx_timeline_tipo       ON timeline_interacoes(tipo);
CREATE INDEX IF NOT EXISTS idx_timeline_created_at ON timeline_interacoes(created_at DESC);

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE timeline_interacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY timeline_select ON timeline_interacoes
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY timeline_insert ON timeline_interacoes
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL OR current_setting('role') = 'service_role');

CREATE POLICY timeline_update ON timeline_interacoes
  FOR UPDATE USING (
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','gerencia'))
  );

CREATE POLICY timeline_delete ON timeline_interacoes
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','gerencia'))
  );

-- ── Realtime ─────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'timeline_interacoes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE timeline_interacoes;
  END IF;
END $$;

-- ============================================================
-- TRIGGERS de preenchimento automático
-- ============================================================

-- ── 1) WhatsApp enviado (apenas saídas, evita ruído de entrada)
CREATE OR REPLACE FUNCTION trg_timeline_from_whatsapp()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.cliente_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.direcao NOT IN ('saida','enviada') THEN RETURN NEW; END IF;

  INSERT INTO timeline_interacoes (cliente_id, tipo, titulo, descricao, metadata)
  VALUES (
    NEW.cliente_id,
    'whatsapp',
    'WhatsApp enviado',
    LEFT(COALESCE(NEW.conteudo, ''), 280),
    jsonb_build_object(
      'instancia_id', NEW.instancia_id,
      'telefone', NEW.telefone,
      'tipo', NEW.tipo,
      'status', NEW.status,
      'message_id_wpp', NEW.message_id_wpp,
      'log_id', NEW.id
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_whatsapp_to_timeline ON whatsapp_mensagens_log;
CREATE TRIGGER trg_whatsapp_to_timeline
  AFTER INSERT ON whatsapp_mensagens_log
  FOR EACH ROW EXECUTE FUNCTION trg_timeline_from_whatsapp();

-- ── 2) Mudança de etapa no kanban_cobranca
CREATE OR REPLACE FUNCTION trg_timeline_from_kanban()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.etapa IS DISTINCT FROM NEW.etapa THEN
    INSERT INTO timeline_interacoes (cliente_id, tipo, titulo, descricao, metadata)
    VALUES (
      NEW.cliente_id,
      'mudanca_etapa',
      'Etapa alterada',
      format('%s → %s', OLD.etapa, NEW.etapa),
      jsonb_build_object(
        'de', OLD.etapa,
        'para', NEW.etapa,
        'kanban_card_id', NEW.id,
        'responsavel_id', NEW.responsavel_id
      )
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_kanban_etapa_to_timeline ON kanban_cobranca;
CREATE TRIGGER trg_kanban_etapa_to_timeline
  AFTER UPDATE ON kanban_cobranca
  FOR EACH ROW EXECUTE FUNCTION trg_timeline_from_kanban();

-- ── 3) Acordos: criado / quebrado / quitado
CREATE OR REPLACE FUNCTION trg_timeline_from_acordo()
RETURNS TRIGGER AS $$
DECLARE
  v_tipo  timeline_tipo;
  v_title TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO timeline_interacoes (cliente_id, acordo_id, tipo, titulo, descricao, metadata, created_by)
    VALUES (
      NEW.cliente_id,
      NEW.id,
      'acordo_criado',
      'Acordo criado',
      format('Entrada %s · %s parcelas de %s', NEW.valor_entrada::text, NEW.num_parcelas, NEW.valor_parcela::text),
      jsonb_build_object(
        'valor_divida_original', NEW.valor_divida_original,
        'valor_entrada', NEW.valor_entrada,
        'num_parcelas', NEW.num_parcelas,
        'valor_parcela', NEW.valor_parcela,
        'origem', NEW.origem
      ),
      NEW.criado_por
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.status = 'quebrado' THEN
      v_tipo := 'acordo_quebrado'; v_title := 'Acordo quebrado';
    ELSIF NEW.status = 'quitado' THEN
      v_tipo := 'acordo_quitado'; v_title := 'Acordo quitado';
    ELSE
      RETURN NEW;
    END IF;

    INSERT INTO timeline_interacoes (cliente_id, acordo_id, tipo, titulo, descricao, metadata)
    VALUES (
      NEW.cliente_id, NEW.id, v_tipo, v_title,
      format('Status: %s → %s', OLD.status, NEW.status),
      jsonb_build_object('de', OLD.status, 'para', NEW.status)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_acordo_to_timeline ON acordos;
CREATE TRIGGER trg_acordo_to_timeline
  AFTER INSERT OR UPDATE ON acordos
  FOR EACH ROW EXECUTE FUNCTION trg_timeline_from_acordo();

-- ── 4) Pagamentos (parcelas marcadas como pagas)
CREATE OR REPLACE FUNCTION trg_timeline_from_parcela_paga()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'paga' THEN
    INSERT INTO timeline_interacoes (cliente_id, emprestimo_id, acordo_id, tipo, titulo, descricao, metadata)
    VALUES (
      NEW.cliente_id,
      NEW.emprestimo_id,
      NEW.acordo_id,
      'pagamento',
      format('Pagamento parcela #%s', NEW.numero),
      format('Valor: R$ %s', NEW.valor::text),
      jsonb_build_object(
        'parcela_id', NEW.id,
        'numero', NEW.numero,
        'valor', NEW.valor,
        'data_pagamento', NEW.data_pagamento
      )
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_parcela_paga_to_timeline ON parcelas;
CREATE TRIGGER trg_parcela_paga_to_timeline
  AFTER UPDATE ON parcelas
  FOR EACH ROW EXECUTE FUNCTION trg_timeline_from_parcela_paga();
