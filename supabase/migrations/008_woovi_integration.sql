-- ============================================================
-- Migration 008: Integração Woovi (Gateway de Pagamentos)
-- ============================================================
-- Tabelas para gestão de cobranças, transações Pix, subcontas
-- de indicadores e controle de saldo via API Woovi.
-- ============================================================

-- ── Enums ──────────────────────────────────────────────────

CREATE TYPE woovi_charge_status AS ENUM (
  'ACTIVE',           -- Cobrança criada, aguardando pagamento
  'COMPLETED',        -- Paga
  'EXPIRED',          -- Expirada sem pagamento
  'ERROR'             -- Erro na criação
);

CREATE TYPE woovi_transaction_status AS ENUM (
  'PENDING',          -- Transferência pendente
  'CONFIRMED',        -- Confirmada
  'FAILED',           -- Falhou
  'REFUNDED'          -- Estornada
);

CREATE TYPE woovi_transaction_type AS ENUM (
  'CHARGE',           -- Cobrança (recebimento de parcela)
  'PAYMENT',          -- Pagamento Pix (liberação de empréstimo)
  'SPLIT',            -- Repasse de comissão
  'WITHDRAWAL'        -- Saque de subconta
);

-- ── Tabela: woovi_charges (Cobranças) ──────────────────────

CREATE TABLE IF NOT EXISTS woovi_charges (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  parcela_id      UUID        REFERENCES parcelas(id) ON DELETE SET NULL,
  emprestimo_id   UUID        REFERENCES emprestimos(id) ON DELETE SET NULL,
  cliente_id      UUID        REFERENCES clientes(id) ON DELETE SET NULL,

  -- Dados da Woovi
  woovi_charge_id   TEXT      NOT NULL UNIQUE,   -- correlationID / charge ID da Woovi
  woovi_txid        TEXT,                         -- txid do Pix
  valor             NUMERIC(12,2) NOT NULL,
  status            woovi_charge_status NOT NULL DEFAULT 'ACTIVE',

  -- Pix / Boleto
  br_code           TEXT,         -- Pix copia-e-cola
  qr_code_image     TEXT,         -- URL da imagem do QR Code
  payment_link      TEXT,         -- Link de pagamento
  expiration_date   TIMESTAMPTZ,  -- Data de expiração

  -- Split (quando aplicável)
  split_indicador_id UUID      REFERENCES clientes(id) ON DELETE SET NULL,
  split_valor        NUMERIC(12,2),

  -- Timestamps
  paid_at           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX idx_woovi_charges_parcela ON woovi_charges(parcela_id);
CREATE INDEX idx_woovi_charges_cliente ON woovi_charges(cliente_id);
CREATE INDEX idx_woovi_charges_status ON woovi_charges(status);
CREATE INDEX idx_woovi_charges_woovi_id ON woovi_charges(woovi_charge_id);

-- ── Tabela: woovi_transactions (Transações Pix) ───────────

CREATE TABLE IF NOT EXISTS woovi_transactions (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  emprestimo_id    UUID         REFERENCES emprestimos(id) ON DELETE SET NULL,
  cliente_id       UUID         REFERENCES clientes(id) ON DELETE SET NULL,
  charge_id        UUID         REFERENCES woovi_charges(id) ON DELETE SET NULL,

  -- Dados da transação
  woovi_transaction_id TEXT     UNIQUE,
  tipo              woovi_transaction_type NOT NULL,
  valor             NUMERIC(12,2) NOT NULL,
  status            woovi_transaction_status NOT NULL DEFAULT 'PENDING',

  -- Pix Out (liberação de empréstimo)
  pix_key           TEXT,           -- Chave Pix do destinatário
  pix_key_type      TEXT,           -- CPF, CNPJ, EMAIL, PHONE, RANDOM
  destinatario_nome TEXT,
  end_to_end_id     TEXT,           -- EndToEndId do Pix

  -- Metadata
  descricao         TEXT,
  metadata          JSONB          DEFAULT '{}',

  -- Timestamps
  confirmed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ    NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE INDEX idx_woovi_tx_emprestimo ON woovi_transactions(emprestimo_id);
CREATE INDEX idx_woovi_tx_cliente ON woovi_transactions(cliente_id);
CREATE INDEX idx_woovi_tx_tipo ON woovi_transactions(tipo);
CREATE INDEX idx_woovi_tx_status ON woovi_transactions(status);

-- ── Tabela: woovi_subaccounts (Subcontas de Indicadores) ───

CREATE TABLE IF NOT EXISTS woovi_subaccounts (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id       UUID         NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  user_id          UUID         REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Dados da Woovi
  woovi_account_id   TEXT       NOT NULL UNIQUE,   -- ID da subconta na Woovi
  woovi_pix_key      TEXT,                          -- Chave Pix da subconta

  -- Dados bancários para saque
  nome             TEXT         NOT NULL,
  documento        TEXT,         -- CPF/CNPJ
  banco            TEXT,
  agencia          TEXT,
  conta            TEXT,
  tipo_conta       TEXT,         -- corrente / poupanca

  -- Saldo cacheado (atualizado via webhook/polling)
  saldo            NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_recebido   NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_sacado     NUMERIC(12,2) NOT NULL DEFAULT 0,

  ativo            BOOLEAN      NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_woovi_sub_cliente ON woovi_subaccounts(cliente_id);
CREATE INDEX idx_woovi_sub_user ON woovi_subaccounts(user_id);
CREATE INDEX idx_woovi_sub_ativo ON woovi_subaccounts(ativo);

-- ── Tabela: woovi_webhooks_log (Log de webhooks) ───────────

CREATE TABLE IF NOT EXISTS woovi_webhooks_log (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type       TEXT         NOT NULL,           -- charge.completed, pix.sent, etc.
  payload          JSONB        NOT NULL DEFAULT '{}',
  processed        BOOLEAN      NOT NULL DEFAULT false,
  error_message    TEXT,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_woovi_webhook_event ON woovi_webhooks_log(event_type);
CREATE INDEX idx_woovi_webhook_processed ON woovi_webhooks_log(processed);

-- ── Coluna extra na tabela parcelas ────────────────────────

ALTER TABLE parcelas
  ADD COLUMN IF NOT EXISTS woovi_charge_id TEXT;

-- ── Coluna extra na tabela clientes (chave Pix) ───────────

ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS pix_key TEXT,
  ADD COLUMN IF NOT EXISTS pix_key_type TEXT;

-- ── RLS ────────────────────────────────────────────────────

ALTER TABLE woovi_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE woovi_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE woovi_subaccounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE woovi_webhooks_log ENABLE ROW LEVEL SECURITY;

-- woovi_charges
CREATE POLICY woovi_charges_select ON woovi_charges
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY woovi_charges_insert ON woovi_charges
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'gerencia'))
  );
CREATE POLICY woovi_charges_update ON woovi_charges
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'gerencia', 'cobranca'))
  );

-- woovi_transactions
CREATE POLICY woovi_tx_select ON woovi_transactions
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY woovi_tx_insert ON woovi_transactions
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'gerencia'))
  );

-- woovi_subaccounts
CREATE POLICY woovi_sub_select ON woovi_subaccounts
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY woovi_sub_insert ON woovi_subaccounts
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'gerencia'))
  );
CREATE POLICY woovi_sub_update ON woovi_subaccounts
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'gerencia'))
  );

-- woovi_webhooks_log (service role only via edge function, select for admin)
CREATE POLICY woovi_webhook_select ON woovi_webhooks_log
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin'))
  );

-- ── Trigger: updated_at automático ─────────────────────────

CREATE OR REPLACE FUNCTION update_woovi_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER woovi_charges_updated_at
  BEFORE UPDATE ON woovi_charges
  FOR EACH ROW EXECUTE FUNCTION update_woovi_updated_at();

CREATE TRIGGER woovi_transactions_updated_at
  BEFORE UPDATE ON woovi_transactions
  FOR EACH ROW EXECUTE FUNCTION update_woovi_updated_at();

CREATE TRIGGER woovi_subaccounts_updated_at
  BEFORE UPDATE ON woovi_subaccounts
  FOR EACH ROW EXECUTE FUNCTION update_woovi_updated_at();

-- ── RPC: Saldo consolidado da conta Woovi ──────────────────

CREATE OR REPLACE FUNCTION get_woovi_dashboard_stats()
RETURNS JSON
LANGUAGE sql
STABLE
AS $$
  SELECT json_build_object(
    'total_charges',        (SELECT count(*) FROM woovi_charges),
    'charges_active',       (SELECT count(*) FROM woovi_charges WHERE status = 'ACTIVE'),
    'charges_completed',    (SELECT count(*) FROM woovi_charges WHERE status = 'COMPLETED'),
    'charges_expired',      (SELECT count(*) FROM woovi_charges WHERE status = 'EXPIRED'),
    'total_recebido',       COALESCE((SELECT sum(valor) FROM woovi_charges WHERE status = 'COMPLETED'), 0),
    'total_transferido',    COALESCE((SELECT sum(valor) FROM woovi_transactions WHERE tipo = 'PAYMENT' AND status = 'CONFIRMED'), 0),
    'total_split',          COALESCE((SELECT sum(valor) FROM woovi_transactions WHERE tipo = 'SPLIT' AND status = 'CONFIRMED'), 0),
    'total_subcontas',      (SELECT count(*) FROM woovi_subaccounts WHERE ativo = true),
    'total_webhooks',       (SELECT count(*) FROM woovi_webhooks_log),
    'webhooks_com_erro',    (SELECT count(*) FROM woovi_webhooks_log WHERE processed = false AND error_message IS NOT NULL)
  );
$$;
