-- ============================================================
-- Migration 082 — Interações de cliente + remoção do legado de comissões
-- ============================================================
--
-- Parte A: cria `interacoes_cliente` para rastrear quem foi o ÚLTIMO
-- usuário a tocar um cliente. Suporta a regra anti-fraude do engine de
-- comissões: "o cliente que deu baixa, está no kanban habilitado pra
-- ele? Se sim, soma pra ele. Se não, soma pro último que interagiu
-- com o cliente."
--
-- Parte B: remove a tabela `comissoes_semanais_config` (substituída
-- por `comissoes_config` na migration 081). Os dados foram migrados
-- manualmente pelo admin antes deste push.
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- PARTE A — Interações de cliente
-- ──────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tipo_interacao_cliente') THEN
    CREATE TYPE tipo_interacao_cliente AS ENUM (
      'kanban_contato',         -- registrou tentativa/contato no kanban
      'kanban_responsavel',     -- atribuiu/mudou responsável do card
      'kanban_movimento',       -- moveu card de etapa
      'acordo_criado',          -- fechou acordo com o cliente
      'acordo_quebrado',
      'acordo_cancelado',
      'emprestimo_criado',      -- cadastrou empréstimo
      'emprestimo_quitado',
      'parcela_paga',           -- registrou baixa de parcela
      'mensagem_enviada',       -- enviou WhatsApp/mensagem
      'nota'                    -- observação manual
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS interacoes_cliente (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id   UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo         tipo_interacao_cliente NOT NULL,
  ref_tabela   TEXT,                       -- ex: 'parcelas', 'acordos', 'emprestimos'
  ref_id       UUID,                       -- id na tabela de referência
  detalhe      TEXT,                       -- texto livre opcional
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS interacoes_cliente_cliente_idx
  ON interacoes_cliente (cliente_id, created_at DESC);

CREATE INDEX IF NOT EXISTS interacoes_cliente_user_idx
  ON interacoes_cliente (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS interacoes_cliente_tipo_idx
  ON interacoes_cliente (tipo);

-- RLS
ALTER TABLE interacoes_cliente ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "interacoes_cliente select autenticados" ON interacoes_cliente;
CREATE POLICY "interacoes_cliente select autenticados"
  ON interacoes_cliente
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "interacoes_cliente insert autenticados" ON interacoes_cliente;
CREATE POLICY "interacoes_cliente insert autenticados"
  ON interacoes_cliente
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "interacoes_cliente delete admin" ON interacoes_cliente;
CREATE POLICY "interacoes_cliente delete admin"
  ON interacoes_cliente
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'gerencia')
    )
  );

COMMENT ON TABLE interacoes_cliente IS
  'Log de interações user↔cliente. Usado pelo engine de comissões para resolver "último que interagiu".';

-- ──────────────────────────────────────────────────────────────
-- PARTE B — Remoção do legado `comissoes_semanais_config`
-- ──────────────────────────────────────────────────────────────
-- Os dados foram migrados manualmente pelo admin para `comissoes_config`
-- (migration 081) antes deste push. Se ainda houver linhas relevantes,
-- ROLE BACK e migre antes de aplicar.

DROP TABLE IF EXISTS comissoes_semanais_config CASCADE;

-- Limpa tipos enum órfãos eventualmente criados pela tabela antiga
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tipo_comissao_semanal') THEN
    DROP TYPE tipo_comissao_semanal;
  END IF;
END $$;
