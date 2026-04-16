-- Tabela para rastrear sessões ativas de fluxos de chatbot.
-- Cada telefone pode ter no máximo uma sessão ativa por instância.

CREATE TABLE chatbot_sessoes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instancia_id    UUID NOT NULL REFERENCES whatsapp_instancias(id) ON DELETE CASCADE,
  fluxo_id        UUID NOT NULL REFERENCES fluxos_chatbot(id) ON DELETE CASCADE,
  etapa_atual_id  UUID REFERENCES fluxos_chatbot_etapas(id) ON DELETE SET NULL,
  telefone        TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'aguardando_resposta', 'espera', 'finalizado')),
  contexto        JSONB DEFAULT '{}',   -- variáveis coletadas: {resposta, nome, ...}
  espera_ate      TIMESTAMPTZ,          -- se status='espera', quando retomar
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Uma sessão ativa por telefone+instância
CREATE UNIQUE INDEX idx_chatbot_sessao_ativa
  ON chatbot_sessoes(instancia_id, telefone)
  WHERE status IN ('ativo', 'aguardando_resposta', 'espera');

CREATE INDEX idx_chatbot_sessao_fluxo ON chatbot_sessoes(fluxo_id);
CREATE INDEX idx_chatbot_sessao_espera ON chatbot_sessoes(status, espera_ate) WHERE status = 'espera';

-- Trigger updated_at
CREATE TRIGGER chatbot_sessoes_updated_at
  BEFORE UPDATE ON chatbot_sessoes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE chatbot_sessoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY chatbot_sessoes_admin ON chatbot_sessoes
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','gerencia'))
  );

CREATE POLICY chatbot_sessoes_select ON chatbot_sessoes
  FOR SELECT USING (auth.role() = 'authenticated');
