-- ============================================================
-- FintechFlow — Schema Completo para Supabase
-- ============================================================
-- Execute este SQL no Supabase Dashboard → SQL Editor
-- Ou via CLI: supabase db push
-- ============================================================

-- ── 1. ENUMS ─────────────────────────────────────────────────

CREATE TYPE user_role AS ENUM ('admin', 'gerencia', 'cobranca', 'comercial', 'cliente');
CREATE TYPE cliente_status AS ENUM ('em_dia', 'a_vencer', 'vencido');
CREATE TYPE sexo AS ENUM ('masculino', 'feminino');
CREATE TYPE emprestimo_status AS ENUM ('ativo', 'quitado', 'inadimplente');
CREATE TYPE parcela_status AS ENUM ('pendente', 'paga', 'vencida', 'cancelada');
CREATE TYPE mensagem_remetente AS ENUM ('cliente', 'sistema');
CREATE TYPE mensagem_tipo AS ENUM ('texto', 'arquivo', 'boleto');
CREATE TYPE template_categoria AS ENUM ('cobranca', 'boas_vindas', 'lembrete', 'negociacao');
CREATE TYPE funcionario_status AS ENUM ('online', 'offline', 'ausente');
CREATE TYPE analise_credito_status AS ENUM ('pendente', 'em_analise', 'aprovado', 'recusado');
CREATE TYPE ticket_status AS ENUM ('aberto', 'em_atendimento', 'aguardando_cliente', 'resolvido', 'cancelado');
CREATE TYPE ticket_canal AS ENUM ('whatsapp', 'chat', 'telefone', 'email', 'presencial');
CREATE TYPE ticket_prioridade AS ENUM ('baixa', 'media', 'alta', 'urgente');
CREATE TYPE kanban_cobranca_etapa AS ENUM ('a_vencer', 'vencido', 'contatado', 'negociacao', 'acordo', 'pago', 'perdido');
CREATE TYPE whatsapp_instance_status AS ENUM ('conectado', 'desconectado', 'qr_pendente');
CREATE TYPE fluxo_status AS ENUM ('ativo', 'pausado', 'rascunho');
CREATE TYPE fluxo_etapa_tipo AS ENUM ('mensagem', 'condicao', 'acao', 'espera', 'finalizar');
CREATE TYPE whatsapp_msg_status AS ENUM ('pendente', 'enviado', 'enviada', 'entregue', 'lido', 'lida', 'recebida', 'erro', 'falha');

-- ── 2. PROFILES (extends auth.users) ────────────────────────

CREATE TABLE profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  email       TEXT NOT NULL UNIQUE,
  role        user_role NOT NULL DEFAULT 'comercial',
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger para criar profile automaticamente quando user é criado
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email,
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'comercial')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ── 3. CLIENTES ──────────────────────────────────────────────

CREATE TABLE clientes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome              TEXT NOT NULL,
  email             TEXT NOT NULL,
  telefone          TEXT NOT NULL,
  cpf               TEXT UNIQUE,
  sexo              sexo NOT NULL DEFAULT 'masculino',
  data_nascimento   DATE,
  endereco          TEXT,
  status            cliente_status NOT NULL DEFAULT 'em_dia',
  valor             NUMERIC(12,2) NOT NULL DEFAULT 0,
  vencimento        DATE NOT NULL DEFAULT CURRENT_DATE,
  dias_atraso       INTEGER NOT NULL DEFAULT 0,
  ultimo_contato    TEXT,
  limite_credito    NUMERIC(12,2) NOT NULL DEFAULT 0,
  credito_utilizado NUMERIC(12,2) NOT NULL DEFAULT 0,
  score_interno     INTEGER NOT NULL DEFAULT 500 CHECK (score_interno >= 0 AND score_interno <= 1000),
  bonus_acumulado   NUMERIC(12,2) NOT NULL DEFAULT 0,
  grupo             TEXT,
  indicado_por      UUID REFERENCES clientes(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_clientes_status ON clientes(status);
CREATE INDEX idx_clientes_indicado_por ON clientes(indicado_por);
CREATE INDEX idx_clientes_vencimento ON clientes(vencimento);
CREATE INDEX idx_clientes_cpf ON clientes(cpf);

CREATE TRIGGER clientes_updated_at
  BEFORE UPDATE ON clientes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ── 4. EMPRÉSTIMOS ───────────────────────────────────────────

CREATE TABLE emprestimos (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id          UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  valor               NUMERIC(12,2) NOT NULL,
  parcelas            INTEGER NOT NULL,
  parcelas_pagas      INTEGER NOT NULL DEFAULT 0,
  valor_parcela       NUMERIC(12,2) NOT NULL,
  taxa_juros          NUMERIC(5,2) NOT NULL,
  tipo_juros          VARCHAR(10) NOT NULL DEFAULT 'mensal',  -- mensal | semanal | diario
  data_contrato       DATE NOT NULL,
  proximo_vencimento  DATE NOT NULL,
  status              emprestimo_status NOT NULL DEFAULT 'ativo',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_emprestimos_cliente ON emprestimos(cliente_id);
CREATE INDEX idx_emprestimos_status ON emprestimos(status);

CREATE TRIGGER emprestimos_updated_at
  BEFORE UPDATE ON emprestimos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ── 5. PARCELAS ──────────────────────────────────────────────

CREATE TABLE parcelas (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  emprestimo_id    UUID NOT NULL REFERENCES emprestimos(id) ON DELETE CASCADE,
  cliente_id       UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  numero           INTEGER NOT NULL,
  valor            NUMERIC(12,2) NOT NULL,
  valor_original   NUMERIC(12,2) NOT NULL,
  data_vencimento  DATE NOT NULL,
  data_pagamento   DATE,
  status           parcela_status NOT NULL DEFAULT 'pendente',
  juros            NUMERIC(12,2) NOT NULL DEFAULT 0,
  multa            NUMERIC(12,2) NOT NULL DEFAULT 0,
  desconto         NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_parcelas_emprestimo ON parcelas(emprestimo_id);
CREATE INDEX idx_parcelas_cliente ON parcelas(cliente_id);
CREATE INDEX idx_parcelas_status ON parcelas(status);
CREATE INDEX idx_parcelas_vencimento ON parcelas(data_vencimento);

CREATE TRIGGER parcelas_updated_at
  BEFORE UPDATE ON parcelas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ── 6. MENSAGENS (Chat) ─────────────────────────────────────

CREATE TABLE mensagens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id  UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  remetente   mensagem_remetente NOT NULL,
  conteudo    TEXT NOT NULL,
  timestamp   TIMESTAMPTZ NOT NULL DEFAULT now(),
  lida        BOOLEAN NOT NULL DEFAULT false,
  tipo        mensagem_tipo NOT NULL DEFAULT 'texto',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_mensagens_cliente ON mensagens(cliente_id);
CREATE INDEX idx_mensagens_timestamp ON mensagens(timestamp DESC);


-- ── 7. TEMPLATES WHATSAPP ────────────────────────────────────

CREATE TABLE templates_whatsapp (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome                TEXT NOT NULL,
  categoria           template_categoria NOT NULL,
  mensagem_masculino  TEXT NOT NULL,
  mensagem_feminino   TEXT NOT NULL,
  variaveis           TEXT[] NOT NULL DEFAULT '{}',
  ativo               BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER templates_updated_at
  BEFORE UPDATE ON templates_whatsapp
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ── 8. FUNCIONÁRIOS ──────────────────────────────────────────

CREATE TABLE funcionarios (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  nome              TEXT NOT NULL,
  email             TEXT NOT NULL,
  role              user_role NOT NULL DEFAULT 'comercial',
  status            funcionario_status NOT NULL DEFAULT 'offline',
  ultimo_login      TIMESTAMPTZ,
  ultima_atividade  TIMESTAMPTZ,
  horas_hoje        NUMERIC(5,1) NOT NULL DEFAULT 0,
  horas_semana      NUMERIC(5,1) NOT NULL DEFAULT 0,
  horas_mes         NUMERIC(6,1) NOT NULL DEFAULT 0,
  atividades_hoje   INTEGER NOT NULL DEFAULT 0,
  meta_diaria       INTEGER NOT NULL DEFAULT 80,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_funcionarios_user ON funcionarios(user_id);
CREATE INDEX idx_funcionarios_status ON funcionarios(status);

CREATE TRIGGER funcionarios_updated_at
  BEFORE UPDATE ON funcionarios
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ── 9. SESSÕES DE ATIVIDADE ─────────────────────────────────

CREATE TABLE sessoes_atividade (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  funcionario_id   UUID NOT NULL REFERENCES funcionarios(id) ON DELETE CASCADE,
  inicio           TIMESTAMPTZ NOT NULL,
  fim              TIMESTAMPTZ,
  duracao          INTEGER NOT NULL DEFAULT 0, -- minutos
  acoes            INTEGER NOT NULL DEFAULT 0,
  paginas          TEXT[] NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sessoes_funcionario ON sessoes_atividade(funcionario_id);


-- ── 10. LOGS DE ATIVIDADE ────────────────────────────────────

CREATE TABLE logs_atividade (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  acao        TEXT NOT NULL,
  detalhes    TEXT,
  pagina      TEXT,
  ip          INET,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_logs_user ON logs_atividade(user_id);
CREATE INDEX idx_logs_created ON logs_atividade(created_at DESC);


-- ── 10b. ANÁLISES DE CRÉDITO ─────────────────────────────────

CREATE TABLE analises_credito (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id        UUID REFERENCES clientes(id) ON DELETE SET NULL,
  cliente_nome      TEXT NOT NULL,
  cpf               TEXT NOT NULL,
  valor_solicitado  NUMERIC(12,2) NOT NULL,
  renda_mensal      NUMERIC(12,2) NOT NULL,
  score_serasa      INTEGER NOT NULL CHECK (score_serasa >= 0 AND score_serasa <= 1000),
  score_interno     INTEGER NOT NULL DEFAULT 0 CHECK (score_interno >= 0 AND score_interno <= 1000),
  status            analise_credito_status NOT NULL DEFAULT 'pendente',
  data_solicitacao  DATE NOT NULL DEFAULT CURRENT_DATE,
  motivo            TEXT,
  analista_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_analises_status ON analises_credito(status);
CREATE INDEX idx_analises_cliente ON analises_credito(cliente_id);
CREATE INDEX idx_analises_data ON analises_credito(data_solicitacao DESC);

CREATE TRIGGER analises_credito_updated_at
  BEFORE UPDATE ON analises_credito
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ── 10c. TICKETS DE ATENDIMENTO ──────────────────────────────

CREATE TABLE tickets_atendimento (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id        UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  atendente_id      UUID REFERENCES funcionarios(id) ON DELETE SET NULL,
  assunto           TEXT NOT NULL,
  descricao         TEXT,
  status            ticket_status NOT NULL DEFAULT 'aberto',
  canal             ticket_canal NOT NULL DEFAULT 'whatsapp',
  prioridade        ticket_prioridade NOT NULL DEFAULT 'media',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolvido_em      TIMESTAMPTZ
);

CREATE INDEX idx_tickets_cliente ON tickets_atendimento(cliente_id);
CREATE INDEX idx_tickets_atendente ON tickets_atendimento(atendente_id);
CREATE INDEX idx_tickets_status ON tickets_atendimento(status);
CREATE INDEX idx_tickets_prioridade ON tickets_atendimento(prioridade);
CREATE INDEX idx_tickets_created ON tickets_atendimento(created_at DESC);

CREATE TRIGGER tickets_atendimento_updated_at
  BEFORE UPDATE ON tickets_atendimento
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ── 10d. KANBAN COBRANÇA (etapa de pipeline) ─────────────────

CREATE TABLE kanban_cobranca (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id        UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  parcela_id        UUID REFERENCES parcelas(id) ON DELETE SET NULL,
  responsavel_id    UUID REFERENCES funcionarios(id) ON DELETE SET NULL,
  etapa             kanban_cobranca_etapa NOT NULL DEFAULT 'a_vencer',
  valor_divida      NUMERIC(12,2) NOT NULL DEFAULT 0,
  dias_atraso       INTEGER NOT NULL DEFAULT 0,
  tentativas_contato INTEGER NOT NULL DEFAULT 0,
  ultimo_contato    TIMESTAMPTZ,
  observacao        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_kanban_cob_cliente ON kanban_cobranca(cliente_id);
CREATE INDEX idx_kanban_cob_responsavel ON kanban_cobranca(responsavel_id);
CREATE INDEX idx_kanban_cob_etapa ON kanban_cobranca(etapa);

CREATE TRIGGER kanban_cobranca_updated_at
  BEFORE UPDATE ON kanban_cobranca
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ── 11. RPC FUNCTIONS ────────────────────────────────────────

-- Dashboard Stats
CREATE OR REPLACE FUNCTION get_dashboard_stats()
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'total_clientes', (SELECT COUNT(*) FROM clientes),
    'clientes_em_dia', (SELECT COUNT(*) FROM clientes WHERE status = 'em_dia'),
    'clientes_vencidos', (SELECT COUNT(*) FROM clientes WHERE status = 'vencido'),
    'clientes_a_vencer', (SELECT COUNT(*) FROM clientes WHERE status = 'a_vencer'),
    'total_carteira', (SELECT COALESCE(SUM(valor), 0) FROM emprestimos WHERE status = 'ativo'),
    'total_inadimplencia', (SELECT COALESCE(SUM(valor), 0) FROM parcelas WHERE status = 'vencida'),
    'taxa_inadimplencia', (
      SELECT CASE
        WHEN COUNT(*) = 0 THEN 0
        ELSE ROUND((COUNT(*) FILTER (WHERE status = 'vencido')::NUMERIC / COUNT(*)) * 100, 1)
      END FROM clientes
    ),
    'total_emprestimos_ativos', (SELECT COUNT(*) FROM emprestimos WHERE status = 'ativo')
  ) INTO result;
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Evolução Financeira mensal
CREATE OR REPLACE FUNCTION get_financial_summary(periodo_meses INTEGER DEFAULT 6)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_agg(row_to_json(t)) INTO result
  FROM (
    SELECT
      TO_CHAR(data_vencimento, 'Mon') as mes,
      SUM(CASE WHEN status = 'paga' THEN valor ELSE 0 END) as receita,
      ROUND(
        (COUNT(*) FILTER (WHERE status = 'vencida')::NUMERIC /
         NULLIF(COUNT(*), 0)) * 100, 1
      ) as inadimplencia
    FROM parcelas
    WHERE data_vencimento >= CURRENT_DATE - (periodo_meses || ' months')::INTERVAL
    GROUP BY TO_CHAR(data_vencimento, 'Mon'), DATE_TRUNC('month', data_vencimento)
    ORDER BY DATE_TRUNC('month', data_vencimento)
  ) t;
  RETURN COALESCE(result, '[]'::JSON);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Kanban Gerencial Stats
CREATE OR REPLACE FUNCTION get_kanban_stats()
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'total_analises', (SELECT COUNT(*) FROM analises_credito),
    'analises_pendentes', (SELECT COUNT(*) FROM analises_credito WHERE status = 'pendente'),
    'analises_em_analise', (SELECT COUNT(*) FROM analises_credito WHERE status = 'em_analise'),
    'analises_aprovadas', (SELECT COUNT(*) FROM analises_credito WHERE status = 'aprovado'),
    'analises_recusadas', (SELECT COUNT(*) FROM analises_credito WHERE status = 'recusado'),
    'total_tickets', (SELECT COUNT(*) FROM tickets_atendimento),
    'tickets_abertos', (SELECT COUNT(*) FROM tickets_atendimento WHERE status = 'aberto'),
    'tickets_em_atendimento', (SELECT COUNT(*) FROM tickets_atendimento WHERE status = 'em_atendimento'),
    'tickets_resolvidos', (SELECT COUNT(*) FROM tickets_atendimento WHERE status = 'resolvido'),
    'total_cobranca', (SELECT COUNT(*) FROM kanban_cobranca),
    'cobranca_em_negociacao', (SELECT COUNT(*) FROM kanban_cobranca WHERE etapa = 'negociacao'),
    'cobranca_acordos', (SELECT COUNT(*) FROM kanban_cobranca WHERE etapa = 'acordo'),
    'cobranca_pagos', (SELECT COUNT(*) FROM kanban_cobranca WHERE etapa = 'pago'),
    'valor_em_cobranca', (SELECT COALESCE(SUM(valor_divida), 0) FROM kanban_cobranca WHERE etapa NOT IN ('pago', 'perdido')),
    'valor_recuperado', (SELECT COALESCE(SUM(valor_divida), 0) FROM kanban_cobranca WHERE etapa = 'pago'),
    'taxa_aprovacao_credito', (
      SELECT CASE
        WHEN COUNT(*) FILTER (WHERE status IN ('aprovado', 'recusado')) = 0 THEN 0
        ELSE ROUND(
          (COUNT(*) FILTER (WHERE status = 'aprovado')::NUMERIC /
           COUNT(*) FILTER (WHERE status IN ('aprovado', 'recusado'))) * 100, 1
        )
      END FROM analises_credito
    )
  ) INTO result;
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ── 12. ROW LEVEL SECURITY (RLS) ─────────────────────────────

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE emprestimos ENABLE ROW LEVEL SECURITY;
ALTER TABLE parcelas ENABLE ROW LEVEL SECURITY;
ALTER TABLE mensagens ENABLE ROW LEVEL SECURITY;
ALTER TABLE templates_whatsapp ENABLE ROW LEVEL SECURITY;
ALTER TABLE funcionarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessoes_atividade ENABLE ROW LEVEL SECURITY;
ALTER TABLE logs_atividade ENABLE ROW LEVEL SECURITY;
ALTER TABLE analises_credito ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets_atendimento ENABLE ROW LEVEL SECURITY;
ALTER TABLE kanban_cobranca ENABLE ROW LEVEL SECURITY;

-- Helper: pega role do user logado
CREATE OR REPLACE FUNCTION auth_role()
RETURNS user_role AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- PROFILES: user vê o próprio, admin/gerencia veem todos
CREATE POLICY "profiles_select_own" ON profiles
  FOR SELECT USING (id = auth.uid() OR auth_role() IN ('admin', 'gerencia'));

CREATE POLICY "profiles_insert_own" ON profiles
  FOR INSERT WITH CHECK (id = auth.uid());

CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "profiles_admin_all" ON profiles
  FOR ALL USING (auth_role() = 'admin');

-- CLIENTES: todos os funcionários logados podem ver; admin/gerencia podem editar
CREATE POLICY "clientes_select" ON clientes
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "clientes_insert" ON clientes
  FOR INSERT WITH CHECK (auth_role() IN ('admin', 'gerencia', 'comercial'));

CREATE POLICY "clientes_update" ON clientes
  FOR UPDATE USING (auth_role() IN ('admin', 'gerencia', 'cobranca', 'comercial'));

CREATE POLICY "clientes_delete" ON clientes
  FOR DELETE USING (auth_role() = 'admin');

-- EMPRESTIMOS: todos veem; admin/gerencia/comercial criam; admin deleta
CREATE POLICY "emprestimos_select" ON emprestimos
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "emprestimos_insert" ON emprestimos
  FOR INSERT WITH CHECK (auth_role() IN ('admin', 'gerencia', 'comercial'));

CREATE POLICY "emprestimos_update" ON emprestimos
  FOR UPDATE USING (auth_role() IN ('admin', 'gerencia'));

CREATE POLICY "emprestimos_delete" ON emprestimos
  FOR DELETE USING (auth_role() = 'admin');

-- PARCELAS: todos veem; admin/gerencia/cobranca alteram
CREATE POLICY "parcelas_select" ON parcelas
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "parcelas_insert" ON parcelas
  FOR INSERT WITH CHECK (auth_role() IN ('admin', 'gerencia'));

CREATE POLICY "parcelas_update" ON parcelas
  FOR UPDATE USING (auth_role() IN ('admin', 'gerencia', 'cobranca'));

CREATE POLICY "parcelas_delete" ON parcelas
  FOR DELETE USING (auth_role() = 'admin');

-- MENSAGENS: todos logados veem e inserem
CREATE POLICY "mensagens_select" ON mensagens
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "mensagens_insert" ON mensagens
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "mensagens_update" ON mensagens
  FOR UPDATE USING (auth.uid() IS NOT NULL);

-- TEMPLATES: todos veem; admin/gerencia editam
CREATE POLICY "templates_select" ON templates_whatsapp
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "templates_insert" ON templates_whatsapp
  FOR INSERT WITH CHECK (auth_role() IN ('admin', 'gerencia'));

CREATE POLICY "templates_update" ON templates_whatsapp
  FOR UPDATE USING (auth_role() IN ('admin', 'gerencia'));

CREATE POLICY "templates_delete" ON templates_whatsapp
  FOR DELETE USING (auth_role() = 'admin');

-- FUNCIONARIOS: veem próprio ou admin/gerencia veem todos
CREATE POLICY "funcionarios_select" ON funcionarios
  FOR SELECT USING (user_id = auth.uid() OR auth_role() IN ('admin', 'gerencia'));

CREATE POLICY "funcionarios_update" ON funcionarios
  FOR UPDATE USING (user_id = auth.uid() OR auth_role() = 'admin');

CREATE POLICY "funcionarios_admin_insert" ON funcionarios
  FOR INSERT WITH CHECK (auth_role() = 'admin');

-- SESSOES: user vê própria; admin/gerencia veem todas
CREATE POLICY "sessoes_select" ON sessoes_atividade
  FOR SELECT USING (
    funcionario_id IN (SELECT id FROM funcionarios WHERE user_id = auth.uid())
    OR auth_role() IN ('admin', 'gerencia')
  );

CREATE POLICY "sessoes_insert" ON sessoes_atividade
  FOR INSERT WITH CHECK (
    funcionario_id IN (SELECT id FROM funcionarios WHERE user_id = auth.uid())
  );

-- LOGS: admin/gerencia veem todos
CREATE POLICY "logs_select" ON logs_atividade
  FOR SELECT USING (auth_role() IN ('admin', 'gerencia'));

CREATE POLICY "logs_insert" ON logs_atividade
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- ANALISES_CREDITO: todos logados veem; admin/gerencia/comercial criam e editam
CREATE POLICY "analises_select" ON analises_credito
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "analises_insert" ON analises_credito
  FOR INSERT WITH CHECK (auth_role() IN ('admin', 'gerencia', 'comercial'));

CREATE POLICY "analises_update" ON analises_credito
  FOR UPDATE USING (auth_role() IN ('admin', 'gerencia', 'comercial'));

CREATE POLICY "analises_delete" ON analises_credito
  FOR DELETE USING (auth_role() = 'admin');

-- TICKETS_ATENDIMENTO: todos logados veem; admin/gerencia/cobranca/comercial criam; admin/gerencia/cobranca atualizam
CREATE POLICY "tickets_select" ON tickets_atendimento
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "tickets_insert" ON tickets_atendimento
  FOR INSERT WITH CHECK (auth_role() IN ('admin', 'gerencia', 'cobranca', 'comercial'));

CREATE POLICY "tickets_update" ON tickets_atendimento
  FOR UPDATE USING (auth_role() IN ('admin', 'gerencia', 'cobranca', 'comercial'));

CREATE POLICY "tickets_delete" ON tickets_atendimento
  FOR DELETE USING (auth_role() = 'admin');

-- KANBAN_COBRANCA: todos logados veem; admin/gerencia/cobranca criam e editam
CREATE POLICY "kanban_cob_select" ON kanban_cobranca
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "kanban_cob_insert" ON kanban_cobranca
  FOR INSERT WITH CHECK (auth_role() IN ('admin', 'gerencia', 'cobranca'));

CREATE POLICY "kanban_cob_update" ON kanban_cobranca
  FOR UPDATE USING (auth_role() IN ('admin', 'gerencia', 'cobranca'));

CREATE POLICY "kanban_cob_delete" ON kanban_cobranca
  FOR DELETE USING (auth_role() = 'admin');


-- ── 12b. REDE DE INDICAÇÕES ──────────────────────────────────

-- Tabela de rede de indicações
CREATE TABLE rede_indicacoes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  indicado_por UUID REFERENCES clientes(id) ON DELETE SET NULL,
  nivel INTEGER NOT NULL DEFAULT 1,
  rede_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ativo'
    CHECK (status IN ('ativo', 'bloqueado', 'inativo')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Tabela para bloqueios de rede
CREATE TABLE bloqueios_rede (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  rede_id TEXT NOT NULL,
  causado_por UUID REFERENCES clientes(id) ON DELETE SET NULL,
  motivo TEXT NOT NULL DEFAULT 'manual'
    CHECK (motivo IN ('inadimplencia', 'fraude', 'manual', 'auto_bloqueio')),
  descricao TEXT,
  bloqueado_em TIMESTAMPTZ DEFAULT now(),
  desbloqueado_em TIMESTAMPTZ,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para performance
CREATE INDEX idx_rede_cliente ON rede_indicacoes(cliente_id);
CREATE INDEX idx_rede_indicado ON rede_indicacoes(indicado_por);
CREATE INDEX idx_rede_rede_id ON rede_indicacoes(rede_id);
CREATE INDEX idx_bloqueios_rede_id ON bloqueios_rede(rede_id);
CREATE INDEX idx_bloqueios_ativo ON bloqueios_rede(ativo) WHERE ativo = true;

-- Trigger updated_at
CREATE TRIGGER set_updated_at_rede_indicacoes
  BEFORE UPDATE ON rede_indicacoes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE rede_indicacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE bloqueios_rede  ENABLE ROW LEVEL SECURITY;

-- REDE_INDICACOES: todos logados veem; admin/gerencia/comercial editam
CREATE POLICY "rede_select" ON rede_indicacoes
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "rede_insert" ON rede_indicacoes
  FOR INSERT WITH CHECK (auth_role() IN ('admin', 'gerencia', 'comercial'));

CREATE POLICY "rede_update" ON rede_indicacoes
  FOR UPDATE USING (auth_role() IN ('admin', 'gerencia'));

CREATE POLICY "rede_delete" ON rede_indicacoes
  FOR DELETE USING (auth_role() = 'admin');

-- BLOQUEIOS_REDE: todos logados veem; admin/gerencia editam
CREATE POLICY "bloqueios_select" ON bloqueios_rede
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "bloqueios_insert" ON bloqueios_rede
  FOR INSERT WITH CHECK (auth_role() IN ('admin', 'gerencia'));

CREATE POLICY "bloqueios_update" ON bloqueios_rede
  FOR UPDATE USING (auth_role() IN ('admin', 'gerencia'));


-- ── 14. WHATSAPP INSTÂNCIAS ───────────────────────────────────

CREATE TABLE whatsapp_instancias (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  departamento    TEXT DEFAULT 'geral',
  instance_name   TEXT NOT NULL UNIQUE,
  instance_token  TEXT,
  phone_number    TEXT,
  status          whatsapp_instance_status NOT NULL DEFAULT 'desconectado',
  evolution_url   TEXT,
  qr_code         TEXT,
  webhook_url     TEXT,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_wpp_inst_depto ON whatsapp_instancias(departamento);

CREATE TRIGGER whatsapp_instancias_updated_at
  BEFORE UPDATE ON whatsapp_instancias
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ── 15. FLUXOS DE CHATBOT ────────────────────────────────────

CREATE TABLE fluxos_chatbot (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome            TEXT NOT NULL,
  descricao       TEXT,
  departamento    TEXT NOT NULL,
  status          fluxo_status NOT NULL DEFAULT 'rascunho',
  gatilho         TEXT NOT NULL DEFAULT 'manual',
  palavra_chave   TEXT,
  cron_expression TEXT,
  evento_trigger  TEXT,
  template_id     UUID REFERENCES templates_whatsapp(id) ON DELETE SET NULL,
  disparos        INTEGER NOT NULL DEFAULT 0,
  respostas       INTEGER NOT NULL DEFAULT 0,
  conversoes      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_fluxo_depto ON fluxos_chatbot(departamento);
CREATE INDEX idx_fluxo_status ON fluxos_chatbot(status);
CREATE INDEX idx_fluxo_gatilho ON fluxos_chatbot(gatilho);

CREATE TRIGGER fluxos_chatbot_updated_at
  BEFORE UPDATE ON fluxos_chatbot
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ── 16. ETAPAS DO FLUXO ──────────────────────────────────────

CREATE TABLE fluxos_chatbot_etapas (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fluxo_id        UUID NOT NULL REFERENCES fluxos_chatbot(id) ON DELETE CASCADE,
  ordem           INTEGER NOT NULL DEFAULT 0,
  tipo            fluxo_etapa_tipo NOT NULL DEFAULT 'mensagem',
  conteudo        TEXT,
  config          JSONB DEFAULT '{}',
  proximo_sim     UUID,
  proximo_nao     UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_etapa_fluxo ON fluxos_chatbot_etapas(fluxo_id, ordem);


-- ── 17. LOG DE MENSAGENS WHATSAPP ───────────────────────────

CREATE TABLE whatsapp_mensagens_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instancia_id    UUID REFERENCES whatsapp_instancias(id) ON DELETE SET NULL,
  cliente_id      UUID REFERENCES clientes(id) ON DELETE SET NULL,
  fluxo_id        UUID REFERENCES fluxos_chatbot(id) ON DELETE SET NULL,
  direcao         TEXT NOT NULL CHECK (direcao IN ('entrada', 'saida', 'enviada', 'recebida')),
  telefone        TEXT NOT NULL,
  conteudo        TEXT NOT NULL,
  tipo            TEXT NOT NULL DEFAULT 'text',
  status          whatsapp_msg_status NOT NULL DEFAULT 'pendente',
  message_id_wpp  TEXT,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_wpp_log_cliente ON whatsapp_mensagens_log(cliente_id);
CREATE INDEX idx_wpp_log_instancia ON whatsapp_mensagens_log(instancia_id);
CREATE INDEX idx_wpp_log_fluxo ON whatsapp_mensagens_log(fluxo_id);
CREATE INDEX idx_wpp_log_telefone ON whatsapp_mensagens_log(telefone);
CREATE INDEX idx_wpp_log_created ON whatsapp_mensagens_log(created_at DESC);


-- ── RLS para WhatsApp ───────────────────────────────────────

ALTER TABLE whatsapp_instancias    ENABLE ROW LEVEL SECURITY;
ALTER TABLE fluxos_chatbot         ENABLE ROW LEVEL SECURITY;
ALTER TABLE fluxos_chatbot_etapas  ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_mensagens_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wpp_inst_admin_all" ON whatsapp_instancias FOR ALL USING (auth_role() IN ('admin', 'gerencia'));
CREATE POLICY "wpp_inst_own_select" ON whatsapp_instancias FOR SELECT USING (auth.uid() IS NOT NULL AND created_by = auth.uid());
CREATE POLICY "wpp_inst_own_modify" ON whatsapp_instancias FOR ALL USING (auth.uid() IS NOT NULL AND created_by = auth.uid());

CREATE POLICY "fluxo_select" ON fluxos_chatbot FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "fluxo_insert" ON fluxos_chatbot FOR INSERT WITH CHECK (auth_role() IN ('admin', 'gerencia'));
CREATE POLICY "fluxo_update" ON fluxos_chatbot FOR UPDATE USING (auth_role() IN ('admin', 'gerencia'));
CREATE POLICY "fluxo_delete" ON fluxos_chatbot FOR DELETE USING (auth_role() = 'admin');

CREATE POLICY "etapa_select" ON fluxos_chatbot_etapas FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "etapa_insert" ON fluxos_chatbot_etapas FOR INSERT WITH CHECK (auth_role() IN ('admin', 'gerencia'));
CREATE POLICY "etapa_update" ON fluxos_chatbot_etapas FOR UPDATE USING (auth_role() IN ('admin', 'gerencia'));
CREATE POLICY "etapa_delete" ON fluxos_chatbot_etapas FOR DELETE USING (auth_role() IN ('admin', 'gerencia'));

CREATE POLICY "wpp_log_select" ON whatsapp_mensagens_log FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "wpp_log_insert" ON whatsapp_mensagens_log FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);


-- ── Supabase Realtime ───────────────────────────────────────
-- Habilitar Realtime para tabelas WhatsApp (necessário para subscriptions)
ALTER PUBLICATION supabase_realtime ADD TABLE whatsapp_mensagens_log;
ALTER PUBLICATION supabase_realtime ADD TABLE whatsapp_instancias;


-- ── 13. SEED DATA ────────────────────────────────────────────
-- Os dados de teste estão em um arquivo separado: seed-data.sql
-- Execute-o APÓS rodar este schema no SQL Editor do Supabase.
