-- ============================================================
-- FintechFlow — Seed de Dados para Teste
-- ============================================================
-- Execute APÓS rodar o schema.sql e criar pelo menos
-- um usuário admin no Supabase Dashboard.
--
-- Rode no SQL Editor do Supabase:
--   1. Copie e cole todo este arquivo
--   2. Execute
--
-- Os dados usam datas relativas a CURRENT_DATE, então
-- funcionam independente de quando você executar.
-- ============================================================

-- Limpar dados existentes antes de inserir
TRUNCATE clientes, emprestimos, parcelas, mensagens, templates_whatsapp, analises_credito CASCADE;

-- ── CLIENTES (10 registros) ──────────────────────────────────

INSERT INTO clientes (id, nome, email, telefone, cpf, sexo, status, valor, vencimento, dias_atraso, ultimo_contato, limite_credito, credito_utilizado, score_interno, bonus_acumulado, grupo, indicado_por)
VALUES
  -- Em dia
  ('11111111-1111-1111-1111-111111111111',
   'João Silva', 'joao@email.com', '(11) 99999-9999', '123.456.789-00',
   'masculino', 'em_dia', 5000.00,
   CURRENT_DATE + INTERVAL '15 days', 0, NULL,
   10000.00, 5000.00, 750, 150.00, 'Grupo A', NULL),

  ('66666666-6666-6666-6666-666666666666',
   'Fernanda Lima', 'fernanda@email.com', '(11) 94444-4444', '666.777.888-99',
   'feminino', 'em_dia', 4500.00,
   CURRENT_DATE + INTERVAL '25 days', 0, NULL,
   10000.00, 4500.00, 720, 200.00, 'Grupo B', NULL),

  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'Paulo Mendes', 'paulo@email.com', '(11) 90000-0000', '000.111.222-33',
   'masculino', 'em_dia', 3200.00,
   CURRENT_DATE + INTERVAL '20 days', 0, NULL,
   8000.00, 3200.00, 690, 120.00, 'Grupo A',
   '11111111-1111-1111-1111-111111111111'),

  -- A vencer (parcelas próximas)
  ('33333333-3333-3333-3333-333333333333',
   'Pedro Oliveira', 'pedro@email.com', '(11) 97777-7777', '111.222.333-44',
   'masculino', 'a_vencer', 8000.00,
   CURRENT_DATE + INTERVAL '5 days', 0, NULL,
   15000.00, 8000.00, 680, 75.00, 'Grupo A',
   '11111111-1111-1111-1111-111111111111'),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'Camila Rodrigues', 'camila@email.com', '(11) 93456-7890', '222.333.444-55',
   'feminino', 'a_vencer', 6000.00,
   CURRENT_DATE + INTERVAL '3 days', 0, NULL,
   12000.00, 6000.00, 640, 90.00, 'Grupo C', NULL),

  -- Vencidos
  ('22222222-2222-2222-2222-222222222222',
   'Maria Santos', 'maria@email.com', '(11) 98888-8888', '987.654.321-00',
   'feminino', 'vencido', 3200.00,
   CURRENT_DATE - INTERVAL '45 days', 45,
   TO_CHAR(CURRENT_DATE - INTERVAL '10 days', 'YYYY-MM-DD') || ' (Chat)',
   8000.00, 3200.00, 420, 100.00, 'Grupo B', NULL),

  ('44444444-4444-4444-4444-444444444444',
   'Ana Costa', 'ana@email.com', '(11) 96666-6666', '444.555.666-77',
   'feminino', 'vencido', 2500.00,
   CURRENT_DATE - INTERVAL '76 days', 76,
   TO_CHAR(CURRENT_DATE - INTERVAL '30 days', 'YYYY-MM-DD') || ' (Tel)',
   5000.00, 2500.00, 380, 50.00, 'Grupo A',
   '11111111-1111-1111-1111-111111111111'),

  ('55555555-5555-5555-5555-555555555555',
   'Carlos Souza', 'carlos@email.com', '(11) 95555-5555', '555.666.777-88',
   'masculino', 'vencido', 12000.00,
   CURRENT_DATE - INTERVAL '76 days', 76,
   TO_CHAR(CURRENT_DATE - INTERVAL '30 days', 'YYYY-MM-DD') || ' (Tel)',
   20000.00, 12000.00, 350, 0.00, 'Grupo A',
   '11111111-1111-1111-1111-111111111111'),

  ('77777777-7777-7777-7777-777777777777',
   'Roberto Alves', 'roberto@email.com', '(11) 93333-3333', '777.888.999-00',
   'masculino', 'vencido', 1800.00,
   CURRENT_DATE - INTERVAL '23 days', 23,
   TO_CHAR(CURRENT_DATE - INTERVAL '7 days', 'YYYY-MM-DD') || ' (Whats)',
   6000.00, 1800.00, 450, 25.00, 'Grupo C', NULL),

  ('88888888-8888-8888-8888-888888888888',
   'Patricia Gomes', 'patricia@email.com', '(11) 92222-2222', '888.999.000-11',
   'feminino', 'vencido', 5500.00,
   CURRENT_DATE - INTERVAL '120 days', 120,
   TO_CHAR(CURRENT_DATE - INTERVAL '60 days', 'YYYY-MM-DD') || ' (Email)',
   12000.00, 5500.00, 280, 0.00, 'Grupo B', NULL);


-- ── EMPRÉSTIMOS (10 registros) ───────────────────────────────

INSERT INTO emprestimos (id, cliente_id, valor, parcelas, parcelas_pagas, valor_parcela, taxa_juros, data_contrato, proximo_vencimento, status)
VALUES
  -- Ativos (em dia)
  ('e1111111-1111-1111-1111-111111111111',
   '11111111-1111-1111-1111-111111111111',
   5000.00, 12, 5, 500.00, 2.5,
   CURRENT_DATE - INTERVAL '5 months', CURRENT_DATE + INTERVAL '15 days', 'ativo'),

  ('e6666666-6666-6666-6666-666666666666',
   '66666666-6666-6666-6666-666666666666',
   4500.00, 12, 4, 440.00, 2.6,
   CURRENT_DATE - INTERVAL '4 months', CURRENT_DATE + INTERVAL '25 days', 'ativo'),

  ('eaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   3200.00, 10, 3, 380.00, 2.8,
   CURRENT_DATE - INTERVAL '3 months', CURRENT_DATE + INTERVAL '20 days', 'ativo'),

  -- Ativos (a vencer)
  ('e3333333-3333-3333-3333-333333333333',
   '33333333-3333-3333-3333-333333333333',
   8000.00, 24, 6, 420.00, 2.8,
   CURRENT_DATE - INTERVAL '6 months', CURRENT_DATE + INTERVAL '5 days', 'ativo'),

  ('ebbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   6000.00, 18, 5, 400.00, 3.0,
   CURRENT_DATE - INTERVAL '5 months', CURRENT_DATE + INTERVAL '3 days', 'ativo'),

  -- Inadimplentes
  ('e2222222-2222-2222-2222-222222222222',
   '22222222-2222-2222-2222-222222222222',
   3200.00, 10, 3, 380.00, 3.0,
   CURRENT_DATE - INTERVAL '7 months', CURRENT_DATE - INTERVAL '45 days', 'inadimplente'),

  ('e4444444-4444-4444-4444-444444444444',
   '44444444-4444-4444-4444-444444444444',
   2500.00, 6, 1, 480.00, 3.2,
   CURRENT_DATE - INTERVAL '4 months', CURRENT_DATE - INTERVAL '76 days', 'inadimplente'),

  ('e5555555-5555-5555-5555-555555555555',
   '55555555-5555-5555-5555-555555555555',
   12000.00, 36, 8, 450.00, 2.2,
   CURRENT_DATE - INTERVAL '10 months', CURRENT_DATE - INTERVAL '76 days', 'inadimplente'),

  ('e7777777-7777-7777-7777-777777777777',
   '77777777-7777-7777-7777-777777777777',
   1800.00, 6, 2, 340.00, 3.5,
   CURRENT_DATE - INTERVAL '3 months', CURRENT_DATE - INTERVAL '23 days', 'inadimplente'),

  ('e8888888-8888-8888-8888-888888888888',
   '88888888-8888-8888-8888-888888888888',
   5500.00, 18, 2, 380.00, 3.0,
   CURRENT_DATE - INTERVAL '6 months', CURRENT_DATE - INTERVAL '120 days', 'inadimplente');


-- ── PARCELAS ─────────────────────────────────────────────────
-- Para cada empréstimo: parcelas pagas (passado) + pendentes/vencidas

-- João Silva (ativo, 5 pagas de 12)
INSERT INTO parcelas (emprestimo_id, cliente_id, numero, valor, valor_original, data_vencimento, data_pagamento, status, juros, multa, desconto)
VALUES
  ('e1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 1, 500, 500, CURRENT_DATE - INTERVAL '5 months', CURRENT_DATE - INTERVAL '5 months', 'paga', 0, 0, 0),
  ('e1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 2, 500, 500, CURRENT_DATE - INTERVAL '4 months', CURRENT_DATE - INTERVAL '4 months', 'paga', 0, 0, 0),
  ('e1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 3, 500, 500, CURRENT_DATE - INTERVAL '3 months', CURRENT_DATE - INTERVAL '3 months', 'paga', 0, 0, 0),
  ('e1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 4, 500, 500, CURRENT_DATE - INTERVAL '2 months', CURRENT_DATE - INTERVAL '2 months', 'paga', 0, 0, 0),
  ('e1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 5, 500, 500, CURRENT_DATE - INTERVAL '1 month', CURRENT_DATE - INTERVAL '1 month', 'paga', 0, 0, 0),
  ('e1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 6, 500, 500, CURRENT_DATE + INTERVAL '15 days', NULL, 'pendente', 0, 0, 0),
  ('e1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 7, 500, 500, CURRENT_DATE + INTERVAL '45 days', NULL, 'pendente', 0, 0, 0),
  ('e1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 8, 500, 500, CURRENT_DATE + INTERVAL '75 days', NULL, 'pendente', 0, 0, 0);

-- Fernanda Lima (ativo, 4 pagas de 12)
INSERT INTO parcelas (emprestimo_id, cliente_id, numero, valor, valor_original, data_vencimento, data_pagamento, status, juros, multa, desconto)
VALUES
  ('e6666666-6666-6666-6666-666666666666', '66666666-6666-6666-6666-666666666666', 1, 440, 440, CURRENT_DATE - INTERVAL '4 months', CURRENT_DATE - INTERVAL '4 months', 'paga', 0, 0, 0),
  ('e6666666-6666-6666-6666-666666666666', '66666666-6666-6666-6666-666666666666', 2, 440, 440, CURRENT_DATE - INTERVAL '3 months', CURRENT_DATE - INTERVAL '3 months', 'paga', 0, 0, 0),
  ('e6666666-6666-6666-6666-666666666666', '66666666-6666-6666-6666-666666666666', 3, 440, 440, CURRENT_DATE - INTERVAL '2 months', CURRENT_DATE - INTERVAL '2 months', 'paga', 0, 0, 0),
  ('e6666666-6666-6666-6666-666666666666', '66666666-6666-6666-6666-666666666666', 4, 440, 440, CURRENT_DATE - INTERVAL '1 month', CURRENT_DATE - INTERVAL '1 month', 'paga', 0, 0, 0),
  ('e6666666-6666-6666-6666-666666666666', '66666666-6666-6666-6666-666666666666', 5, 440, 440, CURRENT_DATE + INTERVAL '25 days', NULL, 'pendente', 0, 0, 0),
  ('e6666666-6666-6666-6666-666666666666', '66666666-6666-6666-6666-666666666666', 6, 440, 440, CURRENT_DATE + INTERVAL '55 days', NULL, 'pendente', 0, 0, 0);

-- Pedro Oliveira (ativo a vencer, 6 pagas de 24)
INSERT INTO parcelas (emprestimo_id, cliente_id, numero, valor, valor_original, data_vencimento, data_pagamento, status, juros, multa, desconto)
VALUES
  ('e3333333-3333-3333-3333-333333333333', '33333333-3333-3333-3333-333333333333', 1, 420, 420, CURRENT_DATE - INTERVAL '6 months', CURRENT_DATE - INTERVAL '6 months', 'paga', 0, 0, 0),
  ('e3333333-3333-3333-3333-333333333333', '33333333-3333-3333-3333-333333333333', 2, 420, 420, CURRENT_DATE - INTERVAL '5 months', CURRENT_DATE - INTERVAL '5 months', 'paga', 0, 0, 0),
  ('e3333333-3333-3333-3333-333333333333', '33333333-3333-3333-3333-333333333333', 3, 420, 420, CURRENT_DATE - INTERVAL '4 months', CURRENT_DATE - INTERVAL '4 months', 'paga', 0, 0, 0),
  ('e3333333-3333-3333-3333-333333333333', '33333333-3333-3333-3333-333333333333', 4, 420, 420, CURRENT_DATE - INTERVAL '3 months', CURRENT_DATE - INTERVAL '3 months', 'paga', 0, 0, 0),
  ('e3333333-3333-3333-3333-333333333333', '33333333-3333-3333-3333-333333333333', 5, 420, 420, CURRENT_DATE - INTERVAL '2 months', CURRENT_DATE - INTERVAL '2 months', 'paga', 0, 0, 0),
  ('e3333333-3333-3333-3333-333333333333', '33333333-3333-3333-3333-333333333333', 6, 420, 420, CURRENT_DATE - INTERVAL '1 month', CURRENT_DATE - INTERVAL '1 month', 'paga', 0, 0, 0),
  ('e3333333-3333-3333-3333-333333333333', '33333333-3333-3333-3333-333333333333', 7, 420, 420, CURRENT_DATE + INTERVAL '5 days', NULL, 'pendente', 0, 0, 0),
  ('e3333333-3333-3333-3333-333333333333', '33333333-3333-3333-3333-333333333333', 8, 420, 420, CURRENT_DATE + INTERVAL '35 days', NULL, 'pendente', 0, 0, 0);

-- Maria Santos (inadimplente, 3 pagas + 2 vencidas)
INSERT INTO parcelas (emprestimo_id, cliente_id, numero, valor, valor_original, data_vencimento, data_pagamento, status, juros, multa, desconto)
VALUES
  ('e2222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 1, 380, 380, CURRENT_DATE - INTERVAL '7 months', CURRENT_DATE - INTERVAL '7 months', 'paga', 0, 0, 0),
  ('e2222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 2, 380, 380, CURRENT_DATE - INTERVAL '6 months', CURRENT_DATE - INTERVAL '6 months', 'paga', 0, 0, 0),
  ('e2222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 3, 380, 380, CURRENT_DATE - INTERVAL '5 months', CURRENT_DATE - INTERVAL '5 months', 'paga', 0, 0, 0),
  ('e2222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 4, 418, 380, CURRENT_DATE - INTERVAL '45 days', NULL, 'vencida', 28, 10, 0),
  ('e2222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 5, 400, 380, CURRENT_DATE - INTERVAL '15 days', NULL, 'vencida', 14, 6, 0),
  ('e2222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 6, 380, 380, CURRENT_DATE + INTERVAL '15 days', NULL, 'pendente', 0, 0, 0);

-- Ana Costa (inadimplente, 1 paga + 3 vencidas)
INSERT INTO parcelas (emprestimo_id, cliente_id, numero, valor, valor_original, data_vencimento, data_pagamento, status, juros, multa, desconto)
VALUES
  ('e4444444-4444-4444-4444-444444444444', '44444444-4444-4444-4444-444444444444', 1, 480, 480, CURRENT_DATE - INTERVAL '4 months', CURRENT_DATE - INTERVAL '4 months', 'paga', 0, 0, 0),
  ('e4444444-4444-4444-4444-444444444444', '44444444-4444-4444-4444-444444444444', 2, 540, 480, CURRENT_DATE - INTERVAL '76 days', NULL, 'vencida', 40, 20, 0),
  ('e4444444-4444-4444-4444-444444444444', '44444444-4444-4444-4444-444444444444', 3, 510, 480, CURRENT_DATE - INTERVAL '46 days', NULL, 'vencida', 20, 10, 0),
  ('e4444444-4444-4444-4444-444444444444', '44444444-4444-4444-4444-444444444444', 4, 500, 480, CURRENT_DATE - INTERVAL '16 days', NULL, 'vencida', 14, 6, 0);

-- Carlos Souza (inadimplente, 8 pagas + 2 vencidas)
INSERT INTO parcelas (emprestimo_id, cliente_id, numero, valor, valor_original, data_vencimento, data_pagamento, status, juros, multa, desconto)
VALUES
  ('e5555555-5555-5555-5555-555555555555', '55555555-5555-5555-5555-555555555555', 1, 450, 450, CURRENT_DATE - INTERVAL '10 months', CURRENT_DATE - INTERVAL '10 months', 'paga', 0, 0, 0),
  ('e5555555-5555-5555-5555-555555555555', '55555555-5555-5555-5555-555555555555', 2, 450, 450, CURRENT_DATE - INTERVAL '9 months', CURRENT_DATE - INTERVAL '9 months', 'paga', 0, 0, 0),
  ('e5555555-5555-5555-5555-555555555555', '55555555-5555-5555-5555-555555555555', 3, 450, 450, CURRENT_DATE - INTERVAL '8 months', CURRENT_DATE - INTERVAL '8 months', 'paga', 0, 0, 0),
  ('e5555555-5555-5555-5555-555555555555', '55555555-5555-5555-5555-555555555555', 4, 450, 450, CURRENT_DATE - INTERVAL '7 months', CURRENT_DATE - INTERVAL '7 months', 'paga', 0, 0, 0),
  ('e5555555-5555-5555-5555-555555555555', '55555555-5555-5555-5555-555555555555', 5, 450, 450, CURRENT_DATE - INTERVAL '6 months', CURRENT_DATE - INTERVAL '6 months', 'paga', 0, 0, 0),
  ('e5555555-5555-5555-5555-555555555555', '55555555-5555-5555-5555-555555555555', 6, 450, 450, CURRENT_DATE - INTERVAL '5 months', CURRENT_DATE - INTERVAL '5 months', 'paga', 0, 0, 0),
  ('e5555555-5555-5555-5555-555555555555', '55555555-5555-5555-5555-555555555555', 7, 450, 450, CURRENT_DATE - INTERVAL '4 months', CURRENT_DATE - INTERVAL '4 months', 'paga', 0, 0, 0),
  ('e5555555-5555-5555-5555-555555555555', '55555555-5555-5555-5555-555555555555', 8, 450, 450, CURRENT_DATE - INTERVAL '3 months', CURRENT_DATE - INTERVAL '3 months', 'paga', 0, 0, 0),
  ('e5555555-5555-5555-5555-555555555555', '55555555-5555-5555-5555-555555555555', 9, 520, 450, CURRENT_DATE - INTERVAL '76 days', NULL, 'vencida', 50, 20, 0),
  ('e5555555-5555-5555-5555-555555555555', '55555555-5555-5555-5555-555555555555', 10, 490, 450, CURRENT_DATE - INTERVAL '46 days', NULL, 'vencida', 28, 12, 0);

-- Roberto Alves (inadimplente, 2 pagas + 1 vencida)
INSERT INTO parcelas (emprestimo_id, cliente_id, numero, valor, valor_original, data_vencimento, data_pagamento, status, juros, multa, desconto)
VALUES
  ('e7777777-7777-7777-7777-777777777777', '77777777-7777-7777-7777-777777777777', 1, 340, 340, CURRENT_DATE - INTERVAL '3 months', CURRENT_DATE - INTERVAL '3 months', 'paga', 0, 0, 0),
  ('e7777777-7777-7777-7777-777777777777', '77777777-7777-7777-7777-777777777777', 2, 340, 340, CURRENT_DATE - INTERVAL '2 months', CURRENT_DATE - INTERVAL '2 months', 'paga', 0, 0, 0),
  ('e7777777-7777-7777-7777-777777777777', '77777777-7777-7777-7777-777777777777', 3, 370, 340, CURRENT_DATE - INTERVAL '23 days', NULL, 'vencida', 20, 10, 0),
  ('e7777777-7777-7777-7777-777777777777', '77777777-7777-7777-7777-777777777777', 4, 340, 340, CURRENT_DATE + INTERVAL '7 days', NULL, 'pendente', 0, 0, 0);

-- Patricia Gomes (inadimplente, 2 pagas + 3 vencidas)
INSERT INTO parcelas (emprestimo_id, cliente_id, numero, valor, valor_original, data_vencimento, data_pagamento, status, juros, multa, desconto)
VALUES
  ('e8888888-8888-8888-8888-888888888888', '88888888-8888-8888-8888-888888888888', 1, 380, 380, CURRENT_DATE - INTERVAL '6 months', CURRENT_DATE - INTERVAL '6 months', 'paga', 0, 0, 0),
  ('e8888888-8888-8888-8888-888888888888', '88888888-8888-8888-8888-888888888888', 2, 380, 380, CURRENT_DATE - INTERVAL '5 months', CURRENT_DATE - INTERVAL '5 months', 'paga', 0, 0, 0),
  ('e8888888-8888-8888-8888-888888888888', '88888888-8888-8888-8888-888888888888', 3, 430, 380, CURRENT_DATE - INTERVAL '120 days', NULL, 'vencida', 35, 15, 0),
  ('e8888888-8888-8888-8888-888888888888', '88888888-8888-8888-8888-888888888888', 4, 415, 380, CURRENT_DATE - INTERVAL '90 days', NULL, 'vencida', 25, 10, 0),
  ('e8888888-8888-8888-8888-888888888888', '88888888-8888-8888-8888-888888888888', 5, 400, 380, CURRENT_DATE - INTERVAL '60 days', NULL, 'vencida', 14, 6, 0);

-- Camila Rodrigues (ativo a vencer, 5 pagas)
INSERT INTO parcelas (emprestimo_id, cliente_id, numero, valor, valor_original, data_vencimento, data_pagamento, status, juros, multa, desconto)
VALUES
  ('ebbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 1, 400, 400, CURRENT_DATE - INTERVAL '5 months', CURRENT_DATE - INTERVAL '5 months', 'paga', 0, 0, 0),
  ('ebbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 2, 400, 400, CURRENT_DATE - INTERVAL '4 months', CURRENT_DATE - INTERVAL '4 months', 'paga', 0, 0, 0),
  ('ebbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 3, 400, 400, CURRENT_DATE - INTERVAL '3 months', CURRENT_DATE - INTERVAL '3 months', 'paga', 0, 0, 0),
  ('ebbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 4, 400, 400, CURRENT_DATE - INTERVAL '2 months', CURRENT_DATE - INTERVAL '2 months', 'paga', 0, 0, 0),
  ('ebbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 5, 400, 400, CURRENT_DATE - INTERVAL '1 month', CURRENT_DATE - INTERVAL '1 month', 'paga', 0, 0, 0),
  ('ebbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 6, 400, 400, CURRENT_DATE + INTERVAL '3 days', NULL, 'pendente', 0, 0, 0);

-- Paulo Mendes (ativo, 3 pagas)
INSERT INTO parcelas (emprestimo_id, cliente_id, numero, valor, valor_original, data_vencimento, data_pagamento, status, juros, multa, desconto)
VALUES
  ('eaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1, 380, 380, CURRENT_DATE - INTERVAL '3 months', CURRENT_DATE - INTERVAL '3 months', 'paga', 0, 0, 0),
  ('eaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 2, 380, 380, CURRENT_DATE - INTERVAL '2 months', CURRENT_DATE - INTERVAL '2 months', 'paga', 0, 0, 0),
  ('eaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 3, 380, 380, CURRENT_DATE - INTERVAL '1 month', CURRENT_DATE - INTERVAL '1 month', 'paga', 0, 0, 0),
  ('eaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 4, 380, 380, CURRENT_DATE + INTERVAL '20 days', NULL, 'pendente', 0, 0, 0);


-- ── TEMPLATES WHATSAPP (4 registros) ─────────────────────────

INSERT INTO templates_whatsapp (nome, categoria, mensagem_masculino, mensagem_feminino, variaveis, ativo)
VALUES
  ('Lembrete de Vencimento', 'lembrete',
   'Olá Sr. {nome}, lembramos que sua parcela de R$ {valor} vence em {data}. Mantenha seu crédito em dia!',
   'Olá Sra. {nome}, lembramos que sua parcela de R$ {valor} vence em {data}. Mantenha seu crédito em dia!',
   ARRAY['nome', 'valor', 'data'], true),

  ('Cobrança Amigável', 'cobranca',
   'Prezado Sr. {nome}, identificamos que sua parcela de R$ {valor} está em atraso há {diasAtraso} dias. Vamos regularizar? Entre em contato.',
   'Prezada Sra. {nome}, identificamos que sua parcela de R$ {valor} está em atraso há {diasAtraso} dias. Vamos regularizar? Entre em contato.',
   ARRAY['nome', 'valor', 'diasAtraso'], true),

  ('Boas-vindas', 'boas_vindas',
   'Bem-vindo ao FintechFlow, Sr. {nome}! Seu crédito de R$ {valor} foi aprovado. Qualquer dúvida, estamos aqui.',
   'Bem-vinda ao FintechFlow, Sra. {nome}! Seu crédito de R$ {valor} foi aprovado. Qualquer dúvida, estamos aqui.',
   ARRAY['nome', 'valor'], true),

  ('Proposta de Negociação', 'negociacao',
   'Sr. {nome}, temos uma proposta especial para regularizar seu débito de R$ {valor}. Desconto de até {desconto}%! Vamos conversar?',
   'Sra. {nome}, temos uma proposta especial para regularizar seu débito de R$ {valor}. Desconto de até {desconto}%! Vamos conversar?',
   ARRAY['nome', 'valor', 'desconto'], true);


-- ── MENSAGENS (conversas de chat) ────────────────────────────

INSERT INTO mensagens (cliente_id, remetente, conteudo, timestamp, lida, tipo)
VALUES
  -- Conversa com João Silva
  ('11111111-1111-1111-1111-111111111111', 'cliente',
   'Olá, gostaria de antecipar minha próxima parcela. Tem desconto?',
   NOW() - INTERVAL '2 hours', true, 'texto'),
  ('11111111-1111-1111-1111-111111111111', 'sistema',
   'Claro, João! Para antecipação oferecemos 5% de desconto. Vou gerar o boleto atualizado.',
   NOW() - INTERVAL '1 hour 55 minutes', true, 'texto'),
  ('11111111-1111-1111-1111-111111111111', 'sistema',
   'Boleto atualizado: R$ 475,00 (desconto de R$ 25,00)',
   NOW() - INTERVAL '1 hour 50 minutes', true, 'boleto'),
  ('11111111-1111-1111-1111-111111111111', 'cliente',
   'Perfeito! Vou pagar agora. Obrigado!',
   NOW() - INTERVAL '1 hour 45 minutes', false, 'texto'),

  -- Conversa com Maria Santos (cobrança)
  ('22222222-2222-2222-2222-222222222222', 'sistema',
   'Olá Maria, identificamos que sua parcela está em atraso há 45 dias. Podemos ajudar a regularizar?',
   NOW() - INTERVAL '3 days', true, 'texto'),
  ('22222222-2222-2222-2222-222222222222', 'cliente',
   'Estou com dificuldades financeiras no momento. Posso parcelar a dívida?',
   NOW() - INTERVAL '3 days' + INTERVAL '30 minutes', true, 'texto'),
  ('22222222-2222-2222-2222-222222222222', 'sistema',
   'Entendemos, Maria. Temos uma proposta: dividir o valor em atraso em 3x sem juros adicionais. Aceita?',
   NOW() - INTERVAL '3 days' + INTERVAL '35 minutes', true, 'texto'),

  -- Conversa com Carlos Souza (cobrança intensa)
  ('55555555-5555-5555-5555-555555555555', 'sistema',
   'Sr. Carlos, seu débito de R$ 12.000 está com 76 dias de atraso. Entre em contato para negociação.',
   NOW() - INTERVAL '5 days', true, 'texto'),
  ('55555555-5555-5555-5555-555555555555', 'sistema',
   'Última tentativa de contato. Regularize sua situação para evitar medidas judiciais.',
   NOW() - INTERVAL '1 day', false, 'texto'),

  -- Conversa com Fernanda Lima
  ('66666666-6666-6666-6666-666666666666', 'cliente',
   'Boa tarde! Preciso do comprovante da minha última parcela paga.',
   NOW() - INTERVAL '6 hours', false, 'texto');


-- ── ANÁLISES DE CRÉDITO (5 registros) ─────────────────────────

INSERT INTO analises_credito (id, cliente_id, cliente_nome, cpf, valor_solicitado, renda_mensal, score_serasa, score_interno, status, data_solicitacao, motivo)
VALUES
  ('ac111111-1111-1111-1111-111111111111',
   NULL, 'Marcos Ribeiro', '111.222.333-44',
   15000.00, 5500.00, 720, 0,
   'pendente', CURRENT_DATE - INTERVAL '7 days', NULL),

  ('ac222222-2222-2222-2222-222222222222',
   NULL, 'Julia Ferreira', '222.333.444-55',
   8000.00, 3200.00, 680, 0,
   'em_analise', CURRENT_DATE - INTERVAL '8 days', NULL),

  ('ac333333-3333-3333-3333-333333333333',
   NULL, 'Rafael Costa', '333.444.555-66',
   25000.00, 8500.00, 800, 0,
   'aprovado', CURRENT_DATE - INTERVAL '9 days', NULL),

  ('ac444444-4444-4444-4444-444444444444',
   NULL, 'Camila Duarte', '444.555.666-77',
   12000.00, 2800.00, 420, 0,
   'recusado', CURRENT_DATE - INTERVAL '10 days',
   'Score abaixo do mínimo + comprometimento de renda > 40%'),

  ('ac555555-5555-5555-5555-555555555555',
   NULL, 'Daniel Almeida', '555.666.777-88',
   6000.00, 4200.00, 650, 0,
   'pendente', CURRENT_DATE - INTERVAL '7 days', NULL);


-- ── VERIFICAÇÃO ──────────────────────────────────────────────
-- Execute para confirmar que os dados foram inseridos:

SELECT 'Clientes' as tabela, COUNT(*) as registros FROM clientes
UNION ALL SELECT 'Empréstimos', COUNT(*) FROM emprestimos
UNION ALL SELECT 'Parcelas', COUNT(*) FROM parcelas
UNION ALL SELECT 'Templates', COUNT(*) FROM templates_whatsapp
UNION ALL SELECT 'Mensagens', COUNT(*) FROM mensagens
UNION ALL SELECT 'Análises Crédito', COUNT(*) FROM analises_credito;

-- Verificar dashboard stats (RPC que as páginas usam):
SELECT get_dashboard_stats();
