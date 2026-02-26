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

-- Helper: pega role do user logado
CREATE OR REPLACE FUNCTION auth_role()
RETURNS user_role AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- PROFILES: user vê o próprio, admin/gerencia veem todos
CREATE POLICY "profiles_select_own" ON profiles
  FOR SELECT USING (id = auth.uid() OR auth_role() IN ('admin', 'gerencia'));

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


-- ── 13. SEED DATA (Dados Iniciais) ───────────────────────────
-- Execute APÓS criar os primeiros usuários no Supabase Auth.
-- Os IDs dos clientes são UUIDs fixos para manter referências.

-- Clientes seed
INSERT INTO clientes (id, nome, email, telefone, cpf, sexo, status, valor, vencimento, dias_atraso, ultimo_contato, limite_credito, credito_utilizado, score_interno, bonus_acumulado, indicado_por)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'João Silva', 'joao@email.com', '(11) 99999-9999', '123.456.789-00', 'masculino', 'em_dia', 5000, '2026-07-15', 0, NULL, 10000, 5000, 750, 150, '22222222-2222-2222-2222-222222222222'),
  ('22222222-2222-2222-2222-222222222222', 'Maria Santos', 'maria@email.com', '(11) 98888-8888', '987.654.321-00', 'feminino', 'vencido', 3200, '2026-05-01', 45, '2026-06-10 (Chat)', 8000, 3200, 420, 100, NULL),
  ('33333333-3333-3333-3333-333333333333', 'Pedro Oliveira', 'pedro@email.com', '(11) 97777-7777', '111.222.333-44', 'masculino', 'a_vencer', 8000, '2026-06-20', 0, NULL, 15000, 8000, 680, 75, '11111111-1111-1111-1111-111111111111'),
  ('44444444-4444-4444-4444-444444444444', 'Ana Costa', 'ana@email.com', '(11) 96666-6666', '444.555.666-77', 'feminino', 'vencido', 2500, '2026-04-05', 76, '2026-05-05 (Tel)', 5000, 2500, 380, 50, '11111111-1111-1111-1111-111111111111'),
  ('55555555-5555-5555-5555-555555555555', 'Carlos Souza', 'carlos@email.com', '(11) 95555-5555', '555.666.777-88', 'masculino', 'vencido', 12000, '2026-04-05', 76, '2026-05-05 (Tel)', 20000, 12000, 350, 0, '11111111-1111-1111-1111-111111111111'),
  ('66666666-6666-6666-6666-666666666666', 'Fernanda Lima', 'fernanda@email.com', '(11) 94444-4444', '666.777.888-99', 'feminino', 'a_vencer', 4500, '2026-06-25', 0, NULL, 10000, 4500, 720, 200, NULL),
  ('77777777-7777-7777-7777-777777777777', 'Roberto Alves', 'roberto@email.com', '(11) 93333-3333', '777.888.999-00', 'masculino', 'vencido', 1800, '2026-05-25', 23, '2026-06-15 (Whats)', 6000, 1800, 450, 25, NULL),
  ('88888888-8888-8888-8888-888888888888', 'Patricia Gomes', 'patricia@email.com', '(11) 92222-2222', '888.999.000-11', 'feminino', 'vencido', 5500, '2026-02-24', 120, '2026-04-01 (Email)', 12000, 5500, 280, 0, NULL),
  ('99999999-9999-9999-9999-999999999999', 'Lucas Mendes', 'lucas@email.com', '(11) 91111-1111', '999.000.111-22', 'masculino', 'vencido', 2200, '2026-06-07', 15, '2026-06-16 (Chat)', 7000, 2200, 520, 80, NULL),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Paulo Mendes', 'paulo@email.com', '(11) 90000-0000', '000.111.222-33', 'masculino', 'a_vencer', 3200, '2026-06-25', 0, NULL, 8000, 3200, 690, 120, NULL);

-- Empréstimos seed
INSERT INTO emprestimos (id, cliente_id, valor, parcelas, parcelas_pagas, valor_parcela, taxa_juros, data_contrato, proximo_vencimento, status)
VALUES
  ('e1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 5000, 12, 5, 500, 2.5, '2025-09-15', '2026-03-15', 'ativo'),
  ('e2222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 3200, 10, 3, 380, 3.0, '2025-11-01', '2026-02-01', 'inadimplente'),
  ('e3333333-3333-3333-3333-333333333333', '33333333-3333-3333-3333-333333333333', 8000, 24, 6, 420, 2.8, '2025-08-20', '2026-03-20', 'ativo'),
  ('e4444444-4444-4444-4444-444444444444', '44444444-4444-4444-4444-444444444444', 2500, 6, 1, 480, 3.2, '2025-12-05', '2026-01-05', 'inadimplente'),
  ('e5555555-5555-5555-5555-555555555555', '55555555-5555-5555-5555-555555555555', 12000, 36, 8, 450, 2.2, '2025-06-05', '2026-03-05', 'inadimplente'),
  ('e6666666-6666-6666-6666-666666666666', '66666666-6666-6666-6666-666666666666', 4500, 12, 4, 440, 2.6, '2025-10-25', '2026-03-25', 'ativo'),
  ('e7777777-7777-7777-7777-777777777777', '77777777-7777-7777-7777-777777777777', 1800, 6, 2, 340, 3.5, '2025-12-25', '2026-02-25', 'inadimplente'),
  ('e8888888-8888-8888-8888-888888888888', '88888888-8888-8888-8888-888888888888', 5500, 18, 2, 380, 3.0, '2025-12-24', '2026-02-24', 'inadimplente');

-- Parcelas seed
INSERT INTO parcelas (emprestimo_id, cliente_id, numero, valor, valor_original, data_vencimento, status, juros, multa, desconto)
VALUES
  ('e1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 6, 500, 500, '2026-03-15', 'pendente', 0, 0, 0),
  ('e1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 7, 500, 500, '2026-04-15', 'pendente', 0, 0, 0),
  ('e2222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 4, 418, 380, '2026-02-01', 'vencida', 28, 10, 0),
  ('e2222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 5, 380, 380, '2026-03-01', 'pendente', 0, 0, 0),
  ('e3333333-3333-3333-3333-333333333333', '33333333-3333-3333-3333-333333333333', 7, 420, 420, '2026-03-20', 'pendente', 0, 0, 0),
  ('e4444444-4444-4444-4444-444444444444', '44444444-4444-4444-4444-444444444444', 2, 540, 480, '2026-01-05', 'vencida', 40, 20, 0),
  ('e4444444-4444-4444-4444-444444444444', '44444444-4444-4444-4444-444444444444', 3, 510, 480, '2026-02-05', 'vencida', 20, 10, 0),
  ('e5555555-5555-5555-5555-555555555555', '55555555-5555-5555-5555-555555555555', 9, 520, 450, '2026-03-05', 'vencida', 50, 20, 0),
  ('e6666666-6666-6666-6666-666666666666', '66666666-6666-6666-6666-666666666666', 5, 440, 440, '2026-03-25', 'pendente', 0, 0, 0),
  ('e7777777-7777-7777-7777-777777777777', '77777777-7777-7777-7777-777777777777', 3, 370, 340, '2026-02-25', 'vencida', 20, 10, 0),
  ('e8888888-8888-8888-8888-888888888888', '88888888-8888-8888-8888-888888888888', 3, 430, 380, '2026-02-24', 'vencida', 35, 15, 0),
  ('e8888888-8888-8888-8888-888888888888', '88888888-8888-8888-8888-888888888888', 4, 380, 380, '2026-03-24', 'pendente', 0, 0, 0);

-- Templates WhatsApp seed
INSERT INTO templates_whatsapp (nome, categoria, mensagem_masculino, mensagem_feminino, variaveis, ativo)
VALUES
  ('Lembrete de Vencimento', 'lembrete', 'Olá Sr. {nome}, lembramos que sua parcela de {valor} vence em {data}. Mantenha seu crédito em dia!', 'Olá Sra. {nome}, lembramos que sua parcela de {valor} vence em {data}. Mantenha seu crédito em dia!', ARRAY['nome', 'valor', 'data'], true),
  ('Cobrança Amigável', 'cobranca', 'Prezado Sr. {nome}, identificamos que sua parcela está em atraso. Vamos regularizar? Entre em contato conosco.', 'Prezada Sra. {nome}, identificamos que sua parcela está em atraso. Vamos regularizar? Entre em contato conosco.', ARRAY['nome', 'valor', 'diasAtraso'], true),
  ('Boas-vindas', 'boas_vindas', 'Bem-vindo ao FintechFlow, Sr. {nome}! Seu crédito de {valor} foi aprovado. Qualquer dúvida, estamos aqui.', 'Bem-vinda ao FintechFlow, Sra. {nome}! Seu crédito de {valor} foi aprovado. Qualquer dúvida, estamos aqui.', ARRAY['nome', 'valor'], true),
  ('Proposta de Negociação', 'negociacao', 'Sr. {nome}, temos uma proposta especial para regularizar seu débito de {valor}. Desconto de até {desconto}%. Vamos conversar?', 'Sra. {nome}, temos uma proposta especial para regularizar seu débito de {valor}. Desconto de até {desconto}%. Vamos conversar?', ARRAY['nome', 'valor', 'desconto'], true);

-- Mensagens seed
INSERT INTO mensagens (cliente_id, remetente, conteudo, timestamp, lida, tipo)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'cliente', 'Olá, gostaria de antecipar minha parcela', '2026-06-23T10:23:00Z', false, 'texto'),
  ('11111111-1111-1111-1111-111111111111', 'sistema', 'Claro, João! Vou gerar o boleto com desconto. Aguarde um momento.', '2026-06-23T10:24:00Z', true, 'texto'),
  ('11111111-1111-1111-1111-111111111111', 'sistema', 'Boleto gerado com sucesso', '2026-06-23T10:25:00Z', true, 'boleto'),
  ('22222222-2222-2222-2222-222222222222', 'sistema', 'Olá Maria, lembramos que seu boleto venceu há 45 dias...', '2026-06-23T09:15:00Z', true, 'texto');
