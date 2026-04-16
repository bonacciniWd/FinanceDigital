-- Fluxo de exemplo fixo: Atendimento Automático
-- Este fluxo demonstra todas as funcionalidades do editor visual:
-- trigger → mensagem de boas-vindas → condição horário → ramificações de ação/espera/finalizar

-- 1) Inserir o fluxo principal
INSERT INTO fluxos_chatbot (
  id, nome, descricao, departamento, status, gatilho, palavra_chave
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Atendimento Automático (Exemplo)',
  'Fluxo de exemplo: recebe mensagem, verifica horário comercial, oferece opções de atendimento com botões, transfere para atendente humano se necessário.',
  'geral',
  'rascunho',
  'palavra_chave',
  'oi, olá, bom dia, boa tarde, boa noite, ajuda, menu'
) ON CONFLICT (id) DO NOTHING;

-- 2) Inserir as etapas com config JSONB (posições, connections, params)

-- Etapa 1: Boas-vindas
INSERT INTO fluxos_chatbot_etapas (
  id, fluxo_id, ordem, tipo, conteudo, config
) VALUES (
  '00000000-0000-0000-0001-000000000001',
  '00000000-0000-0000-0000-000000000001',
  0,
  'mensagem',
  'Olá {nome}! 👋 Seja bem-vindo(a) à Fintech.\nComo posso ajudá-lo(a)?',
  '{
    "position": {"x": 300, "y": 200},
    "buttons": [
      {"label": "💰 Cobrança", "value": "cobranca"},
      {"label": "📊 Meu Saldo", "value": "saldo"},
      {"label": "🧑‍💼 Falar com Atendente", "value": "atendente"}
    ],
    "delay_ms": 1000,
    "connections": [
      {"targetId": "00000000-0000-0000-0001-000000000002"}
    ]
  }'::jsonb
) ON CONFLICT (id) DO NOTHING;

-- Etapa 2: Condição — Horário Comercial?
INSERT INTO fluxos_chatbot_etapas (
  id, fluxo_id, ordem, tipo, conteudo, config, proximo_sim, proximo_nao
) VALUES (
  '00000000-0000-0000-0001-000000000002',
  '00000000-0000-0000-0000-000000000001',
  1,
  'condicao',
  'Dentro do horário comercial?',
  '{
    "position": {"x": 300, "y": 420},
    "variable": "horario",
    "operator": "equals",
    "value": "08:00-18:00",
    "connections": [
      {"targetId": "00000000-0000-0000-0001-000000000003", "sourceHandle": "sim", "label": "Sim"},
      {"targetId": "00000000-0000-0000-0001-000000000006", "sourceHandle": "nao", "label": "Não"}
    ]
  }'::jsonb,
  '00000000-0000-0000-0001-000000000003',
  '00000000-0000-0000-0001-000000000006'
) ON CONFLICT (id) DO NOTHING;

-- Etapa 3: Condição — Qual opção o cliente escolheu?
INSERT INTO fluxos_chatbot_etapas (
  id, fluxo_id, ordem, tipo, conteudo, config, proximo_sim, proximo_nao
) VALUES (
  '00000000-0000-0000-0001-000000000003',
  '00000000-0000-0000-0000-000000000001',
  2,
  'condicao',
  'Cliente quer falar com atendente?',
  '{
    "position": {"x": 150, "y": 620},
    "variable": "resposta",
    "operator": "equals",
    "value": "atendente",
    "connections": [
      {"targetId": "00000000-0000-0000-0001-000000000004", "sourceHandle": "sim", "label": "Sim"},
      {"targetId": "00000000-0000-0000-0001-000000000005", "sourceHandle": "nao", "label": "Não"}
    ]
  }'::jsonb,
  '00000000-0000-0000-0001-000000000004',
  '00000000-0000-0000-0001-000000000005'
) ON CONFLICT (id) DO NOTHING;

-- Etapa 4: Ação — Transferir para atendente do departamento cobrança
INSERT INTO fluxos_chatbot_etapas (
  id, fluxo_id, ordem, tipo, conteudo, config, proximo_sim
) VALUES (
  '00000000-0000-0000-0001-000000000004',
  '00000000-0000-0000-0000-000000000001',
  3,
  'acao',
  'Transferindo para um atendente humano...',
  '{
    "position": {"x": 50, "y": 830},
    "action_type": "transferir_atendente",
    "action_param": "cobranca",
    "connections": [
      {"targetId": "00000000-0000-0000-0001-000000000008"}
    ]
  }'::jsonb,
  '00000000-0000-0000-0001-000000000008'
) ON CONFLICT (id) DO NOTHING;

-- Etapa 5: Mensagem — Resposta automática (saldo/cobrança)
INSERT INTO fluxos_chatbot_etapas (
  id, fluxo_id, ordem, tipo, conteudo, config, proximo_sim
) VALUES (
  '00000000-0000-0000-0001-000000000005',
  '00000000-0000-0000-0000-000000000001',
  4,
  'mensagem',
  'Entendi! Estou verificando suas informações... 📊\nEm instantes enviarei os detalhes.',
  '{
    "position": {"x": 300, "y": 830},
    "delay_ms": 2000,
    "connections": [
      {"targetId": "00000000-0000-0000-0001-000000000007"}
    ]
  }'::jsonb,
  '00000000-0000-0000-0001-000000000007'
) ON CONFLICT (id) DO NOTHING;

-- Etapa 6: Mensagem — Fora do horário
INSERT INTO fluxos_chatbot_etapas (
  id, fluxo_id, ordem, tipo, conteudo, config, proximo_sim
) VALUES (
  '00000000-0000-0000-0001-000000000006',
  '00000000-0000-0000-0000-000000000001',
  5,
  'mensagem',
  'Nosso horário de atendimento é de segunda a sexta, das 08:00 às 18:00. ⏰\nDeixe sua mensagem que retornaremos assim que possível!',
  '{
    "position": {"x": 520, "y": 620},
    "delay_ms": 1000,
    "buttons": [
      {"label": "OK, entendi", "value": "ok"},
      {"label": "É urgente", "value": "urgente"}
    ],
    "connections": [
      {"targetId": "00000000-0000-0000-0001-000000000009"}
    ]
  }'::jsonb,
  '00000000-0000-0000-0001-000000000009'
) ON CONFLICT (id) DO NOTHING;

-- Etapa 7: Espera 5 min + Envio de cobrança
INSERT INTO fluxos_chatbot_etapas (
  id, fluxo_id, ordem, tipo, conteudo, config, proximo_sim
) VALUES (
  '00000000-0000-0000-0001-000000000007',
  '00000000-0000-0000-0000-000000000001',
  6,
  'espera',
  'Aguardando processamento...',
  '{
    "position": {"x": 300, "y": 1020},
    "duration_ms": 5000,
    "duration_label": "Aguardar 5s",
    "connections": [
      {"targetId": "00000000-0000-0000-0001-000000000009"}
    ]
  }'::jsonb,
  '00000000-0000-0000-0001-000000000009'
) ON CONFLICT (id) DO NOTHING;

-- Etapa 8: Mensagem após transferência
INSERT INTO fluxos_chatbot_etapas (
  id, fluxo_id, ordem, tipo, conteudo, config, proximo_sim
) VALUES (
  '00000000-0000-0000-0001-000000000008',
  '00000000-0000-0000-0000-000000000001',
  7,
  'mensagem',
  'Você foi transferido para nosso atendente. Aguarde um momento! 🙏',
  '{
    "position": {"x": 50, "y": 1020},
    "delay_ms": 500,
    "connections": [
      {"targetId": "00000000-0000-0000-0001-000000000009"}
    ]
  }'::jsonb,
  '00000000-0000-0000-0001-000000000009'
) ON CONFLICT (id) DO NOTHING;

-- Etapa 9: Finalizar
INSERT INTO fluxos_chatbot_etapas (
  id, fluxo_id, ordem, tipo, conteudo, config
) VALUES (
  '00000000-0000-0000-0001-000000000009',
  '00000000-0000-0000-0000-000000000001',
  8,
  'finalizar',
  'Obrigado pelo contato! Até a próxima. 😊',
  '{
    "position": {"x": 300, "y": 1220},
    "close_reason": "atendimento_concluido"
  }'::jsonb
) ON CONFLICT (id) DO NOTHING;
