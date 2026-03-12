-- Migration 006: Etiquetas (tags) para conversas WhatsApp e vinculação conversa↔cliente
-- Permite categorizar conversas com tags coloridas e associar um número a um cliente.

-- ── Tabela de etiquetas (tags) ──────────────────────────
CREATE TABLE IF NOT EXISTS etiquetas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  cor TEXT NOT NULL DEFAULT '#6366f1',   -- hex color (indigo default)
  descricao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index para busca por nome
CREATE INDEX IF NOT EXISTS idx_etiquetas_nome ON etiquetas(nome);

-- ── Relação N:N entre conversas e etiquetas ─────────────
-- Uma conversa é identificada por (telefone, instancia_id).
CREATE TABLE IF NOT EXISTS conversa_etiquetas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telefone TEXT NOT NULL,
  instancia_id UUID REFERENCES whatsapp_instancias(id) ON DELETE CASCADE,
  etiqueta_id UUID NOT NULL REFERENCES etiquetas(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(telefone, instancia_id, etiqueta_id)
);

CREATE INDEX IF NOT EXISTS idx_conversa_etiquetas_telefone ON conversa_etiquetas(telefone, instancia_id);
CREATE INDEX IF NOT EXISTS idx_conversa_etiquetas_etiqueta ON conversa_etiquetas(etiqueta_id);

-- ── Vinculação conversa ↔ cliente ───────────────────────
-- Permite associar um telefone de conversa a um cliente do sistema.
-- Uma conversa pode ter no máximo 1 cliente vinculado.
CREATE TABLE IF NOT EXISTS conversa_cliente (
  telefone TEXT NOT NULL,
  instancia_id UUID NOT NULL REFERENCES whatsapp_instancias(id) ON DELETE CASCADE,
  cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (telefone, instancia_id)
);

CREATE INDEX IF NOT EXISTS idx_conversa_cliente_cliente ON conversa_cliente(cliente_id);

-- ── RLS ─────────────────────────────────────────────────
ALTER TABLE etiquetas ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversa_etiquetas ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversa_cliente ENABLE ROW LEVEL SECURITY;

-- Etiquetas: qualquer autenticado pode ver, admin/gerência pode criar/editar/deletar
CREATE POLICY etiquetas_select ON etiquetas FOR SELECT TO authenticated USING (true);
CREATE POLICY etiquetas_insert ON etiquetas FOR INSERT TO authenticated
  WITH CHECK (auth_role() IN ('admin', 'gerencia'));
CREATE POLICY etiquetas_update ON etiquetas FOR UPDATE TO authenticated
  USING (auth_role() IN ('admin', 'gerencia'));
CREATE POLICY etiquetas_delete ON etiquetas FOR DELETE TO authenticated
  USING (auth_role() = 'admin');

-- Conversa ↔ etiqueta: qualquer autenticado (ops) pode ver e vincular
CREATE POLICY conversa_etiquetas_select ON conversa_etiquetas FOR SELECT TO authenticated USING (true);
CREATE POLICY conversa_etiquetas_insert ON conversa_etiquetas FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY conversa_etiquetas_update ON conversa_etiquetas FOR UPDATE TO authenticated USING (true);
CREATE POLICY conversa_etiquetas_delete ON conversa_etiquetas FOR DELETE TO authenticated USING (true);

-- Conversa ↔ cliente: qualquer autenticado pode ver e vincular
CREATE POLICY conversa_cliente_select ON conversa_cliente FOR SELECT TO authenticated USING (true);
CREATE POLICY conversa_cliente_insert ON conversa_cliente FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY conversa_cliente_update ON conversa_cliente FOR UPDATE TO authenticated USING (true);
CREATE POLICY conversa_cliente_delete ON conversa_cliente FOR DELETE TO authenticated USING (true);

-- ── Etiquetas padrão ────────────────────────────────────
INSERT INTO etiquetas (nome, cor, descricao) VALUES
  ('Novo Lead', '#22c55e', 'Primeiro contato, ainda não qualificado'),
  ('Negociação', '#f59e0b', 'Em processo de negociação'),
  ('Cobrança', '#ef4444', 'Cliente em cobrança ativa'),
  ('Suporte', '#3b82f6', 'Atendimento de suporte'),
  ('VIP', '#8b5cf6', 'Cliente prioritário'),
  ('Finalizado', '#6b7280', 'Atendimento encerrado')
ON CONFLICT DO NOTHING;
