-- ============================================================
-- Migration 087: Agendamento inteligente de cobrança
-- ============================================================
-- Permite configurar regras de disparo automático de mensagens
-- de cobrança com controle de:
--   • horário permitido (inicio/fim) e fuso horário
--   • dias da semana permitidos
--   • janelas de atraso (min/max dias) que ativam a regra
--   • template usado e instância de envio
--   • intervalo mínimo entre re-envios para o mesmo cliente
--   • limite de disparos por dia (anti-spam global e por cliente)
--
-- Uma fila (`cobranca_fila`) materializa disparos pendentes;
-- a edge function `processar-fila-cobranca` (chamada por
-- pg_cron a cada 5 min) consome a fila respeitando as regras.
-- ============================================================

-- ── Enum status fila ─────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE cobranca_fila_status AS ENUM (
    'pendente','enviando','enviado','falha','cancelado','fora_horario'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Tabela: regras / agendamentos ────────────────────────────
CREATE TABLE IF NOT EXISTS cobranca_agendamentos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  nome            TEXT NOT NULL,
  descricao       TEXT,
  ativo           BOOLEAN NOT NULL DEFAULT true,
  prioridade      INTEGER NOT NULL DEFAULT 0,

  -- Janela de atraso: cliente com dias_atraso em [min, max] (inclusive) é elegível
  dias_atraso_min INTEGER NOT NULL DEFAULT 0,
  dias_atraso_max INTEGER NOT NULL DEFAULT 365,

  -- Template usado + categoria (para auditoria)
  template_id     UUID REFERENCES templates_whatsapp(id) ON DELETE SET NULL,

  -- Instância padrão (NULL = usa a do responsável/cobrador)
  instancia_id    UUID REFERENCES whatsapp_instancias(id) ON DELETE SET NULL,

  -- Janela de horário (timezone Brasil — armazenado como TIME local)
  horario_inicio  TIME NOT NULL DEFAULT '09:00',
  horario_fim     TIME NOT NULL DEFAULT '18:00',
  timezone        TEXT NOT NULL DEFAULT 'America/Sao_Paulo',

  -- Dias da semana (ISO: 1=segunda ... 7=domingo)
  dias_semana     INTEGER[] NOT NULL DEFAULT ARRAY[1,2,3,4,5],

  -- Anti-spam por cliente
  intervalo_min_horas      INTEGER NOT NULL DEFAULT 24,
  max_disparos_por_dia_cli INTEGER NOT NULL DEFAULT 1,

  -- Limites globais
  max_disparos_por_hora    INTEGER NOT NULL DEFAULT 60,
  max_disparos_por_dia     INTEGER NOT NULL DEFAULT 500,

  -- Estatísticas
  total_disparos  INTEGER NOT NULL DEFAULT 0,

  created_by      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cobranca_ag_ativo      ON cobranca_agendamentos(ativo);
CREATE INDEX IF NOT EXISTS idx_cobranca_ag_prioridade ON cobranca_agendamentos(prioridade DESC);

CREATE TRIGGER cobranca_ag_updated_at
  BEFORE UPDATE ON cobranca_agendamentos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Tabela: fila de disparos ────────────────────────────────
CREATE TABLE IF NOT EXISTS cobranca_fila (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  agendamento_id  UUID REFERENCES cobranca_agendamentos(id) ON DELETE SET NULL,
  cliente_id      UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  emprestimo_id   UUID REFERENCES emprestimos(id) ON DELETE SET NULL,
  parcela_id      UUID REFERENCES parcelas(id) ON DELETE SET NULL,

  template_id     UUID REFERENCES templates_whatsapp(id) ON DELETE SET NULL,
  instancia_id    UUID REFERENCES whatsapp_instancias(id) ON DELETE SET NULL,

  telefone        TEXT NOT NULL,
  mensagem        TEXT NOT NULL,

  agendado_para   TIMESTAMPTZ NOT NULL DEFAULT now(),
  enviado_em      TIMESTAMPTZ,

  status          cobranca_fila_status NOT NULL DEFAULT 'pendente',
  tentativas      INTEGER NOT NULL DEFAULT 0,
  ultimo_erro     TEXT,

  log_id          UUID REFERENCES whatsapp_mensagens_log(id) ON DELETE SET NULL,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cobranca_fila_status_data ON cobranca_fila(status, agendado_para)
  WHERE status IN ('pendente','fora_horario');
CREATE INDEX IF NOT EXISTS idx_cobranca_fila_cliente     ON cobranca_fila(cliente_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cobranca_fila_agendamento ON cobranca_fila(agendamento_id);

CREATE TRIGGER cobranca_fila_updated_at
  BEFORE UPDATE ON cobranca_fila
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE cobranca_agendamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE cobranca_fila         ENABLE ROW LEVEL SECURITY;

CREATE POLICY cobranca_ag_select ON cobranca_agendamentos
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY cobranca_ag_write ON cobranca_agendamentos
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','gerencia'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','gerencia'))
  );

CREATE POLICY cobranca_fila_select ON cobranca_fila
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY cobranca_fila_insert ON cobranca_fila
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','gerencia','cobranca'))
  );
CREATE POLICY cobranca_fila_update ON cobranca_fila
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','gerencia','cobranca'))
  );
CREATE POLICY cobranca_fila_delete ON cobranca_fila
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','gerencia'))
  );

-- ── Realtime ─────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'cobranca_agendamentos') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE cobranca_agendamentos;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'cobranca_fila') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE cobranca_fila;
  END IF;
END $$;

-- ── Helper: verifica se "now" está dentro da janela de um agendamento
CREATE OR REPLACE FUNCTION cobranca_ag_em_janela(ag cobranca_agendamentos, ts TIMESTAMPTZ DEFAULT now())
RETURNS BOOLEAN AS $$
DECLARE
  local_ts TIMESTAMP;
  dow      INTEGER;
  hora     TIME;
BEGIN
  local_ts := ts AT TIME ZONE ag.timezone;
  dow := EXTRACT(ISODOW FROM local_ts)::INTEGER;
  hora := local_ts::TIME;

  RETURN ag.ativo
    AND dow = ANY(ag.dias_semana)
    AND hora >= ag.horario_inicio
    AND hora <= ag.horario_fim;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ── Seed: regras padrão (operador pode desativar/editar) ─────
INSERT INTO cobranca_agendamentos (nome, descricao, dias_atraso_min, dias_atraso_max, prioridade, ativo)
VALUES
  ('Lembrete (0d a vencer hoje)',  'Disparo único de lembrete para parcelas que vencem hoje',     0,   0, 100, false),
  ('Cobrança N1 (1-7d)',           'Primeira cobrança após vencimento',                            1,   7,  90, false),
  ('Cobrança N2 (8-15d)',          'Cobrança intermediária com tom mais firme',                    8,  15,  80, false),
  ('Cobrança N3 (16-30d)',         'Cobrança escalada — possível negativação',                    16,  30,  70, false),
  ('Cobrança N4 (31-90d)',         'Última cobrança antes de jurídico',                           31,  90,  60, false)
ON CONFLICT DO NOTHING;
