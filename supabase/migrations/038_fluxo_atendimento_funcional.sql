-- Migration 038: Fluxo de Atendimento Funcional
-- Substitui o fluxo exemplo (036) por um fluxo completo com ações reais:
--   - Identificação automática por telefone ou CPF
--   - Consulta de parcelas (abertas e vencidas)
--   - Consulta de saldo / score financeiro
--   - Proposta de acordo para parcelas vencidas
--   - Pagamento via Pix (copia e cola)
--   - Criação de ticket para atendente humano
--   - Loops de navegação entre menus

-- 0) Remover etapas e fluxo antigos
DELETE FROM fluxos_chatbot_etapas WHERE fluxo_id = '00000000-0000-0000-0000-000000000001';
DELETE FROM fluxos_chatbot WHERE id = '00000000-0000-0000-0000-000000000001';

-- Finalizar sessões que usavam o fluxo antigo
UPDATE chatbot_sessoes
  SET status = 'finalizado'
  WHERE fluxo_id = '00000000-0000-0000-0000-000000000001'
    AND status IN ('ativo', 'aguardando_resposta', 'espera');

-- 1) Inserir o fluxo principal
INSERT INTO fluxos_chatbot (
  id, nome, descricao, departamento, status, gatilho, palavra_chave
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Atendimento Inteligente',
  'Fluxo completo: identifica cliente, consulta parcelas/saldo, propõe acordo, gera Pix, cria ticket.',
  'geral',
  'ativo',
  'palavra_chave',
  'oi, olá, ola, bom dia, boa tarde, boa noite, ajuda, menu, atendimento, inicio'
);

-- ═══════════════════════════════════════════════════════════
-- 2) ETAPAS DO FLUXO
-- ═══════════════════════════════════════════════════════════

-- ── E01: Boas-vindas + Menu Principal ──────────────────────
INSERT INTO fluxos_chatbot_etapas (
  id, fluxo_id, ordem, tipo, conteudo, config, proximo_sim
) VALUES (
  '00000000-0000-0000-0001-000000000001',
  '00000000-0000-0000-0000-000000000001',
  0,
  'mensagem',
  'Olá {nome}! 👋 Sou o assistente virtual da Fintech.\nComo posso ajudá-lo(a) hoje?',
  '{
    "position": {"x": 300, "y": 50},
    "buttons": [
      {"label": "💰 Cobrança / Parcelas", "value": "cobranca"},
      {"label": "📊 Meu Saldo / Score", "value": "saldo"},
      {"label": "👤 Falar com Atendente", "value": "atendente"}
    ],
    "delay_ms": 800,
    "connections": [
      {"targetId": "00000000-0000-0000-0001-000000000002"}
    ]
  }'::jsonb,
  '00000000-0000-0000-0001-000000000002'
);

-- ── E02: Condição — Quer atendente? ────────────────────────
INSERT INTO fluxos_chatbot_etapas (
  id, fluxo_id, ordem, tipo, conteudo, config, proximo_sim, proximo_nao
) VALUES (
  '00000000-0000-0000-0001-000000000002',
  '00000000-0000-0000-0000-000000000001',
  1,
  'condicao',
  'Cliente quer atendente?',
  '{
    "position": {"x": 300, "y": 220},
    "variable": "resposta",
    "operator": "equals",
    "value": "atendente",
    "connections": [
      {"targetId": "00000000-0000-0000-0001-000000000025", "sourceHandle": "sim", "label": "Sim"},
      {"targetId": "00000000-0000-0000-0001-000000000003", "sourceHandle": "nao", "label": "Não"}
    ]
  }'::jsonb,
  '00000000-0000-0000-0001-000000000025',
  '00000000-0000-0000-0001-000000000003'
);

-- ── E03: Condição — Quer saldo? ────────────────────────────
INSERT INTO fluxos_chatbot_etapas (
  id, fluxo_id, ordem, tipo, conteudo, config, proximo_sim, proximo_nao
) VALUES (
  '00000000-0000-0000-0001-000000000003',
  '00000000-0000-0000-0000-000000000001',
  2,
  'condicao',
  'Cliente quer saldo/score?',
  '{
    "position": {"x": 300, "y": 370},
    "variable": "resposta",
    "operator": "equals",
    "value": "saldo",
    "connections": [
      {"targetId": "00000000-0000-0000-0001-000000000020", "sourceHandle": "sim", "label": "Sim"},
      {"targetId": "00000000-0000-0000-0001-000000000004", "sourceHandle": "nao", "label": "Não (cobrança)"}
    ]
  }'::jsonb,
  '00000000-0000-0000-0001-000000000020',
  '00000000-0000-0000-0001-000000000004'
);

-- ── E04: Condição — Cliente identificado por telefone? ─────
INSERT INTO fluxos_chatbot_etapas (
  id, fluxo_id, ordem, tipo, conteudo, config, proximo_sim, proximo_nao
) VALUES (
  '00000000-0000-0000-0001-000000000004',
  '00000000-0000-0000-0000-000000000001',
  3,
  'condicao',
  'Cliente já identificado pelo telefone?',
  '{
    "position": {"x": 300, "y": 520},
    "variable": "cliente_encontrado",
    "operator": "equals",
    "value": "true",
    "connections": [
      {"targetId": "00000000-0000-0000-0001-000000000010", "sourceHandle": "sim", "label": "Sim"},
      {"targetId": "00000000-0000-0000-0001-000000000005", "sourceHandle": "nao", "label": "Não"}
    ]
  }'::jsonb,
  '00000000-0000-0000-0001-000000000010',
  '00000000-0000-0000-0001-000000000005'
);

-- ── E05: Pedir CPF (texto livre) ──────────────────────────
INSERT INTO fluxos_chatbot_etapas (
  id, fluxo_id, ordem, tipo, conteudo, config, proximo_sim
) VALUES (
  '00000000-0000-0000-0001-000000000005',
  '00000000-0000-0000-0000-000000000001',
  4,
  'mensagem',
  'Para consultar suas informações, preciso identificá-lo(a).\n\nPor favor, informe seu *CPF* (apenas números, sem pontos ou traços):',
  '{
    "position": {"x": 550, "y": 520},
    "wait_for_input": true,
    "connections": [
      {"targetId": "00000000-0000-0000-0001-000000000006"}
    ]
  }'::jsonb,
  '00000000-0000-0000-0001-000000000006'
);

-- ── E06: Ação — Identificar por CPF ──────────────────────
INSERT INTO fluxos_chatbot_etapas (
  id, fluxo_id, ordem, tipo, conteudo, config, proximo_sim, proximo_nao
) VALUES (
  '00000000-0000-0000-0001-000000000006',
  '00000000-0000-0000-0000-000000000001',
  5,
  'acao',
  NULL,
  '{
    "position": {"x": 550, "y": 670},
    "action_type": "identificar_cpf",
    "action_param": "",
    "connections": [
      {"targetId": "00000000-0000-0000-0001-000000000010", "sourceHandle": "sim", "label": "Encontrado"},
      {"targetId": "00000000-0000-0000-0001-000000000007", "sourceHandle": "nao", "label": "Não encontrado"}
    ]
  }'::jsonb,
  '00000000-0000-0000-0001-000000000010',
  '00000000-0000-0000-0001-000000000007'
);

-- ── E07: CPF não encontrado + opções ──────────────────────
INSERT INTO fluxos_chatbot_etapas (
  id, fluxo_id, ordem, tipo, conteudo, config, proximo_sim
) VALUES (
  '00000000-0000-0000-0001-000000000007',
  '00000000-0000-0000-0000-000000000001',
  6,
  'mensagem',
  '❌ CPF não encontrado em nosso sistema.\nVerifique os dados e tente novamente.',
  '{
    "position": {"x": 700, "y": 670},
    "buttons": [
      {"label": "🔄 Tentar novamente", "value": "tentar"},
      {"label": "👤 Falar com Atendente", "value": "atendente"}
    ],
    "connections": [
      {"targetId": "00000000-0000-0000-0001-000000000008"}
    ]
  }'::jsonb,
  '00000000-0000-0000-0001-000000000008'
);

-- ── E08: Condição — Tentar novamente? ─────────────────────
INSERT INTO fluxos_chatbot_etapas (
  id, fluxo_id, ordem, tipo, conteudo, config, proximo_sim, proximo_nao
) VALUES (
  '00000000-0000-0000-0001-000000000008',
  '00000000-0000-0000-0000-000000000001',
  7,
  'condicao',
  'Quer tentar CPF novamente?',
  '{
    "position": {"x": 700, "y": 820},
    "variable": "resposta",
    "operator": "equals",
    "value": "tentar",
    "connections": [
      {"targetId": "00000000-0000-0000-0001-000000000005", "sourceHandle": "sim", "label": "Sim"},
      {"targetId": "00000000-0000-0000-0001-000000000025", "sourceHandle": "nao", "label": "Atendente"}
    ]
  }'::jsonb,
  '00000000-0000-0000-0001-000000000005',
  '00000000-0000-0000-0001-000000000025'
);

-- ═══════════════════════════════════════════════════════════
-- SUBMENU: COBRANÇA
-- ═══════════════════════════════════════════════════════════

-- ── E10: Ação — Consultar parcelas (resumo) ───────────────
INSERT INTO fluxos_chatbot_etapas (
  id, fluxo_id, ordem, tipo, conteudo, config, proximo_sim
) VALUES (
  '00000000-0000-0000-0001-000000000010',
  '00000000-0000-0000-0000-000000000001',
  9,
  'acao',
  NULL,
  '{
    "position": {"x": 100, "y": 720},
    "action_type": "consultar_parcelas",
    "action_param": "resumo",
    "connections": [
      {"targetId": "00000000-0000-0000-0001-000000000011"}
    ]
  }'::jsonb,
  '00000000-0000-0000-0001-000000000011'
);

-- ── E11: Menu Cobrança ────────────────────────────────────
INSERT INTO fluxos_chatbot_etapas (
  id, fluxo_id, ordem, tipo, conteudo, config, proximo_sim
) VALUES (
  '00000000-0000-0000-0001-000000000011',
  '00000000-0000-0000-0000-000000000001',
  10,
  'mensagem',
  'O que deseja fazer?',
  '{
    "position": {"x": 100, "y": 870},
    "buttons": [
      {"label": "⚠️ Ver Parcelas Vencidas", "value": "vencidas"},
      {"label": "🤝 Fazer Acordo", "value": "acordo"},
      {"label": "💳 Pagar via Pix", "value": "pix"},
      {"label": "📊 Consultar Saldo", "value": "saldo"},
      {"label": "👤 Falar com Atendente", "value": "atendente"},
      {"label": "✅ Encerrar", "value": "encerrar"}
    ],
    "connections": [
      {"targetId": "00000000-0000-0000-0001-000000000012"}
    ]
  }'::jsonb,
  '00000000-0000-0000-0001-000000000012'
);

-- ── E12: Condição — Vencidas? ─────────────────────────────
INSERT INTO fluxos_chatbot_etapas (
  id, fluxo_id, ordem, tipo, conteudo, config, proximo_sim, proximo_nao
) VALUES (
  '00000000-0000-0000-0001-000000000012',
  '00000000-0000-0000-0000-000000000001',
  11,
  'condicao',
  'Ver parcelas vencidas?',
  '{
    "position": {"x": -100, "y": 1040},
    "variable": "resposta",
    "operator": "equals",
    "value": "vencidas",
    "connections": [
      {"targetId": "00000000-0000-0000-0001-000000000013", "sourceHandle": "sim"},
      {"targetId": "00000000-0000-0000-0001-000000000014", "sourceHandle": "nao"}
    ]
  }'::jsonb,
  '00000000-0000-0000-0001-000000000013',
  '00000000-0000-0000-0001-000000000014'
);

-- ── E13: Ação — Consultar parcelas vencidas ───────────────
INSERT INTO fluxos_chatbot_etapas (
  id, fluxo_id, ordem, tipo, conteudo, config, proximo_sim
) VALUES (
  '00000000-0000-0000-0001-000000000013',
  '00000000-0000-0000-0000-000000000001',
  12,
  'acao',
  NULL,
  '{
    "position": {"x": -250, "y": 1040},
    "action_type": "consultar_parcelas",
    "action_param": "vencidas",
    "connections": [
      {"targetId": "00000000-0000-0000-0001-000000000011"}
    ]
  }'::jsonb,
  '00000000-0000-0000-0001-000000000011'
);

-- ── E14: Condição — Acordo? ───────────────────────────────
INSERT INTO fluxos_chatbot_etapas (
  id, fluxo_id, ordem, tipo, conteudo, config, proximo_sim, proximo_nao
) VALUES (
  '00000000-0000-0000-0001-000000000014',
  '00000000-0000-0000-0000-000000000001',
  13,
  'condicao',
  'Quer fazer acordo?',
  '{
    "position": {"x": 0, "y": 1180},
    "variable": "resposta",
    "operator": "equals",
    "value": "acordo",
    "connections": [
      {"targetId": "00000000-0000-0000-0001-000000000015", "sourceHandle": "sim"},
      {"targetId": "00000000-0000-0000-0001-000000000016", "sourceHandle": "nao"}
    ]
  }'::jsonb,
  '00000000-0000-0000-0001-000000000015',
  '00000000-0000-0000-0001-000000000016'
);

-- ── E15: Ação — Propor acordo ─────────────────────────────
INSERT INTO fluxos_chatbot_etapas (
  id, fluxo_id, ordem, tipo, conteudo, config, proximo_sim
) VALUES (
  '00000000-0000-0000-0001-000000000015',
  '00000000-0000-0000-0000-000000000001',
  14,
  'acao',
  NULL,
  '{
    "position": {"x": -200, "y": 1180},
    "action_type": "propor_acordo",
    "action_param": "",
    "connections": [
      {"targetId": "00000000-0000-0000-0001-000000000011"}
    ]
  }'::jsonb,
  '00000000-0000-0000-0001-000000000011'
);

-- ── E16: Condição — Pix? ──────────────────────────────────
INSERT INTO fluxos_chatbot_etapas (
  id, fluxo_id, ordem, tipo, conteudo, config, proximo_sim, proximo_nao
) VALUES (
  '00000000-0000-0000-0001-000000000016',
  '00000000-0000-0000-0000-000000000001',
  15,
  'condicao',
  'Pagar via Pix?',
  '{
    "position": {"x": 100, "y": 1320},
    "variable": "resposta",
    "operator": "equals",
    "value": "pix",
    "connections": [
      {"targetId": "00000000-0000-0000-0001-000000000017", "sourceHandle": "sim"},
      {"targetId": "00000000-0000-0000-0001-000000000018", "sourceHandle": "nao"}
    ]
  }'::jsonb,
  '00000000-0000-0000-0001-000000000017',
  '00000000-0000-0000-0001-000000000018'
);

-- ── E17: Ação — Buscar Pix ────────────────────────────────
INSERT INTO fluxos_chatbot_etapas (
  id, fluxo_id, ordem, tipo, conteudo, config, proximo_sim
) VALUES (
  '00000000-0000-0000-0001-000000000017',
  '00000000-0000-0000-0000-000000000001',
  16,
  'acao',
  NULL,
  '{
    "position": {"x": -100, "y": 1320},
    "action_type": "buscar_pix",
    "action_param": "",
    "connections": [
      {"targetId": "00000000-0000-0000-0001-000000000011"}
    ]
  }'::jsonb,
  '00000000-0000-0000-0001-000000000011'
);

-- ── E18: Condição — Saldo (do menu cobrança)? ─────────────
INSERT INTO fluxos_chatbot_etapas (
  id, fluxo_id, ordem, tipo, conteudo, config, proximo_sim, proximo_nao
) VALUES (
  '00000000-0000-0000-0001-000000000018',
  '00000000-0000-0000-0000-000000000001',
  17,
  'condicao',
  'Consultar saldo?',
  '{
    "position": {"x": 200, "y": 1460},
    "variable": "resposta",
    "operator": "equals",
    "value": "saldo",
    "connections": [
      {"targetId": "00000000-0000-0000-0001-000000000020", "sourceHandle": "sim"},
      {"targetId": "00000000-0000-0000-0001-000000000019", "sourceHandle": "nao"}
    ]
  }'::jsonb,
  '00000000-0000-0000-0001-000000000020',
  '00000000-0000-0000-0001-000000000019'
);

-- ── E19: Condição — Atendente (do menu cobrança)? ─────────
INSERT INTO fluxos_chatbot_etapas (
  id, fluxo_id, ordem, tipo, conteudo, config, proximo_sim, proximo_nao
) VALUES (
  '00000000-0000-0000-0001-000000000019',
  '00000000-0000-0000-0000-000000000001',
  18,
  'condicao',
  'Falar com atendente?',
  '{
    "position": {"x": 300, "y": 1600},
    "variable": "resposta",
    "operator": "equals",
    "value": "atendente",
    "connections": [
      {"targetId": "00000000-0000-0000-0001-000000000025", "sourceHandle": "sim"},
      {"targetId": "00000000-0000-0000-0001-000000000030", "sourceHandle": "nao", "label": "Encerrar"}
    ]
  }'::jsonb,
  '00000000-0000-0000-0001-000000000025',
  '00000000-0000-0000-0001-000000000030'
);

-- ═══════════════════════════════════════════════════════════
-- SUBMENU: SALDO / SCORE
-- ═══════════════════════════════════════════════════════════

-- ── E20: Ação — Consultar saldo ───────────────────────────
INSERT INTO fluxos_chatbot_etapas (
  id, fluxo_id, ordem, tipo, conteudo, config, proximo_sim, proximo_nao
) VALUES (
  '00000000-0000-0000-0001-000000000020',
  '00000000-0000-0000-0000-000000000001',
  19,
  'acao',
  NULL,
  '{
    "position": {"x": 600, "y": 370},
    "action_type": "consultar_saldo",
    "action_param": "",
    "connections": [
      {"targetId": "00000000-0000-0000-0001-000000000021", "sourceHandle": "sim"},
      {"targetId": "00000000-0000-0000-0001-000000000021", "sourceHandle": "nao"}
    ]
  }'::jsonb,
  '00000000-0000-0000-0001-000000000021',
  '00000000-0000-0000-0001-000000000021'
);

-- ── E21: Menu pós-saldo ───────────────────────────────────
INSERT INTO fluxos_chatbot_etapas (
  id, fluxo_id, ordem, tipo, conteudo, config, proximo_sim
) VALUES (
  '00000000-0000-0000-0001-000000000021',
  '00000000-0000-0000-0000-000000000001',
  20,
  'mensagem',
  'Deseja mais alguma coisa?',
  '{
    "position": {"x": 600, "y": 520},
    "buttons": [
      {"label": "💰 Cobrança / Parcelas", "value": "cobranca"},
      {"label": "👤 Falar com Atendente", "value": "atendente"},
      {"label": "✅ Encerrar", "value": "encerrar"}
    ],
    "connections": [
      {"targetId": "00000000-0000-0000-0001-000000000022"}
    ]
  }'::jsonb,
  '00000000-0000-0000-0001-000000000022'
);

-- ── E22: Condição — Cobrança (do menu saldo)? ─────────────
INSERT INTO fluxos_chatbot_etapas (
  id, fluxo_id, ordem, tipo, conteudo, config, proximo_sim, proximo_nao
) VALUES (
  '00000000-0000-0000-0001-000000000022',
  '00000000-0000-0000-0000-000000000001',
  21,
  'condicao',
  'Quer ir pra cobrança?',
  '{
    "position": {"x": 600, "y": 670},
    "variable": "resposta",
    "operator": "equals",
    "value": "cobranca",
    "connections": [
      {"targetId": "00000000-0000-0000-0001-000000000004", "sourceHandle": "sim", "label": "Cobrança"},
      {"targetId": "00000000-0000-0000-0001-000000000023", "sourceHandle": "nao"}
    ]
  }'::jsonb,
  '00000000-0000-0000-0001-000000000004',
  '00000000-0000-0000-0001-000000000023'
);

-- ── E23: Condição — Atendente (do menu saldo)? ────────────
INSERT INTO fluxos_chatbot_etapas (
  id, fluxo_id, ordem, tipo, conteudo, config, proximo_sim, proximo_nao
) VALUES (
  '00000000-0000-0000-0001-000000000023',
  '00000000-0000-0000-0000-000000000001',
  22,
  'condicao',
  'Falar com atendente?',
  '{
    "position": {"x": 600, "y": 820},
    "variable": "resposta",
    "operator": "equals",
    "value": "atendente",
    "connections": [
      {"targetId": "00000000-0000-0000-0001-000000000025", "sourceHandle": "sim"},
      {"targetId": "00000000-0000-0000-0001-000000000030", "sourceHandle": "nao", "label": "Encerrar"}
    ]
  }'::jsonb,
  '00000000-0000-0000-0001-000000000025',
  '00000000-0000-0000-0001-000000000030'
);

-- ═══════════════════════════════════════════════════════════
-- ATENDENTE HUMANO
-- ═══════════════════════════════════════════════════════════

-- ── E25: Ação — Criar ticket de atendimento ───────────────
INSERT INTO fluxos_chatbot_etapas (
  id, fluxo_id, ordem, tipo, conteudo, config, proximo_sim
) VALUES (
  '00000000-0000-0000-0001-000000000025',
  '00000000-0000-0000-0000-000000000001',
  24,
  'acao',
  NULL,
  '{
    "position": {"x": 900, "y": 220},
    "action_type": "criar_ticket",
    "action_param": "Atendimento solicitado via chatbot",
    "connections": [
      {"targetId": "00000000-0000-0000-0001-000000000026"}
    ]
  }'::jsonb,
  '00000000-0000-0000-0001-000000000026'
);

-- ── E26: Mensagem de confirmação do ticket ────────────────
INSERT INTO fluxos_chatbot_etapas (
  id, fluxo_id, ordem, tipo, conteudo, config, proximo_sim
) VALUES (
  '00000000-0000-0000-0001-000000000026',
  '00000000-0000-0000-0000-000000000001',
  25,
  'mensagem',
  'Um atendente entrará em contato em breve! 🙏\nSe precisar de algo novamente, é só enviar *oi*.',
  '{
    "position": {"x": 900, "y": 370},
    "delay_ms": 500,
    "connections": [
      {"targetId": "00000000-0000-0000-0001-000000000030"}
    ]
  }'::jsonb,
  '00000000-0000-0000-0001-000000000030'
);

-- ═══════════════════════════════════════════════════════════
-- FINALIZAR
-- ═══════════════════════════════════════════════════════════

-- ── E30: Finalizar atendimento ────────────────────────────
INSERT INTO fluxos_chatbot_etapas (
  id, fluxo_id, ordem, tipo, conteudo, config
) VALUES (
  '00000000-0000-0000-0001-000000000030',
  '00000000-0000-0000-0000-000000000001',
  29,
  'finalizar',
  'Obrigado pelo contato! 😊 Se precisar de algo, é só mandar *oi* a qualquer momento.',
  '{
    "position": {"x": 600, "y": 970},
    "close_reason": "encerrado_pelo_bot"
  }'::jsonb
);
