# FinanceDigital — Documentação Técnica Completa

> **Atualizado:** 25 de abril de 2026 — v1.4.4  
> **Stack:** React 18 · TypeScript 5 · Vite 6 · Tailwind CSS v4 · Supabase · React Query (TanStack) · Tesseract.js (OCR)

---

## Sumário

### Parte I — Arquitetura & Código

1. [Arquitetura Geral](#1-arquitetura-geral)
2. [Banco de Dados — Tabelas](#2-banco-de-dados--tabelas)
3. [Enums (PostgreSQL)](#3-enums-postgresql)
4. [Políticas RLS (Row Level Security)](#4-políticas-rls)
5. [Funções RPC](#5-funções-rpc)
6. [Edge Functions (Deno)](#6-edge-functions-deno)
7. [TypeScript — Tipos](#7-typescript--tipos)
8. [Adapters (snake_case ↔ camelCase)](#8-adapters)
9. [Services (Camada de dados)](#9-services)
10. [React Query Hooks](#10-react-query-hooks)
11. [Páginas e Rotas](#11-páginas-e-rotas)
12. [Sidebar / Navegação (RBAC)](#12-sidebar--navegação-rbac)
13. [Painel de Empréstimo (EmprestimoDetailModal)](#13-painel-de-empréstimo-emprestimodetailmodal)
14. [Tema e Dark Mode](#14-tema-e-dark-mode)
15. [Rede de Indicações — Arquitetura](#15-rede-de-indicações--arquitetura)
16. [Rede de Indicações — Páginas](#16-rede-de-indicações--páginas)
17. [Guia: Criar Instância WhatsApp (Evolution API)](#17-guia-criar-instância-whatsapp-evolution-api)
18. [Editor Visual de Fluxos (ReactFlow)](#18-editor-visual-de-fluxos-reactflow)
19. [WhatsApp: Internals & Bugs Resolvidos](#19-whatsapp-internals--bugs-resolvidos)
20. [Bot WhatsApp — Auto-Reply Score/Status](#20-bot-whatsapp--auto-reply-scorestatus-v60--07032026)
21. [Produtividade da Equipe — Kanban + Auto-Ticket](#21-produtividade-da-equipe--kanban--auto-ticket-v61--11032026)
22. [Integração Woovi (OpenPix) — Pagamentos Pix](#22-integração-woovi-openpix--pagamentos-pix)
23. [Kanban Cobrança — Negociação Pix + Normalização Telefone](#23-kanban-cobrança--negociação-pix--normalização-telefone-v71--17032026)
24. [Métricas do Projeto](#24-métricas-do-projeto-v731)
25. [Chat Interno — FloatingChat Widget](#25-chat-interno--floatchat-widget-v730--18032026)
26. [Verificação de Identidade — Análise de Crédito](#26-verificação-de-identidade--análise-de-crédito-v740--19032026)

### Parte II — Deploy, Integrações & Operações

27. [Pré-requisitos de Deploy](#27-pré-requisitos-de-deploy)
28. [Deploy de Edge Functions](#28-deploy-de-edge-functions)
29. [EFI Bank (Gerencianet) — Configuração Completa](#29-efi-bank-gerencianet--configuração-completa)
30. [Woovi (OpenPix) — Configuração](#30-woovi-openpix--configuração)
31. [Webhook WhatsApp (Evolution API)](#31-webhook-whatsapp-evolution-api)
32. [Migrations (Banco de Dados)](#32-migrations-banco-de-dados)
33. [Variáveis de Ambiente](#33-variáveis-de-ambiente)
34. [Arquitetura de Edge Functions](#34-arquitetura-de-edge-functions)
35. [Fluxo de Aprovação de Crédito](#35-fluxo-de-aprovação-de-crédito)
36. [Notificações Automatizadas (Cron)](#36-notificações-automatizadas-cron)
37. [Templates de Mensagens](#37-templates-de-mensagens)
38. [IP Whitelist & Segurança](#38-ip-whitelist--segurança)
39. [Pagamentos Pix (Woovi)](#39-pagamentos-pix-woovi)
40. [Gestão de Parcelas](#40-gestão-de-parcelas)
41. [Arquitetura Frontend](#41-arquitetura-frontend)
42. [Aplicativo Desktop (Electron)](#42-aplicativo-desktop-electron)
43. [Troubleshooting](#43-troubleshooting)
44. [Profissão + Pagamento Configurável](#44-profissão--pagamento-configurável-v820--26032026)
45. [Pendências + Notificações Realtime](#45-pendências--notificações-realtime-v830--30032026)
46. [Mapa Interativo + Filtro por Cidade](#46-mapa-interativo--filtro-por-cidade-v840--30032026)
47. [Cobranças Automáticas EFI cobv](#47-cobranças-automáticas-efi-cobv-v850--31032026)
48. [Comprovantes de Pagamento](#48-comprovantes-de-pagamento-v850--31032026)
49. [Configurações do Sistema](#49-configurações-do-sistema-v850--31032026)

---

## 1. Arquitetura Geral

```
Browser
  └─ React 18 (SPA)
       ├─ react-router v7       ← Rotas
       ├─ TanStack React Query  ← Cache & estado do servidor
       ├─ Tailwind CSS v4       ← Estilização + dark mode
       └─ Supabase Client
            ├─ Auth        (JWT, RLS)
            ├─ Database    (PostgreSQL 15)
            ├─ Realtime    (mensagens, whatsapp)
            └─ Edge Funcs  (invite-user, update-user-role, delete-user,
                            send-whatsapp, webhook-whatsapp, manage-instance)
```

**Fluxo de dados:**

```
Page → Hook (useQuery/useMutation) → Service → supabase.from()
                                         ↓
                                    Adapter (snake → camel)
                                         ↓
                                    Componente renderiza
```

---

## 2. Banco de Dados — Tabelas

**16 tabelas** no schema `public`. Projeto Supabase: `ctvihcpojodsntoelfck`.

### 2.1 `profiles`

| Coluna | Tipo | Restrições |
|--------|------|-----------|
| `id` | UUID | PK, FK → auth.users(id) ON DELETE CASCADE |
| `name` | TEXT | NOT NULL |
| `email` | TEXT | NOT NULL, UNIQUE |
| `role` | user_role | NOT NULL, DEFAULT 'comercial' |
| `avatar_url` | TEXT | — |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() |
| `updated_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() |

**Trigger:** `on_auth_user_created` — cria perfil automaticamente ao registrar novo usuário.

---

### 2.2 `clientes`

| Coluna | Tipo | Restrições |
|--------|------|-----------|
| `id` | UUID | PK, DEFAULT gen_random_uuid() |
| `nome` | TEXT | NOT NULL |
| `email` | TEXT | NOT NULL |
| `telefone` | TEXT | NOT NULL |
| `cpf` | TEXT | UNIQUE |
| `sexo` | sexo | NOT NULL, DEFAULT 'masculino' |
| `data_nascimento` | DATE | — |
| `endereco` | TEXT | — |
| `status` | cliente_status | NOT NULL, DEFAULT 'em_dia' |
| `valor` | NUMERIC(12,2) | NOT NULL, DEFAULT 0 |
| `vencimento` | DATE | NOT NULL, DEFAULT CURRENT_DATE |
| `dias_atraso` | INTEGER | NOT NULL, DEFAULT 0 |
| `ultimo_contato` | TEXT | — |
| `limite_credito` | NUMERIC(12,2) | NOT NULL, DEFAULT 0 |
| `credito_utilizado` | NUMERIC(12,2) | NOT NULL, DEFAULT 0 |
| `score_interno` | INTEGER | NOT NULL, DEFAULT 500, CHECK 0–1000 |
| `bonus_acumulado` | NUMERIC(12,2) | NOT NULL, DEFAULT 0 |
| `grupo` | TEXT | — |
| `indicado_por` | UUID | FK → clientes(id) ON DELETE SET NULL |
| `created_at` / `updated_at` | TIMESTAMPTZ | auto |

**Índices:** `idx_clientes_status`, `idx_clientes_indicado_por`, `idx_clientes_vencimento`, `idx_clientes_cpf`

---

### 2.3 `emprestimos`

| Coluna | Tipo | Restrições |
|--------|------|-----------|
| `id` | UUID | PK |
| `cliente_id` | UUID | NOT NULL, FK → clientes(id) CASCADE |
| `valor` | NUMERIC(12,2) | NOT NULL |
| `parcelas` | INTEGER | NOT NULL |
| `parcelas_pagas` | INTEGER | NOT NULL, DEFAULT 0 |
| `valor_parcela` | NUMERIC(12,2) | NOT NULL |
| `taxa_juros` | NUMERIC(5,2) | NOT NULL |
| `tipo_juros` | VARCHAR(10) | NOT NULL, DEFAULT 'mensal' |
| `data_contrato` | DATE | NOT NULL |
| `proximo_vencimento` | DATE | NOT NULL |
| `status` | emprestimo_status | NOT NULL, DEFAULT 'ativo' |
| `created_at` / `updated_at` | TIMESTAMPTZ | auto |

**Índices:** `idx_emprestimos_cliente`, `idx_emprestimos_status`

> **Nota:** `tipo_juros` aceita `mensal`, `semanal` ou `diario`. A taxa é armazenada no período original (sem conversão).

---

### 2.4 `parcelas`

| Coluna | Tipo | Restrições |
|--------|------|-----------|
| `id` | UUID | PK |
| `emprestimo_id` | UUID | NOT NULL, FK → emprestimos(id) CASCADE |
| `cliente_id` | UUID | NOT NULL, FK → clientes(id) CASCADE |
| `numero` | INTEGER | NOT NULL |
| `valor` | NUMERIC(12,2) | NOT NULL (com juros/multa) |
| `valor_original` | NUMERIC(12,2) | NOT NULL |
| `data_vencimento` | DATE | NOT NULL |
| `data_pagamento` | DATE | — |
| `status` | parcela_status | NOT NULL, DEFAULT 'pendente' |
| `juros` | NUMERIC(12,2) | NOT NULL, DEFAULT 0 |
| `multa` | NUMERIC(12,2) | NOT NULL, DEFAULT 0 |
| `desconto` | NUMERIC(12,2) | NOT NULL, DEFAULT 0 |
| `created_at` / `updated_at` | TIMESTAMPTZ | auto |

**Índices:** `idx_parcelas_emprestimo`, `idx_parcelas_cliente`, `idx_parcelas_status`, `idx_parcelas_vencimento`

---

### 2.5 `mensagens`

| Coluna | Tipo | Restrições |
|--------|------|-----------|
| `id` | UUID | PK |
| `cliente_id` | UUID | NOT NULL, FK → clientes(id) CASCADE |
| `remetente` | mensagem_remetente | NOT NULL |
| `conteudo` | TEXT | NOT NULL |
| `timestamp` | TIMESTAMPTZ | NOT NULL, DEFAULT now() |
| `lida` | BOOLEAN | NOT NULL, DEFAULT false |
| `tipo` | mensagem_tipo | NOT NULL, DEFAULT 'texto' |
| `created_at` | TIMESTAMPTZ | auto |

**Índices:** `idx_mensagens_cliente`, `idx_mensagens_timestamp`

---

### 2.6 `templates_whatsapp`

| Coluna | Tipo | Restrições |
|--------|------|-----------|
| `id` | UUID | PK |
| `nome` | TEXT | NOT NULL |
| `categoria` | template_categoria | NOT NULL |
| `mensagem_masculino` | TEXT | NOT NULL |
| `mensagem_feminino` | TEXT | NOT NULL |
| `variaveis` | TEXT[] | NOT NULL, DEFAULT '{}' |
| `ativo` | BOOLEAN | NOT NULL, DEFAULT true |
| `created_at` / `updated_at` | TIMESTAMPTZ | auto |

---

### 2.7 `funcionarios`

| Coluna | Tipo | Restrições |
|--------|------|-----------|
| `id` | UUID | PK |
| `user_id` | UUID | NOT NULL, FK → auth.users(id) CASCADE, UNIQUE |
| `nome` | TEXT | NOT NULL |
| `email` | TEXT | NOT NULL |
| `role` | user_role | NOT NULL, DEFAULT 'comercial' |
| `status` | funcionario_status | NOT NULL, DEFAULT 'offline' |
| `ultimo_login` | TIMESTAMPTZ | — |
| `ultima_atividade` | TIMESTAMPTZ | — |
| `horas_hoje` / `horas_semana` / `horas_mes` | NUMERIC | métricas |
| `atividades_hoje` | INTEGER | NOT NULL, DEFAULT 0 |
| `meta_diaria` | INTEGER | NOT NULL, DEFAULT 80 |
| `created_at` / `updated_at` | TIMESTAMPTZ | auto |

**Índices:** `idx_funcionarios_user`, `idx_funcionarios_status`

---

### 2.8 `sessoes_atividade`

| Coluna | Tipo | Restrições |
|--------|------|-----------|
| `id` | UUID | PK |
| `funcionario_id` | UUID | NOT NULL, FK → funcionarios(id) CASCADE |
| `inicio` | TIMESTAMPTZ | NOT NULL |
| `fim` | TIMESTAMPTZ | — |
| `duracao` | INTEGER | NOT NULL, DEFAULT 0 (minutos) |
| `acoes` | INTEGER | NOT NULL, DEFAULT 0 |
| `paginas` | TEXT[] | NOT NULL, DEFAULT '{}' |
| `created_at` | TIMESTAMPTZ | auto |

---

### 2.9 `logs_atividade`

| Coluna | Tipo | Restrições |
|--------|------|-----------|
| `id` | UUID | PK |
| `user_id` | UUID | NOT NULL, FK → auth.users(id) CASCADE |
| `acao` | TEXT | NOT NULL |
| `detalhes` | TEXT | — |
| `pagina` | TEXT | — |
| `ip` | INET | — |
| `created_at` | TIMESTAMPTZ | auto |

**Índices:** `idx_logs_user`, `idx_logs_created`

---

### 2.10 `analises_credito`

| Coluna | Tipo | Restrições |
|--------|------|-----------|
| `id` | UUID | PK |
| `cliente_id` | UUID | FK → clientes(id) SET NULL |
| `cliente_nome` | TEXT | NOT NULL |
| `cpf` | TEXT | NOT NULL |
| `valor_solicitado` | NUMERIC(12,2) | NOT NULL |
| `renda_mensal` | NUMERIC(12,2) | NOT NULL |
| `score_serasa` | INTEGER | NOT NULL, CHECK 0–1000 |
| `score_interno` | INTEGER | NOT NULL, DEFAULT 0, CHECK 0–1000 |
| `status` | analise_credito_status | NOT NULL, DEFAULT 'pendente' |
| `data_solicitacao` | DATE | NOT NULL, DEFAULT CURRENT_DATE |
| `motivo` | TEXT | — |
| `analista_id` | UUID | FK → auth.users(id) SET NULL |
| `created_at` / `updated_at` | TIMESTAMPTZ | auto |

**Índices:** `idx_analises_status`, `idx_analises_cliente`, `idx_analises_data`

---

### 2.11 `whatsapp_instancias`

| Coluna | Tipo | Restrições |
|--------|------|-----------|
| `id` | UUID | PK, DEFAULT gen_random_uuid() |
| `instance_name` | TEXT | NOT NULL, UNIQUE |
| `departamento` | TEXT | NOT NULL, DEFAULT 'geral' |
| `phone_number` | TEXT | — |
| `status` | whatsapp_instance_status | NOT NULL, DEFAULT 'desconectado' |
| `evolution_url` | TEXT | — |
| `instance_token` | TEXT | — |
| `qr_code` | TEXT | — |
| `webhook_url` | TEXT | — |
| `created_at` / `updated_at` | TIMESTAMPTZ | auto |

**Índices:** `idx_whatsapp_inst_status`, `idx_whatsapp_inst_depto`

---

### 2.12 `fluxos_chatbot`

| Coluna | Tipo | Restrições |
|--------|------|-----------|
| `id` | UUID | PK, DEFAULT gen_random_uuid() |
| `nome` | TEXT | NOT NULL |
| `descricao` | TEXT | — |
| `departamento` | TEXT | NOT NULL, DEFAULT 'geral' |
| `status` | fluxo_status | NOT NULL, DEFAULT 'rascunho' |
| `gatilho` | TEXT | NOT NULL, DEFAULT 'palavra_chave' |
| `palavra_chave` | TEXT | — |
| `cron_expression` | TEXT | — |
| `evento_trigger` | TEXT | — |
| `template_id` | UUID | FK → templates_whatsapp(id) SET NULL |
| `disparos` | INTEGER | NOT NULL, DEFAULT 0 |
| `respostas` | INTEGER | NOT NULL, DEFAULT 0 |
| `conversoes` | INTEGER | NOT NULL, DEFAULT 0 |
| `created_at` / `updated_at` | TIMESTAMPTZ | auto |

**Índices:** `idx_fluxos_status`, `idx_fluxos_depto`, `idx_fluxos_gatilho`

---

### 2.13 `fluxos_chatbot_etapas`

| Coluna | Tipo | Restrições |
|--------|------|-----------|
| `id` | UUID | PK, DEFAULT gen_random_uuid() |
| `fluxo_id` | UUID | NOT NULL, FK → fluxos_chatbot(id) CASCADE |
| `ordem` | INTEGER | NOT NULL, DEFAULT 0 |
| `tipo` | fluxo_etapa_tipo | NOT NULL, DEFAULT 'mensagem' |
| `conteudo` | TEXT | — |
| `config` | JSONB | DEFAULT '{}' |
| `proximo_sim` | UUID | FK → fluxos_chatbot_etapas(id) SET NULL |
| `proximo_nao` | UUID | FK → fluxos_chatbot_etapas(id) SET NULL |
| `created_at` | TIMESTAMPTZ | auto |

**Índices:** `idx_etapas_fluxo`, `idx_etapas_ordem`

---

### 2.14 `whatsapp_mensagens_log`

| Coluna | Tipo | Restrições |
|--------|------|-----------|
| `id` | UUID | PK, DEFAULT gen_random_uuid() |
| `instancia_id` | UUID | FK → whatsapp_instancias(id) SET NULL |
| `cliente_id` | UUID | FK → clientes(id) SET NULL |
| `fluxo_id` | UUID | FK → fluxos_chatbot(id) SET NULL |
| `direcao` | TEXT | NOT NULL, DEFAULT 'saida' |
| `telefone` | TEXT | NOT NULL |
| `conteudo` | TEXT | — |
| `tipo` | TEXT | NOT NULL, DEFAULT 'text' |
| `status` | whatsapp_msg_status | NOT NULL, DEFAULT 'pendente' |
| `message_id_wpp` | TEXT | — |
| `metadata` | JSONB | DEFAULT '{}' |
| `created_at` | TIMESTAMPTZ | auto |

**Índices:** `idx_wpp_msg_instancia`, `idx_wpp_msg_telefone`, `idx_wpp_msg_status`, `idx_wpp_msg_created`

---

## 3. Enums (PostgreSQL)

| Enum | Valores |
|------|---------|
| `user_role` | `admin`, `gerencia`, `cobranca`, `comercial`, `cliente` |
| `cliente_status` | `em_dia`, `a_vencer`, `vencido` |
| `sexo` | `masculino`, `feminino` |
| `emprestimo_status` | `ativo`, `quitado`, `inadimplente` |
| `parcela_status` | `pendente`, `paga`, `vencida`, `cancelada` |
| `mensagem_remetente` | `cliente`, `sistema` |
| `mensagem_tipo` | `texto`, `arquivo`, `boleto` |
| `template_categoria` | `cobranca`, `boas_vindas`, `lembrete`, `negociacao` |
| `funcionario_status` | `online`, `offline`, `ausente` |
| `analise_credito_status` | `pendente`, `em_analise`, `aprovado`, `recusado` |
| `ticket_status` | `aberto`, `em_atendimento`, `aguardando_cliente`, `resolvido`, `cancelado` |
| `ticket_canal` | `whatsapp`, `chat`, `telefone`, `email`, `presencial` |
| `ticket_prioridade` | `baixa`, `media`, `alta`, `urgente` |
| `kanban_cobranca_etapa` | `a_vencer`, `vencido`, `contatado`, `negociacao`, `acordo`, `pago`, `perdido` |
| `whatsapp_instance_status` | `conectado`, `desconectado`, `qr_pendente` |
| `fluxo_status` | `ativo`, `pausado`, `rascunho` |
| `fluxo_etapa_tipo` | `mensagem`, `condicao`, `acao`, `espera`, `finalizar` |
| `whatsapp_msg_status` | `pendente`, `enviado`, `entregue`, `lido`, `erro`, `enviada`, `recebida`, `lida`, `falha` _(adicionados via migration 002)_ |

---

## 4. Políticas RLS

Todas as 12 tabelas têm RLS habilitado. Helper: `auth_role()` retorna o `user_role` do caller.

| Tabela | Política | FOR | Regra |
|--------|----------|-----|-------|
| **profiles** | `profiles_select_own` | SELECT | Próprio OU admin/gerência |
| | `profiles_insert_own` | INSERT | Somente próprio ID |
| | `profiles_update_own` | UPDATE | Somente próprio ID |
| | `profiles_admin_all` | ALL | admin |
| **clientes** | `clientes_select` | SELECT | Qualquer autenticado |
| | `clientes_insert` | INSERT | admin, gerência, comercial |
| | `clientes_update` | UPDATE | admin, gerência, cobrança, comercial |
| | `clientes_delete` | DELETE | Somente admin |
| **emprestimos** | `emprestimos_select` | SELECT | Qualquer autenticado |
| | `emprestimos_insert` | INSERT | admin, gerência, comercial |
| | `emprestimos_update` | UPDATE | admin, gerência |
| | `emprestimos_delete` | DELETE | Somente admin |
| **parcelas** | `parcelas_select` | SELECT | Qualquer autenticado |
| | `parcelas_insert` | INSERT | admin, gerência |
| | `parcelas_update` | UPDATE | admin, gerência, cobrança |
| | `parcelas_delete` | DELETE | Somente admin |
| **mensagens** | `mensagens_select` | SELECT | Qualquer autenticado |
| | `mensagens_insert` | INSERT | Qualquer autenticado |
| | `mensagens_update` | UPDATE | Qualquer autenticado |
| **templates_whatsapp** | `templates_select` | SELECT | Qualquer autenticado |
| | `templates_insert` | INSERT | admin, gerência |
| | `templates_update` | UPDATE | admin, gerência |
| | `templates_delete` | DELETE | Somente admin |
| **funcionarios** | `funcionarios_select` | SELECT | Próprio OU admin/gerência |
| | `funcionarios_update` | UPDATE | Próprio OU admin |
| | `funcionarios_admin_insert` | INSERT | Somente admin |
| **sessoes_atividade** | `sessoes_select` | SELECT | Próprio funcionário OU admin/gerência |
| | `sessoes_insert` | INSERT | Somente próprio funcionário |
| **logs_atividade** | `logs_select` | SELECT | admin, gerência |
| | `logs_insert` | INSERT | Qualquer autenticado |
| **analises_credito** | `analises_select` | SELECT | Qualquer autenticado |
| | `analises_insert` | INSERT | admin, gerência, comercial |
| | `analises_update` | UPDATE | admin, gerência, comercial |
| | `analises_delete` | DELETE | Somente admin |
| **tickets_atendimento** | `tickets_select` | SELECT | Qualquer autenticado |
| | `tickets_insert` | INSERT | admin, gerência, cobrança, comercial |
| | `tickets_update` | UPDATE | admin, gerência, cobrança, comercial |
| | `tickets_delete` | DELETE | Somente admin |
| **kanban_cobranca** | `kanban_cob_select` | SELECT | Qualquer autenticado |
| | `kanban_cob_insert` | INSERT | admin, gerência, cobrança |
| | `kanban_cob_update` | UPDATE | admin, gerência, cobrança |
| | `kanban_cob_delete` | DELETE | Somente admin |
| **whatsapp_instancias** | `wpp_inst_select` | SELECT | Qualquer autenticado |
| | `wpp_inst_insert` | INSERT | admin, gerência |
| | `wpp_inst_update` | UPDATE | admin, gerência |
| | `wpp_inst_delete` | DELETE | Somente admin |
| **fluxos_chatbot** | `fluxos_select` | SELECT | Qualquer autenticado |
| | `fluxos_insert` | INSERT | admin, gerência |
| | `fluxos_update` | UPDATE | admin, gerência |
| | `fluxos_delete` | DELETE | Somente admin |
| **fluxos_chatbot_etapas** | `etapas_select` | SELECT | Qualquer autenticado |
| | `etapas_insert` | INSERT | admin, gerência |
| | `etapas_update` | UPDATE | admin, gerência |
| | `etapas_delete` | DELETE | admin, gerência |
| **whatsapp_mensagens_log** | `wpp_msg_select` | SELECT | Qualquer autenticado |
| | `wpp_msg_insert` | INSERT | Qualquer autenticado |
| | `wpp_msg_update` | UPDATE | admin, gerência |

---

## 5. Funções RPC

| Função | Parâmetros | Retorno |
|--------|-----------|---------|
| `get_dashboard_stats()` | — | JSON: `total_clientes`, `clientes_em_dia`, `clientes_vencidos`, `clientes_a_vencer`, `total_carteira`, `total_inadimplencia`, `taxa_inadimplencia`, `total_emprestimos_ativos` |
| `get_financial_summary(periodo_meses)` | INTEGER (default 6) | JSON[]: `{ mes, receita, inadimplencia }` |
| `get_kanban_stats()` | — | JSON: `total_analises`, `analises_pendentes`, `analises_em_analise`, `analises_aprovadas`, `analises_recusadas`, `total_tickets`, `tickets_abertos`, `tickets_em_atendimento`, `tickets_resolvidos`, `total_cobranca`, `cobranca_em_negociacao`, `cobranca_acordos`, `cobranca_pagos`, `valor_em_cobranca`, `valor_recuperado`, `taxa_aprovacao_credito` |

---

## 6. Edge Functions (Deno)

Todas deployadas em `supabase functions deploy`. Usam `SUPABASE_SERVICE_ROLE_KEY` para operações privilegiadas.

| Função | Endpoint | Body | Descrição |
|--------|----------|------|-----------|
| `invite-user` | POST | `{ email, password, name, role }` | Cria usuário via `auth.admin.createUser()`. Somente admin. Perfil criado por trigger. |
| `update-user-role` | POST | `{ userId, role }` | Atualiza role em `profiles`. Impede auto-rebaixamento. Somente admin. |
| `delete-user` | POST | `{ userId }` | Deleta usuário da auth. Perfil cascadeia. Impede auto-deleção. Somente admin. |
| `send-whatsapp` | POST | `{ instancia_id, telefone, conteudo, tipo? }` | Envia mensagem via Evolution API. Suporta: text, image, document, audio. Loga em `whatsapp_mensagens_log`. Requer auth. **URL prioridade:** secret `EVOLUTION_API_URL` > `evolution_url` do banco. **Número:** apenas dígitos (sem `@domain`). **Timeout:** AbortController 20s. **Retorno:** sempre HTTP 200; `{success:false}` em falha (evita CORS em 502). |
| `webhook-whatsapp` | POST | (Evolution API payload) | Recebe webhooks da Evolution API (**sem JWT**). Trata: `messages.upsert`, `messages.update`, `qrcode.updated`, `connection.update`. Dispara chatbot por palavra-chave. Deploy: `--no-verify-jwt`. **@lid:** quando `key.addressingMode === 'lid'`, usa `key.remoteJidAlt` como JID real. Salva `metadata.jid` e `metadata.lid_jid`. |
| `manage-instance` | POST | `{ action, ...params }` | Gerencia instâncias WhatsApp. 7 ações: `create`, `connect`, `disconnect`, `status`, `delete`, `restart`, `set_webhook`. Somente admin/gerência. **URL prioridade:** secret `EVOLUTION_API_URL` > `evolution_url` do banco. **HTML detection:** detecta resposta HTML (ngrok mudou) e retorna erro descritivo. |
| `send-verification-link` | POST | `{ analise_id }` | Envia magic link de verificação de identidade por e-mail via `auth.signInWithOtp()`. Cria registro em `identity_verifications` com frase de verificação aleatória. Valida role (admin/gerência), verifica retentativas (máx 3). Link expira em 48h. Deploy: `--no-verify-jwt`. |
| `approve-credit` | POST | `{ analise_id, pix_key, pix_key_type }` | Aprova crédito, cria empréstimo e dispara Pix via Woovi. Valida verificação aprovada, impede auto-análise. Pagamento não-bloqueante (falha permite retry). Somente admin/gerência. |

**Shared:** `_shared/cors.ts` — exporta `corsHeaders` para CORS handling.

**Secrets usados pelas Edge Functions WhatsApp:**

| Secret | Comando para definir | Descrição |
|--------|---------------------|-----------|
| `EVOLUTION_API_URL` | `npx supabase secrets set EVOLUTION_API_URL="https://..."` | URL base da Evolution API. Tem prioridade sobre o valor salvo no banco. Atualizar quando o ngrok reiniciar. |
| `EVOLUTION_API_KEY` | `npx supabase secrets set EVOLUTION_API_KEY="chave"` | API Key global da Evolution (não obrigatório se armazenado na instância). |
| `SUPABASE_URL` | (automático) | URL do projeto Supabase. |
| `SUPABASE_SERVICE_ROLE_KEY` | (automático) | Chave de service role para operações privilegiadas. |

---

## 7. TypeScript — Tipos

### Enums TypeScript (`database.types.ts`)

| Tipo | Valores |
|------|---------|
| `UserRole` | `'admin' \| 'gerencia' \| 'cobranca' \| 'comercial' \| 'cliente'` |
| `ClienteStatus` | `'em_dia' \| 'a_vencer' \| 'vencido'` |
| `Sexo` | `'masculino' \| 'feminino'` |
| `EmprestimoStatus` | `'ativo' \| 'quitado' \| 'inadimplente'` |
| `ParcelaStatus` | `'pendente' \| 'paga' \| 'vencida' \| 'cancelada'` |
| `MensagemRemetente` | `'cliente' \| 'sistema'` |
| `MensagemTipo` | `'texto' \| 'arquivo' \| 'boleto'` |
| `TemplateCategoria` | `'cobranca' \| 'boas_vindas' \| 'lembrete' \| 'negociacao'` |
| `FuncionarioStatus` | `'online' \| 'offline' \| 'ausente'` |
| `AnaliseCreditoStatus` | `'pendente' \| 'em_analise' \| 'aprovado' \| 'recusado'` |
| `TipoJuros` | `'mensal' \| 'semanal' \| 'diario'` |
| `WhatsappInstanceStatus` | `'conectado' \| 'desconectado' \| 'qr_pendente'` |
| `FluxoStatus` | `'ativo' \| 'pausado' \| 'rascunho'` |
| `FluxoEtapaTipo` | `'mensagem' \| 'condicao' \| 'acao' \| 'espera' \| 'finalizar'` |
| `WhatsappMsgStatus` | `'pendente' \| 'enviado' \| 'entregue' \| 'lido' \| 'erro'` |
| `Json` | Tipo recursivo para campos JSONB |

### Row/Insert/Update

Cada tabela tem `Row`, `Insert` e `Update`. Aliases exportados:

- `Profile`, `Cliente`, `ClienteInsert`, `ClienteUpdate`
- `Emprestimo`, `EmprestimoInsert`, `EmprestimoUpdate`
- `Parcela`, `ParcelaInsert`, `ParcelaUpdate`
- `Mensagem`, `MensagemInsert`
- `TemplateWhatsApp`, `TemplateWhatsAppInsert`, `TemplateWhatsAppUpdate`
- `Funcionario`, `SessaoAtividade`
- `AnaliseCredito`, `AnaliseCreditoInsert`, `AnaliseCreditoUpdate`
- `WhatsappInstancia`, `WhatsappInstanciaInsert`, `WhatsappInstanciaUpdate`
- `FluxoChatbot`, `FluxoChatbotInsert`, `FluxoChatbotUpdate`
- `FluxoChatbotEtapa`, `FluxoChatbotEtapaInsert`, `FluxoChatbotEtapaUpdate`
- `WhatsappMensagemLog`, `WhatsappMensagemLogInsert`

### Tipos compostos (JOINs)

| Tipo | Composição |
|------|-----------|
| `EmprestimoComCliente` | Emprestimo + `{ clientes: { nome } \| null }` |
| `ParcelaComCliente` | Parcela + `{ clientes: { nome } \| null }` |
| `ClienteComIndicados` | Cliente + `{ indicados: { id, nome, status }[] }` |
| `FluxoChatbotComEtapas` | FluxoChatbot + `{ fluxos_chatbot_etapas: FluxoChatbotEtapa[] }` |

---

## 8. Adapters

Arquivo: `src/app/lib/adapters.ts`

Conversão bidirecional **snake_case (banco)** ↔ **camelCase (frontend)**:

| Função | Direção | Descrição |
|--------|---------|-----------|
| `dbClienteToView()` | DB → View | Cliente com indicação opcional |
| `dbClienteComIndicadosToView()` | DB → View | Cliente + array de indicados |
| `dbEmprestimoToView()` | DB → View | Empréstimo + nome do cliente |
| `dbParcelaToView()` | DB → View | Parcela + nome do cliente |
| `dbMensagemToView()` | DB → View | Mensagem |
| `dbTemplateToView()` | DB → View | Template WhatsApp |
| `dbFuncionarioToView()` | DB → View | Funcionário + sessões |
| `dbSessaoToView()` | DB → View | Sessão de atividade |
| `dbAnaliseCreditoToView()` | DB → View | Análise de crédito |
| `viewClienteToInsert()` | View → DB | Cliente para inserção |
| `viewAnaliseCreditoToInsert()` | View → DB | Análise para inserção |

---

## 9. Services

13 arquivos em `src/app/services/`. Todos operam exclusivamente com Supabase (zero mock).

> **Nota:** Inclui também `identityVerificationService.ts` para verificação de identidade — documentado na [Seção 26](#26-verificação-de-identidade--análise-de-crédito-v740--19032026).

### `clientesService.ts`

| Função | Descrição |
|--------|-----------|
| `getClientes(status?)` | Listar todos (filtro opcional) |
| `getClienteById(id)` | Buscar por ID |
| `getClienteComIndicados(id)` | Cliente + indicados (JOIN) |
| `getIndicados(clienteId)` | Lista de indicados |
| `createCliente(data)` | Criar cliente |
| `updateCliente(id, updates)` | Atualizar cliente |
| `deleteCliente(id)` | Deletar cliente |
| `getClienteStats()` | Estatísticas via RPC `get_dashboard_stats()` |

### `emprestimosService.ts`

| Função | Descrição |
|--------|-----------|
| `getEmprestimos(status?)` | Listar com nome do cliente (JOIN) |
| `getEmprestimosByCliente(clienteId)` | Empréstimos de um cliente |
| `getEmprestimoById(id)` | Buscar por ID |
| `createEmprestimo(data)` | Criar empréstimo |
| `updateEmprestimo(id, updates)` | Atualizar |
| `deleteEmprestimo(id)` | Deletar |

### `parcelasService.ts`

| Função | Descrição |
|--------|-----------|
| `getParcelas(status?)` | Listar com nome do cliente |
| `getParcelasByEmprestimo(id)` | Parcelas de um empréstimo |
| `getParcelasByCliente(id)` | Parcelas de um cliente |
| `getParcelasVencidas()` | Parcelas em atraso |
| `createParcela(data)` | Criar parcela |
| `updateParcela(id, updates)` | Atualizar |
| `registrarPagamento(id, data, desconto?)` | Dar baixa em pagamento |

### `analiseCreditoService.ts`

| Função | Descrição |
|--------|-----------|
| `getAnalises(status?)` | Listar análises |
| `getAnaliseById(id)` | Buscar por ID |
| `createAnalise(data)` | Nova solicitação |
| `updateAnalise(id, updates)` | Aprovar/recusar |
| `deleteAnalise(id)` | Deletar |

### `mensagensService.ts`

| Função | Descrição |
|--------|-----------|
| `getMensagensByCliente(id)` | Mensagens de um cliente |
| `getMensagensNaoLidas()` | Contagem não lidas |
| `getUltimasMensagens()` | Última msg por conversa |
| `enviarMensagem(data)` | Enviar mensagem |
| `marcarComoLida(clienteId)` | Marcar como lida |
| `subscribeToMensagens(id, cb)` | Realtime (retorna unsubscribe) |

### `templatesService.ts`

| Função | Descrição |
|--------|-----------|
| `getTemplates()` | Todos os templates |
| `getTemplatesByCategoria(cat)` | Por categoria (ativos) |
| `getTemplateById(id)` | Por ID |
| `createTemplate(data)` | Criar |
| `updateTemplate(id, updates)` | Atualizar |
| `deleteTemplate(id)` | Deletar |
| `toggleTemplateAtivo(id, ativo)` | Ativar/desativar |

### `funcionariosService.ts`

| Função | Descrição |
|--------|-----------|
| `getFuncionarios()` | Todos os funcionários |
| `getFuncionarioById(id)` | Por ID |
| `getFuncionarioByUserId(userId)` | Por auth user_id |
| `getSessoesByFuncionario(id)` | Sessões de atividade |
| `getFuncionarioStats()` | Contagem por status |
| `updateFuncionarioStatus(id, status)` | Atualizar status |
| `iniciarSessao(id)` | Iniciar sessão |
| `finalizarSessao(id, acoes, paginas)` | Finalizar sessão |

### `adminUsersService.ts`

| Função | Descrição |
|--------|-----------|
| `getUsers()` | Listar perfis |
| `createUser(payload)` | Edge Function `invite-user` |
| `updateUserRole(userId, role)` | Edge Function `update-user-role` |
| `deleteUser(userId)` | Edge Function `delete-user` |
| `updateUserName(userId, name)` | Atualizar nome (direct) |

### `whatsappService.ts`

| Função | Descrição |
|--------|-----------|
| `getInstancias()` | Listar instâncias WhatsApp |
| `getInstanciaById(id)` | Buscar instância por ID |
| `criarInstancia(data)` | Criar via Edge Function `manage-instance` (action: create) |
| `conectarInstancia(id)` | Conectar (gerar QR Code) via Edge Function |
| `desconectarInstancia(id)` | Desconectar (logout) via Edge Function |
| `statusInstancia(id)` | Verificar status via Edge Function |
| `deletarInstancia(id)` | Deletar via Edge Function |
| `reiniciarInstancia(id)` | Reiniciar via Edge Function |
| `configurarWebhook(id, url)` | Configurar webhook via Edge Function |
| `enviarMensagem(params)` | Enviar via Edge Function `send-whatsapp` |
| `getMensagensByTelefone(tel, instId)` | Log de mensagens por telefone |
| `getMensagensByInstancia(instId)` | Log por instância |
| `getConversas(instId)` | Conversas agrupadas por telefone |
| `getEstatisticas(instId?)` | Totais: enviadas, recebidas, falhas |
| `subscribeToMensagens(instId, cb)` | Realtime INSERT em `whatsapp_mensagens_log` |
| `subscribeToInstancias(cb)` | Realtime ALL em `whatsapp_instancias` |

### `fluxosChatbotService.ts`

| Função | Descrição |
|--------|-----------|
| `getFluxos()` | Listar todos os fluxos |
| `getFluxosComEtapas()` | Fluxos + etapas (JOIN) |
| `getFluxoById(id)` | Buscar por ID |
| `getFluxosByDepartamento(depto)` | Filtrar por departamento |
| `getFluxosAtivos()` | Fluxos com status 'ativo' |
| `criarFluxo(data)` | Criar fluxo |
| `atualizarFluxo(id, updates)` | Atualizar fluxo |
| `deletarFluxo(id)` | Deletar fluxo |
| `toggleFluxoStatus(id, status)` | Alternar status ativo/pausado |
| `duplicarFluxo(id)` | Duplicar fluxo + todas as etapas |
| `getEtapasByFluxo(fluxoId)` | Etapas ordenadas |
| `criarEtapa(data)` | Criar etapa |
| `atualizarEtapa(id, updates)` | Atualizar etapa |
| `deletarEtapa(id)` | Deletar etapa |
| `reordenarEtapas(etapas)` | Reordenar em batch |
| `criarEtapasBatch(etapas)` | Inserir múltiplas etapas |

### `kanbanCobrancaService.ts`

| Função | Descrição |
|--------|-----------|
| `getCardsCobranca(etapa?)` | Listar cards de cobrança (filtro opcional por etapa) |
| `getCardsByEtapa(etapa)` | Cards por etapa específica do Kanban |
| `getCardById(id)` | Buscar card por ID |
| `getCardsByCliente(clienteId)` | Cards de um cliente |
| `getCardsByResponsavel(userId)` | Cards de um responsável |
| `createCardCobranca(data)` | Criar card de cobrança |
| `updateCardCobranca(id, updates)` | Atualizar card |
| `moverCardCobranca(id, etapa)` | Mover para outra etapa (drag-and-drop) |
| `registrarContato(id)` | Incrementar tentativas, atualizar timestamp, mover para `contatado` |
| `deleteCardCobranca(id)` | Deletar card |
| `getKanbanStats()` | Estatísticas via RPC `get_kanban_stats()` |

### `redeIndicacoesService.ts`

| Função | Descrição |
|--------|-----------|
| `getMembrosRede(redeId?)` | Membros da rede (BFS em `clientes.indicado_por`) |
| `getMembrosByRede(redeId)` | Membros de uma rede específica |
| `getMembroById(clienteId)` | Membro por ID |
| `getRedesUnicas()` | IDs de redes distintas |
| `createIndicacao(payload)` | Criar cliente vinculado a indicador |
| `vincularIndicacao(clienteId, indicadoPor)` | Vincular cliente existente a indicador |
| `getBloqueiosRede(redeId?)` | Bloqueios de rede (filtro opcional) |
| `getBloqueiosAtivos()` | Apenas bloqueios ativos |
| `criarBloqueio(data)` | Criar bloqueio |
| `desbloquearRede(id)` | Desativar bloqueio |
| `bloquearRede(redeId, motivo)` | Bloquear rede inteira |

### `ticketsService.ts`

| Função | Descrição |
|--------|-----------|
| `getTickets(status?)` | Listar tickets (filtro opcional) |
| `getTicketsByStatus(status)` | Tickets por status (para colunas Kanban) |
| `getTicketById(id)` | Buscar por ID |
| `getTicketsByCliente(clienteId)` | Tickets de um cliente |
| `getTicketsByAtendente(userId)` | Tickets de um atendente |
| `createTicket(data)` | Criar ticket |
| `updateTicket(id, updates)` | Atualizar (auto-preenche `resolvido_em` quando status = `resolvido`) |
| `moverTicket(id, status)` | Mover ticket (drag-and-drop) |
| `atribuirTicket(id, atendenteId)` | Atribuir a atendente + status `em_atendimento` |
| `deleteTicket(id)` | Deletar ticket |

---

## 10. React Query Hooks

16 arquivos em `src/app/hooks/`. Todos retornam dados em **camelCase** (via adapters).

> **Nota:** Inclui também `useIdentityVerification.ts` (9 hooks) — documentado na [Seção 26](#26-verificação-de-identidade--análise-de-crédito-v740--19032026).

### `useClientes.ts` — key: `'clientes'`

| Hook | Tipo | Invalidações |
|------|------|-------------|
| `useClientes(status?)` | query | — |
| `useCliente(id)` | query | — |
| `useClienteComIndicados(id)` | query | — |
| `useIndicados(clienteId)` | query | — |
| `useClienteStats()` | query | — |
| `useCreateCliente()` | mutation | `clientes` |
| `useUpdateCliente()` | mutation | `clientes` |
| `useDeleteCliente()` | mutation | `clientes` |

### `useEmprestimos.ts` — key: `'emprestimos'`

| Hook | Tipo | Invalidações |
|------|------|-------------|
| `useEmprestimos(status?)` | query | — |
| `useEmprestimosByCliente(id)` | query | — |
| `useEmprestimo(id)` | query | — |
| `useCreateEmprestimo()` | mutation | `emprestimos` |
| `useUpdateEmprestimo()` | mutation | `emprestimos` |
| `useDeleteEmprestimo()` | mutation | `emprestimos`, `parcelas` |

### `useParcelas.ts` — key: `'parcelas'`

| Hook | Tipo | Invalidações |
|------|------|-------------|
| `useParcelas(status?)` | query | — |
| `useParcelasByEmprestimo(id)` | query | — |
| `useParcelasByCliente(id)` | query | — |
| `useParcelasVencidas()` | query | — |
| `useCreateParcela()` | mutation | `parcelas` |
| `useUpdateParcela()` | mutation | `parcelas`, `emprestimos` |
| `useRegistrarPagamento()` | mutation | `parcelas`, `emprestimos`, `clientes` |

### `useAnaliseCredito.ts` — key: `'analises-credito'`

| Hook | Tipo | Invalidações |
|------|------|-------------|
| `useAnalises(status?)` | query | — |
| `useAnalise(id)` | query | — |
| `useCreateAnalise()` | mutation | `analises-credito` |
| `useUpdateAnalise()` | mutation | `analises-credito` |
| `useDeleteAnalise()` | mutation | `analises-credito` |

### `useMensagens.ts` — key: `'mensagens'`

| Hook | Tipo | Invalidações |
|------|------|-------------|
| `useMensagens(clienteId)` | query (poll 10s) | — |
| `useUltimasMensagens()` | query | — |
| `useMensagensNaoLidas()` | query (poll 30s) | — |
| `useEnviarMensagem()` | mutation | `mensagens` |
| `useMarcarComoLida()` | mutation | `mensagens` |

### `useTemplates.ts` — key: `'templates'`

| Hook | Tipo | Invalidações |
|------|------|-------------|
| `useTemplates()` | query | — |
| `useTemplatesByCategoria(cat)` | query | — |
| `useTemplate(id)` | query | — |
| `useCreateTemplate()` | mutation | `templates` |
| `useUpdateTemplate()` | mutation | `templates` |
| `useDeleteTemplate()` | mutation | `templates` |
| `useToggleTemplateAtivo()` | mutation | `templates` |

### `useFuncionarios.ts` — key: `'funcionarios'`

| Hook | Tipo | Invalidações |
|------|------|-------------|
| `useFuncionarios()` | query | — |
| `useFuncionario(id)` | query | — |
| `useFuncionarioByUserId(userId)` | query | — |
| `useSessoesByFuncionario(id)` | query | — |
| `useFuncionarioStats()` | query (poll 30s) | — |
| `useUpdateFuncionarioStatus()` | mutation | `funcionarios` |

### `useAdminUsers.ts` — key: `'admin-users'`

| Hook | Tipo | Invalidações |
|------|------|-------------|
| `useAdminUsers()` | query | — |
| `useCreateUser()` | mutation | `admin-users` |
| `useUpdateUserRole()` | mutation | `admin-users` |
| `useDeleteUser()` | mutation | `admin-users` |
| `useUpdateUserName()` | mutation | `admin-users` |

### `useWhatsapp.ts` — key: `'whatsapp-instancias'`, `'whatsapp-mensagens'`, `'whatsapp-conversas'`, `'whatsapp-stats'`

| Hook | Tipo | Invalidações |
|------|------|-------------|
| `useInstancias()` | query (Realtime + poll 30s) | — |
| `useInstancia(id)` | query | — |
| `useCriarInstancia()` | mutation | `whatsapp-instancias` |
| `useConectarInstancia()` | mutation | `whatsapp-instancias` |
| `useDesconectarInstancia()` | mutation | `whatsapp-instancias` |
| `useStatusInstancia()` | mutation | `whatsapp-instancias` |
| `useDeletarInstancia()` | mutation | `whatsapp-instancias` |
| `useReiniciarInstancia()` | mutation | `whatsapp-instancias` |
| `useConfigurarWebhook()` | mutation | `whatsapp-instancias` |
| `useEnviarWhatsapp()` | mutation | `whatsapp-mensagens` |
| `useMensagensWhatsapp(tel, instId)` | query (Realtime + poll 10s) | — |
| `useConversasWhatsapp(instId)` | query (Realtime + poll 15s) | — |
| `useEstatisticasWhatsapp(instId?)` | query | — |

### `useFluxosChatbot.ts` — key: `'fluxos-chatbot'`, `'fluxos-etapas'`

| Hook | Tipo | Invalidações |
|------|------|-------------|
| `useFluxos()` | query | — |
| `useFluxosComEtapas()` | query | — |
| `useFluxo(id)` | query | — |
| `useFluxosByDepartamento(depto)` | query | — |
| `useFluxosAtivos()` | query | — |
| `useCriarFluxo()` | mutation | `fluxos-chatbot` |
| `useAtualizarFluxo()` | mutation | `fluxos-chatbot` |
| `useDeletarFluxo()` | mutation | `fluxos-chatbot` |
| `useToggleFluxoStatus()` | mutation | `fluxos-chatbot` |
| `useDuplicarFluxo()` | mutation | `fluxos-chatbot` |
| `useEtapas(fluxoId)` | query | — |
| `useCriarEtapa()` | mutation | `fluxos-etapas`, `fluxos-chatbot` |
| `useAtualizarEtapa()` | mutation | `fluxos-etapas` |
| `useDeletarEtapa()` | mutation | `fluxos-etapas`, `fluxos-chatbot` |
| `useReordenarEtapas()` | mutation | `fluxos-etapas` |

### `useKanbanCobranca.ts` — key: `'kanban-cobranca'`, `'kanban-stats'`

| Hook | Tipo | Invalidações |
|------|------|-------------|
| `useCardsCobranca(etapa?)` | query | — |
| `useCardsByEtapa(etapa)` | query | — |
| `useCardCobranca(id)` | query | — |
| `useCardsByCliente(clienteId)` | query | — |
| `useCardsByResponsavel(userId)` | query | — |
| `useCreateCardCobranca()` | mutation | `kanban-cobranca`, `kanban-stats` |
| `useUpdateCardCobranca()` | mutation | `kanban-cobranca`, `kanban-stats` |
| `useMoverCardCobranca()` | mutation | `kanban-cobranca`, `kanban-stats` |
| `useRegistrarContato()` | mutation | `kanban-cobranca`, `kanban-stats` |
| `useDeleteCardCobranca()` | mutation | `kanban-cobranca`, `kanban-stats` |
| `useKanbanStats()` | query | — |

### `useRedeIndicacoes.ts` — key: `'rede-indicacoes'`, `'bloqueios-rede'`

| Hook | Tipo | Invalidações |
|------|------|-------------|
| `useMembrosRede(redeId?)` | query | — |
| `useMembrosByRede(redeId)` | query | — |
| `useRedesUnicas()` | query | — |
| `useBloqueiosRede(redeId?)` | query | — |
| `useBloqueiosAtivos()` | query | — |
| `useCreateIndicacao()` | mutation | `rede-indicacoes`, `clientes` |
| `useVincularIndicacao()` | mutation | `rede-indicacoes`, `clientes` |
| `useDesbloquearRede()` | mutation | `rede-indicacoes`, `bloqueios-rede` |
| `useBloquearRede()` | mutation | `rede-indicacoes`, `bloqueios-rede` |

### `useTickets.ts` — key: `'tickets'`

| Hook | Tipo | Invalidações |
|------|------|-------------|
| `useTickets(status?)` | query | — |
| `useTicketsByStatus(status)` | query | — |
| `useTicket(id)` | query | — |
| `useTicketsByCliente(clienteId)` | query | — |
| `useTicketsByAtendente(userId)` | query | — |
| `useCreateTicket()` | mutation | `tickets` |
| `useUpdateTicket()` | mutation | `tickets` |
| `useMoverTicket()` | mutation | `tickets` |
| `useAtribuirTicket()` | mutation | `tickets` |
| `useDeleteTicket()` | mutation | `tickets` |

### `useEtiquetas.ts` — key: `'etiquetas'`, `'conversa-etiquetas'`, `'conversa-cliente'`

| Hook | Tipo | Invalidações |
|------|------|-------------|
| `useEtiquetas()` | query | — |
| `useCreateEtiqueta()` | mutation | `etiquetas` |
| `useUpdateEtiqueta()` | mutation | `etiquetas` |
| `useDeleteEtiqueta()` | mutation | `etiquetas`, `conversa-etiquetas` |
| `useConversaEtiquetas(instId)` | query | — |
| `useToggleConversaEtiqueta()` | mutation | `conversa-etiquetas` |
| `useConversaClientes(instId)` | query | — |
| `useVincularCliente()` | mutation | `conversa-cliente` |
| `useDesvincularCliente()` | mutation | `conversa-cliente` |

### `useDashboardStats.ts` — key: `'dashboard-stats'`, `'financial-summary'`

| Hook | Tipo | Invalidações |
|------|------|-------------|
| `useDashboardStats()` | query (staleTime 30s) | — |
| `useFinancialSummary()` | query (staleTime 60s) | — |

### `useActivityTracker.ts` — side-effect hook

| Hook | Tipo | Descrição |
|------|------|-----------|
| `useActivityTracker()` | effect | Tracking de atividade: inicia sessão, heartbeat 60s, Visibility API (online/ausente/offline), registra páginas, finaliza sessão no unmount |

---

## 11. Páginas e Rotas

**36 páginas** no total, **39 rotas**. Árvore de rotas (`react-router` v7):

```
/                              → Redirect → /login
/login                         → LoginPage (pública)
/cliente                       → ClienteAreaPage (standalone, sem sidebar)
/verify-identity               → VerifyIdentityPage (pública, standalone, via magic link)
/                              → ProtectedRoute + MainLayout
├── dashboard                  → DashboardPage
├── dashboard/financeiro       → DashboardFinanceiroPage
├── dashboard/cobranca         → DashboardCobrancaPage
├── dashboard/comercial        → DashboardComercialPage
├── clientes                   → ClientesPage
├── clientes/analise           → AnaliseCreditoPage
├── clientes/emprestimos       → EmprestimosAtivosPage
├── clientes/parcelas          → GestaoParcelasPage
├── clientes/historico         → HistoricoClientesPage
├── rede                       → RedeIndicacoesPage
├── rede/bonus                 → BonusComissoesPage
├── rede/bloqueados            → GruposBloqueadosPage
├── rede/indicar               → IndicarNovoPage
├── chat                       → ChatPage
├── whatsapp                   → WhatsAppPage
├── chat/fluxos                → FluxosChatPage
├── chat/templates             → TemplatesMensagensPage
├── kanban/cobranca            → KanbanCobrancaPage
├── kanban/analise             → KanbanAnalisePage
├── kanban/atendimento         → KanbanAtendimentoPage
├── kanban/gerencial           → KanbanGerencialPage
├── relatorios/gerenciais      → RelatoriosPage
├── relatorios/operacionais    → RelatoriosOperacionaisPage
├── relatorios/exportar        → ExportarDadosPage
├── configuracoes/perfis       → PerfisAcessoPage
├── configuracoes/usuarios     → GerenciarUsuariosPage
├── configuracoes/integracoes  → IntegracoesPage
├── configuracoes/conta        → MinhaContaPage
├── equipe/monitoramento       → MonitoramentoAtividadePage
├── equipe/produtividade       → ProdutividadePage
├── pagamentos/woovi           → PagamentosWooviPage
└── *                          → "Página em Desenvolvimento" (fallback)
```

### Páginas integradas com React Query (mutações reais)

Todas as 33 páginas operam com dados reais do Supabase via React Query. As páginas com mutações mais relevantes:

| Página | Hooks usados | Funcionalidades |
|--------|-------------|-----------------|
| `EmprestimosAtivosPage` | `useEmprestimos`, `useCreateEmprestimo`, `useParcelas`, `useClientes`, `useIndicados` | Modal rico 3 tabs (Parcelas/Cliente/Empréstimo), quitar, baixa parcial, juros manual, reativação. Deep link: `?emprestimoId=` auto-abre modal do empréstimo |
| `AnaliseCreditoPage` | `useAnalises`, `useCreateAnalise`, `useUpdateAnalise`, `useCreateVerification`, `useCreateVerificationLog` | Nova análise, aprovar/recusar, enviar magic link de verificação, modal detalhado com abas |
| `GestaoParcelasPage` | `useParcelas`, `useRegistrarPagamento`, `useUpdateParcela` | Quitar/editar/excluir em lote |
| `ClientesPage` | `useClientes`, `useCreateCliente`, `useUpdateCliente`, `useDeleteCliente` | CRUD completo, dialogs inline. Deep link: `?clienteId=` auto-abre dialog do cliente |
| `HistoricoClientesPage` | `useParcelas`, `useEmprestimos`, `useAnalises` | Timeline unificada, métricas, exportação CSV |
| `RedeIndicacoesPage` | `useMembrosRede`, `useCreateIndicacao`, `useBloquearRede` | Mapa ReactFlow, BFS, bloqueio solidário |
| `BonusComissoesPage` | `useMembrosRede`, `useClientes` | Comissões, bônus por indicação |
| `KanbanCobrancaPage` | `useCardsCobranca`, `useMoverCardCobranca`, `useRegistrarContato` | 6 colunas drag-and-drop |
| `KanbanAnalisePage` | `useTickets`, `useMoverTicket`, `useAtribuirTicket`, `useCreateVerification`, `useCreateVerificationLog` | 4 colunas com atribuição, magic link de verificação, modal detalhado |
| `KanbanAtendimentoPage` | `useTickets`, `useMoverTicket` | 4 colunas |
| `KanbanGerencialPage` | `useKanbanStats`, `useTickets`, `useCardsCobranca` | KPIs cross-board |
| `WhatsAppPage` | `useInstancias`, `useCriarInstancia`, `useConversasWhatsapp`, `useEnviarWhatsapp` | Chat real-time, QR Code, sync |
| `ChatPage` | `useMensagens`, `useEnviarMensagem`, `useTemplates` | Chat interno |
| `FluxosChatPage` / `FluxoEditorPage` | `useFluxos`, `useCriarFluxo`, `useEtapas` | Editor visual ReactFlow |
| `GerenciarUsuariosPage` | `useAdminUsers`, `useCreateUser`, `useUpdateUserRole`, `useDeleteUser` | Gestão via Edge Functions |
| `TemplatesMensagensPage` | `useTemplates`, `useCreateTemplate`, `useUpdateTemplate`, `useDeleteTemplate` | CRUD templates M/F |
| `DashboardPage` | `useDashboardStats`, `useFinancialSummary` | KPIs RPC |
| `MonitoramentoAtividadePage` | `useFuncionarios`, `useSessoesByFuncionario` | Tracking tempo real |
| `ProdutividadePage` | `useFuncionarios`, `useFuncionarioStats` | RadarChart, ranking |

---

## 12. Sidebar / Navegação (RBAC)

Sidebar com filtragem por `user.role` via `canAccess(roles)`.

| Seção | Item | Rota | Perfis |
|-------|------|------|--------|
| **DASHBOARD** | Visão Geral | `/dashboard` | admin, gerência |
| | Financeiro | `/dashboard/financeiro` | admin, gerência |
| | Cobrança | `/dashboard/cobranca` | admin, cobrança |
| | Comercial | `/dashboard/comercial` | admin, comercial |
| **CLIENTES** | Lista de Clientes | `/clientes` | admin, gerência, comercial |
| | Análise de Crédito | `/clientes/analise` | admin, gerência |
| | Empréstimos Ativos | `/clientes/emprestimos` | admin, gerência |
| | Gestão de Parcelas | `/clientes/parcelas` | admin, gerência |
| | Histórico | `/clientes/historico` | admin, gerência |
| **REDE** | Mapa da Rede | `/rede` | admin, gerência |
| | Bônus e Comissões | `/rede/bonus` | admin, gerência |
| | Grupos Bloqueados | `/rede/bloqueados` | admin, gerência |
| | Indicar Novo | `/rede/indicar` | admin, comercial |
| **COMUNICAÇÃO** | Chat Geral | `/chat` | admin, gerência, cobrança, comercial |
| | WhatsApp | `/whatsapp` | admin, gerência, cobrança |
| | Fluxos de Chat | `/chat/fluxos` | admin, gerência |
| | Templates | `/chat/templates` | admin, gerência |
| **KANBAN** | Cobrança | `/kanban/cobranca` | admin, gerência, cobrança |
| | Análise de Crédito | `/kanban/analise` | admin, gerência |
| | Atendimento | `/kanban/atendimento` | admin, gerência, comercial |
| | Visão Gerencial | `/kanban/gerencial` | admin, gerência |
| **RELATÓRIOS** | Gerenciais | `/relatorios/gerenciais` | admin, gerência |
| | Operacionais | `/relatorios/operacionais` | admin, gerência |
| | Exportar Dados | `/relatorios/exportar` | admin, gerência |
| **PAGAMENTOS** | Pagamentos Pix | `/pagamentos/woovi` | admin, gerência |
| **CONFIGURAÇÕES** | Perfis de Acesso | `/configuracoes/perfis` | admin |
| | Gerenciar Usuários | `/configuracoes/usuarios` | admin |
| | Integrações | `/configuracoes/integracoes` | admin |
| | Minha Conta | `/configuracoes/conta` | todos |
| **EQUIPE** | Monitoramento | `/equipe/monitoramento` | admin, gerência |
| | Produtividade | `/equipe/produtividade` | admin, gerência |

---

## 13. Painel de Empréstimo (EmprestimoDetailModal)

Componente `EmprestimoDetailModal` em `EmprestimosAtivosPage.tsx` — modal completo para gestão de empréstimo individual.

### 13.1 Estrutura (3 Tabs)

```
EmprestimoDetailModal
├── Tab "Parcelas"
│   ├── Cards de resumo (total, pagas, pendentes, vencidas)
│   ├── Tabela de parcelas (data, valor, juros, multa, status)
│   └── Ações por parcela:
│       ├── Quitar (registrarPagamento)
│       ├── Baixa parcial (dialog com valor)
│       ├── Editar juros/multa manualmente (inline)
│       └── Zerar juros (updateParcela com juros=0)
├── Tab "Cliente"
│   ├── Card de dados pessoais (nome, CPF, email, telefone)
│   ├── Card de score e limites (barra visual)
│   ├── Card de rede de indicações (indicados com useIndicados)
│   └── Ações rápidas: Ir para Chat, Ver Histórico
└── Tab "Empréstimo"
    ├── Barra de progresso (pagas / total)
    ├── Detalhes do contrato (valor, parcelas, taxa, tipo juros)
    ├── Ações: Quitar Tudo, Marcar Inadimplente, Reativar
    └── Dialog de reativação (ao quitar última parcela)
```

### 13.2 Live Data

Os contadores de parcelas são calculados em tempo real a partir dos dados da query `useParcelasByEmprestimo`, não do prop estático `emprestimo.parcelasPagas`:

```typescript
const parcelasPagasCount = parcelas?.filter(p => p.status === 'paga').length ?? 0;
const parcelasTotalCount = parcelas?.length ?? 0;
const pendentesCount = parcelas?.filter(p => p.status === 'pendente' || p.status === 'vencida').length ?? 0;
```

### 13.3 Reativação Automática

Ao quitar a última parcela pendente, o sistema detecta `pendentesCount === 0` e exibe um dialog:
- **Reativar Cliente**: `updateCliente(clienteId, { status: 'em_dia', dias_atraso: 0 })`
- **Manter Inativo**: Apenas fecha o dialog

### 13.4 Hooks Utilizados

| Hook | Finalidade |
|------|-----------|
| `useParcelasByEmprestimo(id)` | Dados reais das parcelas |
| `useRegistrarPagamento()` | Quitar parcela |
| `useUpdateParcela()` | Editar juros/multa, zerar juros |
| `useUpdateEmprestimo()` | Quitar tudo, marcar inadimplente |
| `useUpdateCliente()` | Reativar cliente |
| `useIndicados(clienteId)` | Rede do cliente |
| `useClientes()` | Dados do cliente (fallback) |

### 13.5 `getStatusBadge(status)`

Função utilitária com fallback para status desconhecidos (evita crash ao receber status de domínios diferentes como `cliente_status`):

```typescript
const config = configs[status] || { label: status, className: 'bg-gray-100 text-gray-800 ...' };
```

---

## 14. Tema e Dark Mode

- **Tailwind CSS v4** com `@custom-variant dark (&:is(.dark *))` no CSS
- `ThemeContext` com `useTheme()` hook → `{ theme: 'light' | 'dark', toggleTheme }`
- Classe `.dark` aplicada no `<html>` via ThemeContext
- Toggle no header da sidebar (Sol/Lua)
- Persistência em `localStorage` (chave `fintechflow_theme`)

### Cores do sistema (`theme.css`)

| Variável | Light | Dark |
|----------|-------|------|
| `--background` | `#ffffff` | `#0F1729` |
| `--foreground` | `#2D3748` | `#E2E8F0` |
| `--card` | `#ffffff` | `#1A2332` |
| `--muted` | `#F5F7FA` | `#1E293B` |
| `--muted-foreground` | `#718096` | `#94A3B8` |
| `--primary` | `#0A2472` | `#0A2472` |
| `--destructive` | `#e53e3e` | `#e53e3e` |

### Padrão de classes dark mode

Todas as páginas seguem o padrão dual-class para garantir visibilidade em ambos os temas:

```
bg-green-100 dark:bg-green-900/30
text-green-800 dark:text-green-300
border-green-300 dark:border-green-700
bg-white dark:bg-card
```

Para componentes com **inline styles** (ReactFlow nodes, badges com cores dinâmicas), o hook `useTheme()` é usado em runtime:

```typescript
const { theme } = useTheme();
const isDark = theme === 'dark';
const colors = isDark ? COLORS_DARK : COLORS_LIGHT;
```

Sidebar fixo em `bg-slate-900` (sempre escuro, independente do tema).

---

## 15. Rede de Indicações — Arquitetura

### 15.1 Modelo de dados

A rede é derivada **diretamente** da FK recursiva `clientes.indicado_por`. Não há tabela `rede_indicacoes` preenchida manualmente — a rede é computada por **BFS** (Breadth-First Search) no serviço.

```
clientes
  └─ indicado_por → clientes(id)   ← FK recursiva
  └─ bonus_acumulado               ← bônus por indicação
  └─ score_interno                 ← 0–1000

bloqueios_rede
  └─ rede_id         ← ID derivado do cliente-raiz (rede-XXXXXXXX)
  └─ causado_por     ← FK → clientes(id) ON DELETE SET NULL
  └─ motivo          ← inadimplencia | fraude | manual | auto_bloqueio
  └─ ativo           ← boolean (bloqueio vigente)
  └─ bloqueado_em    ← timestamp do bloqueio
  └─ desbloqueado_em ← timestamp de liberação (nullable)
```

### 15.2 Tabela `bloqueios_rede`

| Coluna | Tipo | Restrições |
|--------|------|-----------|
| `id` | UUID | PK, DEFAULT gen_random_uuid() |
| `rede_id` | TEXT | NOT NULL |
| `causado_por` | UUID | FK → clientes(id) ON DELETE SET NULL |
| `motivo` | TEXT | NOT NULL, CHECK IN ('inadimplencia','fraude','manual','auto_bloqueio') |
| `descricao` | TEXT | — |
| `bloqueado_em` | TIMESTAMPTZ | DEFAULT now() |
| `desbloqueado_em` | TIMESTAMPTZ | — |
| `ativo` | BOOLEAN | NOT NULL, DEFAULT true |
| `created_at` | TIMESTAMPTZ | DEFAULT now() |

**Índices:** `idx_bloqueios_rede_id`, `idx_bloqueios_ativo` (partial, WHERE ativo = true)

**RLS:**

| Política | FOR | Regra |
|----------|-----|-------|
| `bloqueios_select` | SELECT | Qualquer autenticado |
| `bloqueios_insert` | INSERT | admin, gerência |
| `bloqueios_update` | UPDATE | admin, gerência |

### 15.3 Fluxo BFS (buildRedeFromClientes)

```
1. SELECT * FROM clientes ORDER BY nome
2. Constrói mapa: clienteId → Cliente
3. Constrói mapa de filhos: parentId → [childId, …]
4. Identifica clientes em cadeia (sobe ancestrais)
5. Encontra raízes: clientes na rede sem indicado_por válido
6. BFS por raiz → gera MembroRedeRow[] com:
   - rede_id = "rede-{rootId[0:8]}"
   - nivel = profundidade no BFS (raiz = 1)
   - status = 'ativo' (herdado, bloqueio vem de bloqueios_rede)
```

### 15.4 Service — `redeIndicacoesService.ts`

| Função | Descrição |
|--------|-----------|
| `getMembrosRede(redeId?)` | Todos os membros (ou filtrado por rede) via BFS |
| `getMembrosByRede(redeId)` | Membros de uma rede específica |
| `getMembroById(clienteId)` | Membro por ID do cliente |
| `getRedesUnicas()` | IDs únicos das redes |
| `createIndicacao(payload)` | Cria novo cliente com `indicado_por` definido |
| `vincularIndicacao(clienteId, indicadoPor)` | Vincula cliente existente a indicador |
| `getBloqueiosRede(redeId?)` | Bloqueios com JOIN nome do causador |
| `getBloqueiosAtivos()` | Bloqueios onde `ativo = true` |
| `criarBloqueio(data)` | Inserir bloqueio |
| `desbloquearRede(bloqueioId, redeId)` | Marca bloqueio como inativo |
| `bloquearRede(redeId, causadoPor, motivo)` | Cria bloqueio manual |

### 15.5 Adapters — `adapters.ts`

| Função | Direção | Descrição |
|--------|---------|-----------|
| `dbRedeIndicacaoToView()` | DB → View | `RedeIndicacaoComCliente` → `MembroRede` |
| `dbBloqueioRedeToView()` | DB → View | `BloqueioRedeComCausador` → `BloqueioRedeView` |

### 15.6 React Query Hooks — `useRedeIndicacoes.ts`

| Hook | Tipo | Key | Invalidações |
|------|------|-----|-------------|
| `useMembrosRede(redeId?)` | query | `rede-indicacoes` | — |
| `useMembrosByRede(redeId)` | query | `rede-indicacoes` | — |
| `useRedesUnicas()` | query | `rede-indicacoes, redes-unicas` | — |
| `useBloqueiosRede(redeId?)` | query | `bloqueios-rede` | — |
| `useBloqueiosAtivos()` | query | `bloqueios-rede, ativos` | — |
| `useCreateIndicacao()` | mutation | — | `rede-indicacoes`, `clientes` |
| `useVincularIndicacao()` | mutation | — | `rede-indicacoes`, `clientes` |
| `useDesbloquearRede()` | mutation | — | `rede-indicacoes`, `bloqueios-rede` |
| `useBloquearRede()` | mutation | — | `rede-indicacoes`, `bloqueios-rede` |

### 15.7 Tipos TypeScript

| Tipo | Arquivo | Campos principais |
|------|---------|-------------------|
| `MembroRede` | `mockData.ts` | `clienteId`, `clienteNome`, `clienteStatus`, `clienteValor`, `clienteBonusAcumulado`, `indicadoPor`, `nivel`, `redeId`, `status` |
| `BloqueioRedeView` | `mockData.ts` | `redeId`, `causadoPor`, `causadorNome`, `motivo`, `descricao`, `bloqueadoEm`, `desbloqueadoEm`, `ativo` |
| `RedeStats` | `mockData.ts` | `totalMembros`, `emDia`, `aVencer`, `vencidos`, `bloqueados`, `niveis`, `totalBonus`, `totalCarteira`, `redeBloqueada` |
| `BloqueioRede` | `database.types.ts` | Linha raw do banco |
| `BloqueioRedeComCausador` | `database.types.ts` | Com JOIN: `clientes: { nome }` |
| `CriarIndicacaoPayload` | `redeIndicacoesService.ts` | `nome`, `email`, `telefone`, `cpf?`, `sexo`, `indicadoPor?`, `valor?` |

---

## 16. Rede de Indicações — Páginas

### 16.1 `RedeIndicacoesPage.tsx` — Mapa interativo (~890 linhas)

**Rota:** `/rede` · **Acesso:** admin, gerência

**Dependências:**
- `@xyflow/react` v12 (ReactFlow, Background, Controls, MiniMap)
- `useTheme()` para cores tema-aware em nodes e edges
- `useMembrosRede`, `useBloqueiosAtivos`, `useRedesUnicas`

**Componentes internos:**
- `NetworkNode` — Custom node do ReactFlow com avatar, nome, status badge e valor. Usa mapas de cores duplos (`STATUS_COLORS_LIGHT` / `STATUS_COLORS_DARK`) com `useTheme()` para runtime.
- `computeLayout()` — Posiciona nós hierarquicamente (árvore) com BFS. Aceita `isDark` para cores de edges.
- `computeStats()` — Calcula `RedeStats` a partir dos membros filtrados.
- `RedeFlow` — Wrapper com state, filtros, sidebar e modal.

**Funcionalidades:**
- Canvas interativo com zoom (0.1x–2x), pan e fit-view automático
- Filtros por: rede, status do cliente, status na rede, nível máximo (slider), redes bloqueadas
- Busca por nome/email com highlight de nós
- Sidebar com estatísticas (total, em dia, à vencer, vencidos, bloqueados)
- Legenda visual com cores por status
- Modal de detalhes ao clicar em nó (carteira, bônus, score, contato)
- Edges tracejados para membros bloqueados, animados para vencidos
- `<Background>` e `<MiniMap>` com cores adaptativas ao tema

### 16.2 `BonusComissoesPage.tsx` — Bônus e comissões (~360 linhas)

**Rota:** `/rede/bonus` · **Acesso:** admin, gerência

**Dependências:** `useMembrosRede`

**Funcionalidades:**
- Tabela de todos os membros ranqueados por bônus acumulado
- Filtros por rede, status do cliente, busca por nome
- Score badge com cor (verde ≥700, amarelo ≥400, vermelho <400)
- Valor de bônus com formatação BRL
- Status badge com cores dark-mode-aware
- KPI cards no topo: total bônus, média, membros elegíveis

### 16.3 `GruposBloqueadosPage.tsx` — Gestão de bloqueios (~650 linhas)

**Rota:** `/rede/bloqueados` · **Acesso:** admin, gerência

**Dependências:** `useMembrosRede`, `useBloqueiosAtivos`, `useDesbloquearRede`, `useBloquearRede`

**Funcionalidades:**
- **Aba "Bloqueados":** redes com bloqueio ativo
  - Card por rede bloqueada com nome do causador, motivo, data
  - Lista de membros afetados com status individual
  - Detalhes expandíveis (membros, valores, breakdown por status)
  - Botão "Desbloquear Rede" (mutation)
- **Aba "Em Risco":** redes não bloqueadas mas com inadimplentes (status `vencido`)
  - Identifica redes em risco automático
  - Mostra inadimplentes por rede com dias de atraso e valor
  - Breakdown total da rede (em dia, à vencer, vencidos)
- Alert banner no topo com contagem de bloqueios ativos
- Métricas: redes bloqueadas, membros afetados, valor impactado

### 16.4 `IndicarNovoPage.tsx` — Cadastro de indicação (~640 linhas)

**Rota:** `/rede/indicar` · **Acesso:** admin, comercial

**Dependências:** `useClientes`, `useCreateIndicacao`

**Funcionalidades:**
- Wizard de 3 etapas: Indicador → Dados → Confirmação
- **Etapa 1:** Combobox de busca por nome ou CPF (Popover + Command)
  - Filtragem em tempo real contra lista de clientes
  - Opção "Captação Direta" (sem indicador)
  - Card de preview do indicador selecionado
- **Etapa 2:** Formulário com nome, email, telefone, CPF, sexo
  - Validação de campos obrigatórios
- **Etapa 3:** Confirmação visual com todos os dados
  - Toast de sucesso/erro via Sonner
- Tela de sucesso com ações pós-cadastro (nova indicação, ver rede)

---

> **Nota:** Todas as 4 páginas da Rede de Indicações foram refatoradas para visibilidade completa em dark mode, utilizando classes `dark:*` do Tailwind e mapas de cores duais com `useTheme()` para inline styles (ReactFlow).

---

<!-- ──────────────────────────────────────────────────────────────────
  PRÓXIMOS PASSOS PARA DEPLOY COMPLETO
  ──────────────────────────────────────────────────────────────────

  ## Checklist de Deploy — FintechFlow

  ### 1. Ambiente Supabase (Produção)
  - [ ] Criar projeto Supabase de produção (ou promover o atual)
  - [x] Executar `supabase/schema.sql` no SQL Editor para criar todas as tabelas
  - [x] Executar `supabase/seed-admin.sql` para criar o usuário admin inicial
  - [x] Executar `supabase/seed-data.sql` para dados de demonstração
  - [x] Verificar todas as 12 tabelas criadas com RLS habilitado
  - [x] Confirmar triggers `set_updated_at` e `on_auth_user_created` ativos
  - [x] Confirmar funções RPC `get_dashboard_stats()`, `get_financial_summary()` e `get_kanban_stats()`
  - [x] Migration `004_kanban_tables.sql` aplicada via `supabase db push` (02/03/2026)
  - [x] Testar políticas RLS com diferentes roles (admin, gerencia, comercial, cobranca)

  ### 2. Edge Functions
  - [ ] Deploy das 3 edge functions:
        supabase functions deploy invite-user
        supabase functions deploy update-user-role
        supabase functions deploy delete-user
  - [ ] Configurar secrets no Supabase Dashboard:
        SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
  - [ ] Testar via curl/Postman cada function com JWT de admin

  ### 3. Variáveis de Ambiente
  - [ ] Criar `.env.production` com:
        VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
        VITE_SUPABASE_ANON_KEY=eyJ...
  - [ ] NUNCA commitar service_role_key no frontend
  - [ ] Verificar que `isSupabaseConfigured()` retorna true em produção

  ### 4. Build & Hosting
  - [ ] `npm run build` → gera dist/ (~1.5MB gzipped)
  - [ ] Escolher plataforma de hosting:
        - Vercel (recomendado): `vercel --prod`
        - Netlify: `netlify deploy --prod`
        - Cloudflare Pages: `wrangler pages deploy dist/`
        - Supabase Hosting (beta)
  - [ ] Configurar redirects para SPA:
        - Vercel: vercel.json → { "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
        - Netlify: _redirects → /* /index.html 200
  - [ ] Configurar domínio customizado + SSL
  - [ ] Configurar headers de segurança (CSP, HSTS, X-Frame-Options)

  ### 5. Configuração de Auth (Supabase)
  - [ ] Habilitar email provider no Auth → Providers
  - [ ] Configurar Site URL para o domínio de produção
  - [ ] Adicionar Redirect URLs permitidas
  - [ ] Configurar templates de email (confirmação, reset de senha) em PT-BR
  - [ ] Opcionalmente habilitar Phone (OTP) ou OAuth (Google, etc.)
  - [ ] Definir política de senha (mínimo 8 chars, etc.)

  ### 6. Realtime & Mensagens
  - [ ] Habilitar Realtime no Supabase Dashboard para tabela `mensagens`
  - [ ] Configurar Realtime policies (INSERT para canais de cliente)
  - [ ] Testar websockets em produção (firewall, proxy)

  ### 7. Monitoramento & Observabilidade
  - [ ] Configurar Sentry ou similar para erro tracking no frontend:
        npm install @sentry/react
  - [ ] Habilitar Supabase Logs (Dashboard → Logs)
  - [ ] Configurar alertas de erro no Supabase (functions failures)
  - [ ] Monitorar métricas de banco: connections, queries lentas
  - [ ] Configurar uptime monitoring (UptimeRobot, Better Uptime)

  ### 8. Performance
  - [ ] Implementar code-splitting com `React.lazy()`:
        - Dividir por seção (dashboard, clientes, rede, comunicação, kanban, relatórios)
        - Bundle atual ~1.5MB pode ser reduzido com splitting
  - [ ] Habilitar compressão Brotli/Gzip no hosting
  - [ ] Verificar cache headers para assets estáticos (hash nos filenames já ok via Vite)
  - [ ] Testar Lighthouse score (Core Web Vitals)
  - [ ] Otimizar ReactFlow para redes grandes (virtualização, lazy rendering)

  ### 9. Segurança
  - [ ] Audit de RLS: garantir que nenhuma tabela tem SELECT * sem restrição
  - [ ] Confirmar que service_role_key só está nas Edge Functions (server-side)
  - [ ] Implementar rate limiting no Supabase (Auth → Rate Limits)
  - [ ] Configurar CORS no Supabase para aceitar apenas domínio de produção
  - [ ] Revisar permissões por role (canAccess no sidebar já implementado)
  - [ ] Adicionar 2FA para usuários admin (Supabase MFA)

  ### 10. Backups & Disaster Recovery
  - [ ] Habilitar backups automáticos no Supabase (Pro plan: diário)
  - [ ] Configurar Point-in-Time Recovery (PITR) se disponível
  - [ ] Documentar processo de restore
  - [ ] Testar restore em ambiente staging

  ### 11. CI/CD (opcional mas recomendado)
  - [ ] GitHub Actions para:
        - Lint + Type-check em PRs
        - Build automático em merge para main
        - Deploy automático para Vercel/Netlify
  - [ ] Pipeline sugerido:
        name: Deploy
        on:
          push:
            branches: [main]
        jobs:
          deploy:
            runs-on: ubuntu-latest
            steps:
              - uses: actions/checkout@v4
              - uses: actions/setup-node@v4
                with: { node-version: 20 }
              - run: npm ci
              - run: npm run build
              - # deploy step (Vercel CLI, Netlify CLI, etc.)

  ### 12. Integrações Pendentes (funcionalidade)
  - [ ] WhatsApp — Evolution API (arquitetura documentada, implementação em andamento)
  - [ ] Fluxos de chatbot → executar automações reais (webhook triggers)
  - [ ] Exportar Dados → gerar CSV/Excel real (atualmente mock)
  - [ ] Relatórios → gerar PDF com dados reais
  - [ ] Integrações → conectar APIs externas configuradas em IntegracoesPage
  - [ ] Monitoramento de funcionários → tracking real de sessões
  - [ ] Notificações push para parcelas vencendo

  ### 13. Testes (recomendado antes de produção)
  - [ ] Testes unitários para services e adapters (Vitest)
  - [ ] Testes de componente para páginas críticas (React Testing Library)
  - [ ] Testes E2E para fluxos principais (Playwright ou Cypress):
        - Login → Dashboard → CRUD Cliente → Empréstimo → Parcelas → Pagamento
        - Criar indicação → Ver rede → Bloquear → Desbloquear
  - [ ] Testar todas as 5 roles com cenários reais
  - [ ] Testar dark mode em todas as páginas

  ──────────────────────────────────────────────────────────────────
  FIM DOS PRÓXIMOS PASSOS

---

## ARQUITETURA KANBAN — DADOS REAIS (v4.0)

### Visão Geral

Todas as 4 páginas Kanban (Cobrança, Análise de Crédito, Atendimento, Gerencial) agora
operam com dados reais do Supabase, sem nenhum dado mock. A arquitetura segue o padrão
de camadas do projeto:

```
Page (componente React + drag-and-drop)
  └─ Hook (useQuery / useMutation — TanStack React Query)
      └─ Service (supabase.from().select/insert/update)
          └─ Adapter (snake_case → camelCase)
              └─ Supabase (PostgreSQL)
```

### Tabelas Kanban

| Tabela | Descrição | Enum de Status |
|--------|-----------|----------------|
| `analises_credito` | Solicitações de crédito | `analise_credito_status`: pendente, em_analise, aprovado, recusado |
| `tickets_atendimento` | Tickets de atendimento | `ticket_status`: aberto, em_atendimento, aguardando_cliente, resolvido, cancelado |
| `kanban_cobranca` | Cards de cobrança | `kanban_cobranca_etapa`: a_vencer, vencido, contatado, negociacao, acordo, pago, perdido |

Tabelas auxiliares:
- `ticket_canal` (enum): whatsapp, chat, telefone, email, presencial
- `ticket_prioridade` (enum): baixa, media, alta, urgente

### Serviços implementados

| Serviço | Arquivo | Operações |
|---------|---------|-----------|
| `analiseCreditoService` | `services/analiseCreditoService.ts` | CRUD + filtro por status |
| `ticketsService` | `services/ticketsService.ts` | CRUD + moverTicket + atribuirTicket |
| `kanbanCobrancaService` | `services/kanbanCobrancaService.ts` | CRUD + moverCard + registrarContato + getKanbanStats |

### Hooks (TanStack React Query)

| Hook | Source | Query Key |
|------|--------|-----------|
| `useAnalises`, `useUpdateAnalise` | `useAnaliseCredito.ts` | `analises-credito` |
| `useTickets`, `useMoverTicket`, `useUpdateTicket` | `useTickets.ts` | `tickets` |
| `useCardsCobranca`, `useMoverCardCobranca`, `useRegistrarContato` | `useKanbanCobranca.ts` | `kanban-cobranca` |

### Drag-and-Drop

Todas as páginas Kanban usam a Web Drag and Drop API nativa (sem bibliotecas extras).
Ao soltar um card em outra coluna, uma mutation é disparada via `useMutation`, que:
1. Chama o service para atualizar o status/etapa no Supabase
2. Invalida a query key para refetch automático
3. Exibe toast de sucesso ou erro

### Monitoramento de Desempenho (KanbanGerencialPage)

A página gerencial consolida dados das 3 áreas (Crédito, Atendimento, Cobrança) e
calcula métricas de desempenho por funcionário cruzando:

- `analises_credito.analista_id` ↔ `funcionarios.id` — análises realizadas/aprovadas/recusadas
- `tickets_atendimento.atendente_id` ↔ `funcionarios.id` — tickets atendidos/resolvidos  
- `kanban_cobranca.responsavel_id` ↔ `funcionarios.id` — cobranças/pagos

Métricas individuais: total de ações, conclusões, taxa de conclusão (%). Servem para
avaliação de produtividade e distribuição de carga de trabalho.

---

## ARQUITETURA WHATSAPP / EVOLUTION API

### Decisão Arquitetural: Um chip (número) por departamento

Cada departamento terá seu próprio número de WhatsApp conectado via Evolution API:

| Departamento | Número | Uso |
|--------------|--------|-----|
| Comercial | (XX) XXXXX-0001 | Prospecção, indicações, vendas |
| Cobrança | (XX) XXXXX-0002 | Lembretes, renegociação, acordos |
| Atendimento | (XX) XXXXX-0003 | SAC, dúvidas, suporte geral |
| Admin/Gerência | (XX) XXXXX-0004 | Comunicados internos, supervisão |

### Por que um número por departamento (e não por usuário)?

1. **Profissionalismo**: cliente interage com "a empresa", não com indivíduos
2. **Continuidade**: se um funcionário sair, o histórico e o número permanecem
3. **Custo menor**: 4 instâncias vs. dezenas de instâncias individuais
4. **Gestão centralizada**: fácil monitorar todas as conversas por área
5. **Templates aprovados**: cada departamento usa templates específicos aprovados pela Meta
6. **Escalabilidade**: novos funcionários usam o chip existente do departamento

### Arquitetura da Integração

```
┌─────────────────────┐
│  Frontend React     │
│  (ChatPage.tsx)     │
│  (FluxosChatPage)   │
└────────┬────────────┘
         │ REST API
         ▼
┌─────────────────────┐     ┌────────────────────────┐
│  Supabase Edge      │     │  Evolution API          │
│  Functions          │────▶│  (Docker / self-hosted) │
│  (send-message,     │     │  4 instâncias:          │
│   webhook-handler)  │◀────│  comercial, cobranca,   │
└────────┬────────────┘     │  atendimento, admin     │
         │                  └────────┬───────────────┘
         ▼                           │
┌─────────────────────┐              │ WhatsApp Cloud API
│  Supabase Database  │              ▼
│  (mensagens,        │     ┌────────────────────────┐
│   templates,        │     │  WhatsApp (Meta)        │
│   fluxos_chatbot)   │     │  4 números conectados   │
└─────────────────────┘     └────────────────────────┘
```

### Fluxo de Mensagem (Envio)

1. Usuário clica "Enviar" no ChatPage ou aciona template
2. Frontend chama Edge Function `send-message` com `{ to, message, departamento }`
3. Edge Function identifica a instância Evolution API pelo departamento
4. Evolution API envia para WhatsApp via Cloud API
5. Webhook de confirmação salva status na tabela `mensagens`

### Fluxo de Mensagem (Recebimento / Webhook)

1. WhatsApp recebe mensagem do cliente
2. Evolution API encaminha webhook para Edge Function `webhook-handler`
3. Edge Function:
   - Salva mensagem na tabela `mensagens`
   - Verifica se há fluxo de chatbot ativo → executa ação automática
   - Notifica frontend via Supabase Realtime (canal `mensagens`)
4. Frontend atualiza a interface em tempo real

### Configuração por Departamento (tabela futura: `whatsapp_instancias`)

```sql
CREATE TABLE whatsapp_instancias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  departamento TEXT NOT NULL UNIQUE,
  instance_name TEXT NOT NULL,       -- nome na Evolution API
  instance_token TEXT,               -- token de autenticação
  phone_number TEXT,                 -- número conectado
  status TEXT DEFAULT 'desconectado', -- conectado, desconectado, qr_pendente
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### Próximos Passos para Implementação WhatsApp

1. ~~Instalar Evolution API (Docker) no servidor~~ ✅
2. ~~Criar instâncias (uma por departamento)~~ ✅ (via UI ou API)
3. ~~Criar tabela `whatsapp_instancias` no Supabase~~ ✅ (migration 005)
4. ~~Criar Edge Functions: `send-whatsapp`, `webhook-whatsapp`, `manage-instance`~~ ✅
5. ~~Conectar ChatPage.tsx ao fluxo real~~ ✅
6. Configurar templates aprovados pela Meta por departamento
7. ~~Implementar chatbot com FluxosChatPage → webhook triggers~~ ✅
  ────────────────────────────────────────────────────────────────── -->

---

## 17. Guia: Criar Instância WhatsApp (Evolution API)

Este guia documenta o **passo-a-passo completo** para colocar uma instância WhatsApp em funcionamento no FintechFlow.

### 17.1 Pré-requisitos

| Item | Descrição |
|------|-----------|
| **Evolution API** | Instância rodando (Docker ou servidor dedicado). Versão recomendada: v2.x |
| **URL da Evolution** | Ex: `https://evo.seudominio.com` ou `http://localhost:8080` |
| **API Key Global** | Chave master configurada no `AUTHENTICATION_API_KEY` do `.env` da Evolution |
| **Supabase** | Projeto ativo com Edge Functions deployed |
| **Chip WhatsApp** | Número de telefone com WhatsApp ativo (pode ser pessoal ou business) |

### 17.2 Instalar Evolution API (Docker)

```bash
# 1. Criar docker-compose.yml
cat > docker-compose.yml << 'EOF'
version: '3.8'
services:
  evolution-api:
    image: atendai/evolution-api:latest
    container_name: evolution-api
    restart: always
    ports:
      - "8080:8080"
    environment:
      # Autenticação
      AUTHENTICATION_API_KEY: "SUA_CHAVE_API_SECRETA_AQUI"
      AUTHENTICATION_EXPOSE_IN_FETCH_INSTANCES: "true"
      
      # Configurações gerais
      SERVER_URL: "https://evo.seudominio.com"
      CONFIG_SESSION_PHONE_CLIENT: "FintechFlow"
      CONFIG_SESSION_PHONE_NAME: "Chrome"
      
      # Banco de dados (opcional, usar SQLite por padrão)
      DATABASE_ENABLED: "false"
      
      # Webhooks globais
      WEBHOOK_GLOBAL_ENABLED: "false"
      WEBHOOK_GLOBAL_URL: ""
      
      # QR Code
      QRCODE_LIMIT: 30
      QRCODE_COLOR: "#198754"
    volumes:
      - evolution_data:/evolution/instances
      - evolution_store:/evolution/store

volumes:
  evolution_data:
  evolution_store:
EOF

# 2. Subir o container
docker compose up -d

# 3. Verificar se está rodando
curl http://localhost:8080/
# Resposta esperada: { "status": 200, "message": "Welcome to Evolution API..." }
```

> **Produção:** Use HTTPS (Nginx/Caddy reverse proxy). A URL final será tipo `https://evo.seudominio.com`.

### 17.3 Deploy das Edge Functions no Supabase

```bash
# Na raiz do projeto
cd /Users/macbook/Desktop/botter/FinanceDigital

# Deploy das 3 Edge Functions do WhatsApp
supabase functions deploy manage-instance
supabase functions deploy send-whatsapp
supabase functions deploy webhook-whatsapp --no-verify-jwt
```

> **Importante:** `webhook-whatsapp` usa `--no-verify-jwt` pois recebe chamadas da Evolution API (sem token JWT).

### 17.4 Criar Instância — Pela Interface (Recomendado)

1. Acesse o FintechFlow → **Comunicação** → **WhatsApp**
2. Clique em **"Nova Instância"**
3. Preencha o formulário:

| Campo | Exemplo | Descrição |
|-------|---------|-----------|
| **Nome da instância** | `cobranca-01` | Identificador único na Evolution API (sem espaços) |
| **URL da Evolution API** | `https://evo.seudominio.com` | URL base onde a Evolution está rodando |
| **API Key Global** | `SUA_CHAVE_API_SECRETA_AQUI` | Mesma chave do `AUTHENTICATION_API_KEY` |
| **Departamento** | `cobranca` | Opções: `geral`, `cobranca`, `comercial`, `atendimento` |
| **Telefone** | `5511999999999` | Número do chip (formato internacional, sem +) |

4. Clique em **"Criar Instância"**
5. Um **QR Code** será exibido automaticamente
6. Abra o WhatsApp no celular → **Dispositivos conectados** → **Conectar dispositivo** → Escaneie o QR Code
7. Status mudará para **"Conectada"** ✅

### 17.5 Criar Instância — Via API (cURL)

```bash
# Variáveis
SUPABASE_URL="https://ctvihcpojodsntoelfck.supabase.co"
SUPABASE_ANON_KEY="sua_anon_key_aqui"
USER_JWT="token_jwt_do_usuario_logado"

# Criar instância
curl -X POST "${SUPABASE_URL}/functions/v1/manage-instance" \
  -H "Authorization: Bearer ${USER_JWT}" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "create",
    "instance_name": "cobranca-01",
    "evolution_url": "https://evo.seudominio.com",
    "evolution_global_apikey": "SUA_CHAVE_API_SECRETA_AQUI",
    "departamento": "cobranca",
    "phone_number": "5511999999999"
  }'
```

**Resposta de sucesso (201):**
```json
{
  "success": true,
  "instancia": {
    "id": "uuid-da-instancia",
    "instance_name": "cobranca-01",
    "departamento": "cobranca",
    "status": "aguardando_qr",
    "evolution_url": "https://evo.seudominio.com",
    "webhook_url": "https://ctvihcpojodsntoelfck.supabase.co/functions/v1/webhook-whatsapp"
  },
  "qr_code": "data:image/png;base64,iVBOR..."
}
```

### 17.6 Conectar Instância Existente (gerar novo QR)

```bash
curl -X POST "${SUPABASE_URL}/functions/v1/manage-instance" \
  -H "Authorization: Bearer ${USER_JWT}" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "connect",
    "instancia_id": "uuid-da-instancia"
  }'
```

### 17.7 Verificar Status

```bash
curl -X POST "${SUPABASE_URL}/functions/v1/manage-instance" \
  -H "Authorization: Bearer ${USER_JWT}" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "status",
    "instancia_id": "uuid-da-instancia"
  }'
```

**Resposta:**
```json
{
  "success": true,
  "instancia_id": "uuid",
  "instance_name": "cobranca-01",
  "status": "conectada",
  "evolution_state": "open",
  "phone_number": "5511999999999"
}
```

### 17.8 Todas as Ações da Edge Function `manage-instance`

| Ação | Método | Params | Descrição |
|------|--------|--------|-----------|
| `create` | POST | `instance_name`, `evolution_url`, `evolution_global_apikey`, `departamento?`, `phone_number?` | Cria instância na Evolution + salva no banco + retorna QR Code |
| `connect` | POST | `instancia_id` | Gera QR Code para reconexão |
| `disconnect` | POST | `instancia_id` | Desconecta a sessão WhatsApp |
| `status` | POST | `instancia_id` | Verifica status na Evolution + sincroniza banco |
| `delete` | POST | `instancia_id` | Remove da Evolution + banco (mensagens mantidas) |
| `restart` | POST | `instancia_id` | Reinicia instância na Evolution |
| `set_webhook` | POST | `instancia_id` | (Re)configura webhook na Evolution → `webhook-whatsapp` |

### 17.9 Enviar Mensagem de Teste

Após a instância estar **conectada**:

```bash
curl -X POST "${SUPABASE_URL}/functions/v1/send-whatsapp" \
  -H "Authorization: Bearer ${USER_JWT}" \
  -H "Content-Type: application/json" \
  -d '{
    "instancia_id": "uuid-da-instancia",
    "telefone": "5511988887777",
    "conteudo": "Olá! Esta é uma mensagem de teste do FintechFlow 🚀",
    "tipo": "text"
  }'
```

**Tipos de mensagem suportados:** `text`, `image`, `document`, `audio`

### 17.10 Fluxo Completo — Diagrama

```
┌─────────────────────────────────────────────────────────────────┐
│                        CRIAR INSTÂNCIA                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  UI (WhatsAppPage)  ──►  whatsappService.criarInstancia()       │
│         │                        │                              │
│         │              supabase.functions.invoke('manage-instance')
│         │                        │                              │
│         │              ┌─────────▼──────────┐                   │
│         │              │  Edge Function      │                   │
│         │              │  manage-instance     │                   │
│         │              │  action: "create"    │                   │
│         │              └─────────┬──────────┘                   │
│         │                        │                              │
│         │           ┌────────────┼────────────┐                 │
│         │           ▼                         ▼                 │
│  ┌──────────────┐  POST /instance/create    INSERT INTO         │
│  │  QR Code     │  → Evolution API          whatsapp_instancias │
│  │  exibido     │                                               │
│  └──────┬───────┘                                               │
│         │                                                       │
│  Usuário escaneia QR                                            │
│         │                                                       │
│  Evolution envia webhook ──►  webhook-whatsapp                  │
│  { event: "connection.update", state: "open" }                  │
│         │                                                       │
│  webhook atualiza status = "conectada" no banco                 │
│         │                                                       │
│  Realtime notifica UI  ──►  Badge verde "Conectada" ✅          │
└─────────────────────────────────────────────────────────────────┘
```

### 17.11 Troubleshooting

| Problema | Causa provável | Solução |
|----------|---------------|---------|
| QR Code não aparece | Evolution API não alcançável | Verificar URL e se o container está rodando |
| Erro 401 ao criar | JWT inválido ou expirado | Relogar no FintechFlow |
| Erro 403 | Usuário sem permissão | Apenas `admin` e `gerencia` podem gerenciar instâncias |
| Erro 502 em envio | Timeout da Evolution API ou ngrok offline | Verificar se ngrok está ativo; atualizar secret `EVOLUTION_API_URL` |
| "URL retornou HTML — ngrok pode ter mudado" | ngrok reiniciou e gerou nova URL | Rodar `npx supabase secrets set EVOLUTION_API_URL="https://..."` com a nova URL |
| "Número XXXXX@s.whatsapp.net não encontrado" | JID completo passado para Evolution | Bug corrigido — `send-whatsapp` agora passa apenas dígitos |
| "Número XXXXX@lid não encontrado" | Contato @lid sendo usado como número | Aguardar o contato enviar mensagem primeiro; botão de envio fica bloqueado na UI |
| Mensagens de contato @lid não aparecem | `remoteJid` contém ID interno | Bug corrigido — `webhook-whatsapp` usa `key.remoteJidAlt` para obter número real |
| Insert silencioso falha sem log | `direcao` ou `status` violando CHECK/enum | Aplicar migration 002 (já aplicada no projeto) |
| Status "desconectada" após escanear QR | Webhook não configurado | Usar ação `set_webhook` para reconfigurar |
| Mensagens não chegam | Webhook URL incorreta | Verificar se `webhook-whatsapp` foi deployed com `--no-verify-jwt` |
| API Key errada ou Evolution offline | `AUTHENTICATION_API_KEY` incorreto | Verificar `AUTHENTICATION_API_KEY` e `curl` direto na Evolution |
| QR Code expira | Normal após ~30s | Clicar em "Reconectar" para gerar novo QR |

### 17.12 Configuração por Departamento (Recomendada)

Para uma operação completa, crie **uma instância por departamento**:

| Departamento | instance_name | Telefone | Uso |
|-------------|---------------|----------|-----|
| `geral` | `geral-01` | 5511900000001 | Atendimento geral e boas-vindas |
| `cobranca` | `cobranca-01` | 5511900000002 | Cobrança automática, parcelas |
| `comercial` | `comercial-01` | 5511900000003 | Vendas, propostas, novos clientes |
| `atendimento` | `atendimento-01` | 5511900000004 | Suporte, dúvidas, SAC |

Os **fluxos de chatbot** (Fluxos de Chat) são vinculados por departamento — quando uma mensagem chega numa instância, o chatbot ativo daquele departamento é executado automaticamente.

### 17.13 Gerenciar URL da Evolution API via Supabase Secrets (ngrok)

Quando o ngrok reinicia (ex.: máquina reiniciada, sessão expirada), a URL pública muda. Todas as Edge Functions lêem o secret `EVOLUTION_API_URL` **com prioridade** sobre o valor salvo na tabela `whatsapp_instancias`.

**Atualizar a URL quando o ngrok mudar:**

```bash
# Substituir pela URL atual do ngrok
npx supabase secrets set EVOLUTION_API_URL="https://xxxx-yyyy-zzzz.ngrok-free.app"

# Confirmar que foi salvo
npx supabase secrets list
```

> As Edge Functions usam a nova URL imediatamente nas próximas requisições — **sem redeploy**.

**Como identificar que a URL mudou:**
- UI exibe: _"URL retornou HTML — ngrok pode ter mudado"_
- Ou: _"Falha ao criar instância na Evolution"_

**Lógica de prioridade (em todas as Edge Functions):**

```typescript
// manage-instance, send-whatsapp:
const baseUrl = (Deno.env.get("EVOLUTION_API_URL") || inst.evolution_url || "").replace(/\/$/, "");
// 1. Secret EVOLUTION_API_URL  ← atualizar via CLI quando ngrok mudar
// 2. evolution_url do banco     ← fallback estático
```

### 17.14 Contatos @lid (WhatsApp Business — ID Interno)

**O que é @lid?**

Contatos do WhatsApp Business com `addressingMode: 'lid'` recebem um ID interno do WhatsApp (ex.: `62771517513738@lid`) em vez de expor o número de telefone. O número real fica em `key.remoteJidAlt`.

**Comportamento no FintechFlow:**

| Situação | Comportamento |
|----------|---------------|
| Contato envia mensagem → webhook | `key.remoteJid` = `62771517513738@lid` · `key.remoteJidAlt` = `5547989279037@s.whatsapp.net` → sistema usa `remoteJidAlt` |
| Conversa na UI | Mostra número real (`5547989279037`) |
| Tentar enviar para @lid sem `remoteJidAlt` | Botão bloqueado + banner âmbar explicativo |
| Contato @lid envia nova mensagem | JID promovido para o número real automaticamente |

**Implementação em `webhook-whatsapp/index.ts`:**

```typescript
const isLid = message.key?.addressingMode === "lid";
const remoteJidAlt = message.key?.remoteJidAlt || "";
const jidParaEnvio = isLid && remoteJidAlt ? remoteJidAlt : remoteJid;
const telefone = jidParaEnvio.replace(/@.*$/, ""); // só dígitos no banco

// metadata salvo em whatsapp_mensagens_log:
metadata: {
  jid: jidParaEnvio,           // @s.whatsapp.net real — usado para responder
  lid_jid: isLid ? remoteJid : null, // @lid original preservado
}
```

### 17.15 Formato de Número na Evolution API

**Regra obrigatória:** Passar **somente dígitos** no campo `number` da requisição para a Evolution API.

```
✅ CORRETO:   "5547989279037"               (dígitos puros)
❌ ERRADO:    "5547989279037@s.whatsapp.net" (JID completo)
❌ ERRADO:    "+55 47 98927-9037"            (formatado)
```

**Motivo:** A Evolution API chama `createJid()` internamente, que:
1. Aplica as regras brasileiras do 9º dígito
2. Verifica se o número existe no WhatsApp
3. Resolve o JID correto

Passar o JID completo bypassa essa lógica e resulta em _"número não encontrado"_.

**Implementação em `send-whatsapp/index.ts`:**

```typescript
// Remover @domain e deixar só dígitos
const formattedNumber = telefone.replace(/@.*$/, "").replace(/\D/g, "");

// Corpo da requisição para a Evolution:
body: JSON.stringify({ number: formattedNumber, ... }) // ex: "5547989279037"
```

---

## 18. Editor Visual de Fluxos (ReactFlow)

### 18.1 Visão Geral

O editor visual permite criar e configurar fluxos de chatbot de forma gráfica usando **ReactFlow** (`@xyflow/react` v12). Cada nó no canvas representa uma etapa do fluxo, e as conexões (edges) definem o caminho de execução.

- **Rota:** `/chat/fluxos/:id/editor`  
- **Layout:** Fullscreen (sem sidebar), apenas header com botões Voltar e Salvar
- **Preload:** Tela de carregamento animada (Lottie) por 5 segundos

### 18.2 Tipos de Nó

| Tipo | Cor | Handles | Descrição |
|------|-----|---------|-----------|
| **Trigger** (gatilho) | Azul | 1 source (bottom) | Ponto de entrada, mostra tipo de gatilho e palavra-chave. Não editável/deletável |
| **Mensagem** | Verde | 1 target (top) + 1 source (bottom) | Texto, botões interativos (até 3), mídia (imagem/vídeo/doc/áudio), delay |
| **Condição** | Amarelo | 1 target (top) + 2 sources (Sim 30% / Não 70%) | Avalia variável (resposta, horário, status, parcelas) com operador |
| **Ação** | Roxo | 1 target + 1 source | Transferir atendente/depto, adicionar tag, webhook, criar tarefa |
| **Espera** | Laranja | 1 target + 1 source | Aguardar N milissegundos antes de continuar |
| **Finalizar** | Vermelho | 1 target (apenas) | Encerra o fluxo com motivo de fechamento |

### 18.3 Estrutura JSONB `config` por tipo

Cada nó salva estado no campo `config: JSONB` da tabela `fluxos_chatbot_etapas`:

```jsonc
// Mensagem
{
  "position": { "x": 300, "y": 200 },
  "buttons": [
    { "label": "Sim, quero pagar", "value": "pagar" },
    { "label": "Falar com atendente", "value": "atendente" }
  ],
  "media_url": "https://...",
  "media_type": "image",
  "delay_ms": 2000,
  "connections": [{ "targetId": "uuid-prox-etapa" }]
}

// Condição
{
  "position": { "x": 300, "y": 400 },
  "variable": "resposta",
  "operator": "equals",
  "value": "sim",
  "connections": [
    { "targetId": "uuid-sim", "sourceHandle": "sim", "label": "Sim" },
    { "targetId": "uuid-nao", "sourceHandle": "nao", "label": "Não" }
  ]
}

// Ação
{
  "position": { "x": 300, "y": 600 },
  "action_type": "transferir_atendente",
  "connections": [{ "targetId": "uuid-prox" }]
}

// Espera
{
  "position": { "x": 300, "y": 500 },
  "duration_ms": 300000,
  "duration_label": "Aguardar 5 minutos",
  "connections": [{ "targetId": "uuid-prox" }]
}

// Finalizar
{
  "position": { "x": 300, "y": 800 },
  "close_reason": "Atendimento concluído"
}
```

### 18.4 Persistência

O editor salva **todo o estado** (posições, conexões, configs) ao clicar em "Salvar":

1. Nós existentes → `UPDATE fluxos_chatbot_etapas SET config = ..., proximo_sim = ..., proximo_nao = ...`
2. Nós novos → `INSERT INTO fluxos_chatbot_etapas`
3. Nós removidos → `DELETE FROM fluxos_chatbot_etapas`
4. Compatibilidade retroativa: `proximo_sim` e `proximo_nao` populados para condições

### 18.5 Acesso

Na página **Fluxos de Chat** (`/chat/fluxos`), cada card de fluxo possui o botão **"Editor Visual"** que redireciona para `/chat/fluxos/:id/editor`.

---

## 19. WhatsApp: Internals & Bugs Resolvidos

Registro completo dos problemas encontrados na integração WhatsApp + Evolution API e como foram resolvidos. Serve de referência para debug futuro.

### 19.1 Tabela de Bugs Resolvidos

| # | Erro / Sintoma | Causa Raiz | Fix Aplicado |
|---|----------------|-----------|-------------|
| 1 | Insert silencioso — mensagens não salvavam | `direcao: "entrada"` violava CHECK; `status: "recebida"` violava enum | **Migration 002**: `ALTER TYPE whatsapp_msg_status ADD VALUE IF NOT EXISTS 'enviada'/'recebida'/'lida'/'falha'`; CHECK atualizado para aceitar `entrada`, `saida`, `enviada`, `recebida` |
| 2 | Erro 400 ao enviar | Status check `!== "conectada"` não aceitava `"conectado"` | Aceitar ambos: `status === 'conectada' \|\| status === 'conectado'` |
| 3 | Erro 401 ao enviar | JWT gateway rejeitava função | Deploy com `--no-verify-jwt` |
| 4 | Erro 502 ao enviar | Evolution API lenta → gateway mata com 502 (sem CORS) | `AbortController` 20s + retornar HTTP 200 com `{success:false}` |
| 5 | SDK swallows errors | `supabase.functions.invoke` lança erro genérico em qualquer non-2xx | Função retorna sempre 200; erro em `data.success === false` |
| 6 | `@lid` não encontrado | `62771517513738@lid` passado como número para Evolution | Bloquear envio na UI + usar `key.remoteJidAlt` no webhook para obter número real |
| 7 | URL ngrok muda | `evolution_url` no banco fica desatualizado | Secret `EVOLUTION_API_URL` tem prioridade; atualizar com `npx supabase secrets set` |
| 8 | 23 registros com telefone `62771517513738` | Webhook salvava dígitos do @lid como telefone antes do fix | Deployed função temporária `fix-lid-records` → atualizou para `5547989279037` |
| 9 | `@s.whatsapp.net` no número | JID completo passado para Evolution bypassa `createJid()` e regras BR | Passar apenas dígitos: `telefone.replace(/@.*$/, "").replace(/\D/g, "")` |

### 19.2 Migration 002 — Enum e CHECK Fix

Arquivo: `supabase/migrations/002_fix_whatsapp_enums.sql`

```sql
-- Adicionar valores ao enum whatsapp_msg_status
ALTER TYPE whatsapp_msg_status ADD VALUE IF NOT EXISTS 'enviada';
ALTER TYPE whatsapp_msg_status ADD VALUE IF NOT EXISTS 'recebida';
ALTER TYPE whatsapp_msg_status ADD VALUE IF NOT EXISTS 'lida';
ALTER TYPE whatsapp_msg_status ADD VALUE IF NOT EXISTS 'falha';

-- Atualizar constraint de direção para aceitar todos os valores usados
ALTER TABLE whatsapp_mensagens_log
  DROP CONSTRAINT IF EXISTS whatsapp_mensagens_log_direcao_check;

ALTER TABLE whatsapp_mensagens_log
  ADD CONSTRAINT whatsapp_mensagens_log_direcao_check
  CHECK (direcao IN ('entrada', 'saida', 'enviada', 'recebida'));
```

**Status:** Aplicada no banco de produção.

### 19.3 Estrutura do Metadata Salvo no Banco

Campo `metadata` (JSONB) em `whatsapp_mensagens_log` para mensagens recebidas via webhook:

```jsonc
{
  "jid": "5547989279037@s.whatsapp.net",  // JID real para enviar resposta
  "lid_jid": "62771517513738@lid",         // @lid original (null se não for @lid)
  "raw_key": { ... },                       // key completa do payload Evolution
  "push_name": "João Silva",               // nome de exibição do contato
  "instance_name": "cobranca-01"           // nome da instância que recebeu
}
```

### 19.4 Prioridade JID em `getConversas`

A função `getConversas` em `whatsappService.ts` resolve o JID para exibição e envio seguindo esta ordem de prioridade:

```typescript
// 1. metadata.jid que não seja @lid → número real
if (rawJid && !rawJid.endsWith('@lid')) {
  jid = rawJid;
// 2. metadata.lid_jid_original que não seja @lid → registros antigos do fix
} else if (typeof meta.lid_jid_original === 'string' && !meta.lid_jid_original.endsWith('@lid')) {
  jid = meta.lid_jid_original;
// 3. Fallback: usar como está ou montar com telefone do banco
} else {
  jid = rawJid || `${msg.telefone}@s.whatsapp.net`;
}

// Promoção: se conversa tinha @lid e chegou JID melhor, atualizar
if (entry.jid.endsWith('@lid') && !jid.endsWith('@lid')) {
  entry.jid = jid;
}
```

### 19.5 Timeout nas Edge Functions

Todas as Edge Functions que chamam a Evolution API usam `AbortController` com 20 segundos:

```typescript
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 20000);

const evoRes = await fetch(`${baseUrl}/...`, {
  method: "POST",
  headers: { ... },
  body: JSON.stringify({ ... }),
  signal: controller.signal,
});

clearTimeout(timeoutId);
```

Se a Evolution API não responder em 20s, a função retorna HTTP 200 com `{success: false, error: "Timeout"}` — mantendo compatibilidade CORS (502 não retorna headers CORS).

### 19.6 Deploy Reference

Comandos completos para redeploy após mudanças:

```bash
# Deploy das Edge Functions WhatsApp
npx supabase functions deploy manage-instance
npx supabase functions deploy send-whatsapp
npx supabase functions deploy webhook-whatsapp --no-verify-jwt

# Atualizar URL do ngrok (sem redeploy)
npx supabase secrets set EVOLUTION_API_URL="https://xxxx.ngrok-free.app"

# Build do frontend
npm run build

# Verificar secrets configurados
npx supabase secrets list
```

### 19.7 UI WhatsApp — Referência Técnica

**Arquivo:** `src/app/pages/WhatsAppPage.tsx`

| Elemento | Implementação |
|----------|---------------|
| Altura do chat | `style={{ height: 'min(620px, calc(100vh - 260px))', minHeight: '420px' }}` |
| Contato @lid | Banner âmbar substituindo input de texto |
| Bloqueio de envio @lid | `if (destino.endsWith('@lid')) { toast.error(...); return; }` |
| Cor de fundo chat (light) | `bg-[#efeae2]` |
| Cor de fundo chat (dark) | `dark:bg-[#0d1117]` |
| Mensagem enviada (light) | `bg-[#d9fdd3]` |
| Mensagem enviada (dark) | `dark:bg-[#005c4b]` |
| Mensagem recebida (light) | `bg-white` |
| Mensagem recebida (dark) | `dark:bg-[#202c33]` |
| Avatar | `getAvatarColor(telefone)` + `getInitials(push_name, telefone)` |
| Formatação de número | `formatPhone(telefone)` — exibe `(47) 98927-9037` |
| Erro de envio | `stripAtDomain(error)` — remove `@s.whatsapp.net` das mensagens de erro |

### Próximos Passos para Implementação WhatsApp

1. ~~Instalar Evolution API (Docker) no servidor~~ ✅
2. ~~Criar instâncias (uma por departamento)~~ ✅ (via UI ou API)
3. ~~Criar tabela `whatsapp_instancias` no Supabase~~ ✅ (migration 005)
4. ~~Criar Edge Functions: `send-whatsapp`, `webhook-whatsapp`, `manage-instance`~~ ✅
5. ~~Conectar ChatPage.tsx ao fluxo real~~ ✅
6. Configurar templates aprovados pela Meta por departamento
7. ~~Implementar chatbot com FluxosChatPage → webhook triggers~~ ✅
8. ~~Deploy da Evolution API no Fly.io (URL estática)~~ ✅
9. ~~Auto-configuração de webhook nas instâncias~~ ✅
  ────────────────────────────────────────────────────────────────── -->

---

## INFRA — Evolution API no Fly.io (v5.0 — 04/03/2026)

### Contexto

Anteriormente a Evolution API rodava localmente com ngrok, o que causava mudança de URL
a cada reinício do túnel. A solução definitiva foi hospedar a Evolution API no **Fly.io**
com URL estática e TLS gerenciado automaticamente.

### URL Estática

```
https://finance-digital-evolution.fly.dev
```

Certificado TLS provisionado automaticamente pelo Fly.io. URL nunca muda.

### Estrutura de arquivos (`fly-evolution/`)

| Arquivo | Descrição |
|---------|-----------|
| `fly-evolution/Dockerfile` | Imagem `atendai/evolution-api:v1.8.7` |
| `fly-evolution/fly.toml` | Config Fly.io: região `gru` (São Paulo), 512MB RAM, armazenamento local |
| `fly-evolution/deploy.sh` | Script de (re)deploy e setup completo |

### Configuração Fly.io

| Parâmetro | Valor |
|-----------|-------|
| App name | `finance-digital-evolution` |
| Região | `gru` (São Paulo) |
| CPU | shared-cpu-1x |
| RAM | 512MB (upgrade: `fly scale memory 1024`) |
| Volume | `evolution_data` — 1GB — montado em `/evolution/instances` |
| Secret `AUTHENTICATION_API_KEY` | `FinanceDigital_EvoKey_2025` |

### Secrets do Supabase (Edge Functions)

```
EVOLUTION_API_URL = https://finance-digital-evolution.fly.dev
EVOLUTION_API_KEY = FinanceDigital_EvoKey_2025
```

Configurados via `supabase secrets set` e consumidos em:
- `manage-instance` → `Deno.env.get("EVOLUTION_API_URL")`
- `send-whatsapp` → `Deno.env.get("EVOLUTION_API_URL")`

---

## Auto-configuração de Instâncias (v5.1 — 04/03/2026)

### Problema resolvido

Com ngrok, a URL mudava a cada reinício. Isso significava:
1. Webhook nas instâncias apontava para URL antiga (morta)
2. Mensagens não chegavam ao Supabase
3. Era necessário reconfigurar manualmente cada instância

### Solução implementada (3 camadas)

#### Camada 1 — `sync_all` (Edge Function `manage-instance`)

Nova action na `manage-instance`:

```
POST /functions/v1/manage-instance
{ "action": "sync_all" }
```

**Fluxo:**
1. Chama `GET /instance/fetchInstances` na Evolution API (Fly.io)
2. Para cada instância encontrada:
   - Faz **upsert** na tabela `whatsapp_instancias` (por `instance_name`)
   - Atualiza `evolution_url` para a URL estática do Fly.io
   - Configura webhook via `POST /webhook/set/{instanceName}`
3. Retorna `{ total, synced, results[], webhook_url, evolution_url }`

**Uso típico:** após migração de ngrok → Fly.io, ou após reinício do servidor.

#### Camada 2 — Auto-webhook no `connection.update` (Edge Function `webhook-whatsapp`)

Ao receber evento `connection.update` com `state=open`:
1. Busca instância no banco (com `evolution_url` e `instance_token`)
2. Re-configura webhook via `POST /webhook/set/{instanceName}` automaticamente
3. Atualiza `webhook_url` e `evolution_url` no banco

**Resultado:** toda vez que um telefone escaneia o QR e conecta, o webhook é garantido.

#### Camada 3 — Botão "Sincronizar" na `WhatsAppPage`

Novo botão ao lado de "Nova Instância":

- Hook: `useSyncInstancias()` em `useWhatsapp.ts`
- Service: `syncAll()` em `whatsappService.ts`
- Tipo: `SyncAllResult` em `whatsappService.ts`
- Exibe toast: `"Sincronizadas: 3/3 instâncias com webhook configurado."`

### Novos artefatos de código

| Artefato | Local | Tipo |
|----------|-------|------|
| `sync_all` action | `supabase/functions/manage-instance/index.ts` | Edge Function |
| Auto-webhook `state=open` | `supabase/functions/webhook-whatsapp/index.ts` | Edge Function |
| `syncAll()` | `src/app/services/whatsappService.ts` | Service |
| `SyncAllResult` | `src/app/services/whatsappService.ts` | TypeScript type |
| `useSyncInstancias()` | `src/app/hooks/useWhatsapp.ts` | React Query mutation |
| Botão "Sincronizar" | `src/app/pages/WhatsAppPage.tsx` | UI component |

### Fluxo completo após deploy

```
1. fly deploy (fly-evolution/)
   └─ Evolution API no ar: https://finance-digital-evolution.fly.dev

2. Clicar "Sincronizar" na página WhatsApp
   └─ manage-instance: sync_all
      ├─ GET /instance/fetchInstances → Evolution API
      ├─ upsert whatsapp_instancias (Supabase)
      └─ POST /webhook/set/{name} para cada instância
         └─ webhook_url = https://ctvihcpojodsntoelfck.supabase.co/functions/v1/webhook-whatsapp

3. Escanear QR Code
   └─ connection.update (state=open) → webhook-whatsapp
      └─ auto-set webhook (camada de garantia)

4. Mensagem recebida
   └─ WhatsApp → Fly.io (Evolution) → Supabase webhook-whatsapp → DB + Chatbot
```

### Comandos de operação

```bash
# Logs em tempo real
fly logs --app finance-digital-evolution

# Status da máquina
fly status --app finance-digital-evolution

# SSH no container (debug)
fly ssh console --app finance-digital-evolution

# Aumentar RAM
fly scale memory 1024 --app finance-digital-evolution

# Redeploy completo
cd fly-evolution && ./deploy.sh
```

---

## ⚠️ ALERTA CRÍTICO: Deploy de Edge Functions — `--no-verify-jwt`

**Data da descoberta:** 04/03/2026

**Problema:** O Supabase Auth gera JWTs com algoritmo **ES256** (assimétrico), mas o
gateway das Edge Functions valida tokens usando **HS256** (simétrico, via `JWT_SECRET`).
Isso causa erro `401 "Invalid JWT"` no nível do gateway, **antes** de a função ser
executada. O frontend envia um JWT válido, mas o gateway rejeita por incompatibilidade
de algoritmo.

**Sintoma no browser:** `Failed to load resource: the server responded with a status of 401 ()`

**Solução:** Toda Edge Function deve ser deployada com `--no-verify-jwt`. A autenticação
do usuário é feita **internamente** pela própria função via `adminClient.auth.getUser(jwt)`.

### Comandos de deploy (SEMPRE usar --no-verify-jwt)

```bash
supabase functions deploy manage-instance  --project-ref ctvihcpojodsntoelfck --no-verify-jwt
supabase functions deploy send-whatsapp    --project-ref ctvihcpojodsntoelfck --no-verify-jwt
supabase functions deploy webhook-whatsapp --project-ref ctvihcpojodsntoelfck --no-verify-jwt
supabase functions deploy invite-user      --project-ref ctvihcpojodsntoelfck --no-verify-jwt
supabase functions deploy update-user-role --project-ref ctvihcpojodsntoelfck --no-verify-jwt
supabase functions deploy delete-user      --project-ref ctvihcpojodsntoelfck --no-verify-jwt
```

**Segurança:** Não há risco — todas as funções verificam o JWT internamente com
`adminClient.auth.getUser(jwt)` antes de executar qualquer operação. A única exceção é
`webhook-whatsapp` que é intencionalmente público (recebe webhooks da Evolution API).

---

## 20. Bot WhatsApp — Auto-Reply Score/Status (v6.0 — 07/03/2026)

### Contexto

Clientes podem consultar seus dados por WhatsApp sem interação humana. O bot responde automaticamente quando detecta as palavras-chave `score`, `meu score`, `status` ou `meu status`.

### Implementação

Localizado em `supabase/functions/webhook-whatsapp/index.ts`, executado **antes** do matching de chatbot por palavra-chave.

### Fluxo

```
1. Mensagem chega via webhook-whatsapp
2. Extrai texto e normaliza (trim, lowercase)
3. Verifica match: "score", "meu score", "status", "meu status"
4. Se match:
   a. Busca cliente por telefone em `clientes` (últimos 8 dígitos)
   b. Se encontrado → monta resposta formatada → envia via Evolution API
   c. Se não encontrado → envia mensagem informativa
   d. Loga em `whatsapp_mensagens_log` com `metadata.auto_reply = true`
   e. Return (não continua para chatbot)
5. Se não match → continua fluxo normal (chatbot por palavra-chave)
```

### Respostas

**Score:**
```
📊 *Seu Score de Crédito*

🔢 Score: 750/1000
📈 Faixa: Bom
💰 Limite de crédito: R$ 5.000,00
✅ Disponível: R$ 3.200,00
🎁 Bônus acumulado: R$ 150,00
```

**Status:**
```
📋 *Status do seu Cadastro*

📌 Status: Em dia
🔢 Score: 750/1000
💰 Limite de crédito: R$ 5.000,00
📊 Utilizado: R$ 1.800,00
⏰ Dias em atraso: 0
```

### Faixas de Score

| Range | Faixa |
|-------|-------|
| 0–300 | Muito Baixo |
| 301–500 | Baixo |
| 501–700 | Regular |
| 701–850 | Bom |
| 851–1000 | Excelente |

### Metadados Salvos

```json
{
  "auto_reply": true,
  "query_type": "score" | "status",
  "client_found": true | false
}
```

---

## 21. Produtividade da Equipe — Kanban + Auto-Ticket (v6.1 — 11/03/2026)

### 21.1 Atividades contabilizadas por Kanban

A página `/equipe/produtividade` (`ProdutividadePage.tsx`) agora conta **atividades reais dos Kanbans** por funcionário, mapeando role → kanban:

| Role do Funcionário | Kanban Fonte | Campo de Vínculo | Tabela |
|---------------------|-------------|------------------|--------|
| `cobranca` | Kanban Cobrança | `responsavelId` | `kanban_cobranca` |
| `comercial` | Kanban Atendimento | `atendenteId` | `tickets_atendimento` |
| `admin` / `gerencia` | Análise de Crédito | `analistaId` | `analises_credito` |

**Hooks adicionais importados:**
- `useAnalises()` → análises de crédito
- `useCardsCobranca()` → cards de cobrança
- `useTickets()` → tickets de atendimento

**KPIs recalculados:**
- **Meta atingida (%)**: `totalAtividades / totalMeta × 100` — baseado em atividades kanban
- **Atividades Kanban**: soma das atividades reais (não mais `atividadesHoje` genérico)
- **Top Performer**: quem tem maior proporção atividades/meta no kanban

### 21.2 Gráficos Redesenhados

| Aba | Antes | Depois |
|-----|-------|--------|
| **Visão Geral** | LWCChart histogram (financeiro/feio) | `CategoryBarChart` barras agrupadas Meta × Realizado com nomes |
| **Ranking** | Lista simples com cores ruins no dark | Cards gradientes Top 3 (Trophy/Medal/Star), barra de progresso, badge kanban |
| **Comparativo** | LWCChart quadrado histogram+line | `CategoryBarChart` horizontal (Horas Hoje × Horas Semana) |
| **Por Hora** | LWCChart area (mantido) | LWCChart area (sem alteração — já adequado) |

**Cores com suporte a dark mode:**
- KPIs: `bg-blue-100 dark:bg-blue-900/40`, `bg-green-100 dark:bg-green-900/40`, etc.
- Ranking: `dark:border-amber-500/30 dark:bg-amber-950/20` para Top 1, variantes para Top 2/3
- Barras de progresso: `bg-emerald-500 dark:bg-emerald-400`, `bg-red-400 dark:bg-red-500`

### 21.3 Auto-Ticket de Atendimento via WhatsApp

**Problema:** Tickets de atendimento nunca eram criados automaticamente. A tabela `tickets_atendimento` ficava vazia, impedindo que o Kanban Atendimento e a Produtividade contabilizassem atividades da equipe comercial.

**Solução A — Webhook (`webhook-whatsapp`):**

No bloco `messages.upsert`, após salvar a mensagem de entrada e antes do auto-reply de Score/Status, adicionamos:

```ts
// Se o cliente existe e não tem ticket aberto, cria automaticamente
if (cliente?.id) {
  const { data: ticketAberto } = await adminClient
    .from("tickets_atendimento")
    .select("id")
    .eq("cliente_id", cliente.id)
    .in("status", ["aberto", "em_atendimento", "aguardando_cliente"])
    .limit(1)
    .maybeSingle();

  if (!ticketAberto) {
    await adminClient.from("tickets_atendimento").insert({
      cliente_id: cliente.id,
      assunto: `Atendimento WhatsApp — ${pushName}`,
      canal: "whatsapp",
      status: "aberto",
      prioridade: "media",
    });
  }
}
```

**Condições para criação automática:**
1. Mensagem de entrada (não `fromMe`)
2. Telefone vinculado a um `cliente` cadastrado
3. Não há ticket aberto (`aberto`, `em_atendimento` ou `aguardando_cliente`) para esse cliente

**Solução B — Botão manual na WhatsAppPage:**

No header do chat, ao lado dos botões de Etiqueta e Vincular Cliente, adicionamos um botão "Abrir ticket de atendimento" que aparece quando:
- A conversa está vinculada a um cliente (`linkedClienteId` existe)
- Não há ticket aberto para esse cliente (`!hasOpenTicket`)

O botão chama `createTicket.mutate()` com `canal: 'whatsapp'`.

**Hooks adicionados na WhatsAppPage:**
- `useCreateTicket` e `useTicketsByCliente` de `../hooks/useTickets`

### 21.4 Deploy — Webhook Atualizado

Após estas alterações, é necessário re-deploiar a Edge Function:

```bash
supabase functions deploy webhook-whatsapp --no-verify-jwt
```

---

## 22. Integração Woovi (OpenPix) — Pagamentos Pix

### 22.1 Visão Geral

Integração completa com a **API da Woovi (OpenPix)** para operações financeiras via Pix:
- Criação e gestão de cobranças Pix com QR Code
- Liberação de empréstimos via pagamento Pix direto
- Recebimento automático de parcelas
- Split de pagamentos para rede de indicadores (subcontas)
- Webhooks em tempo real para atualização de status

### 22.2 Variáveis de Ambiente

```bash
# Frontend (.env)
VITE_WOOVI_APP_ID=<seu_app_id>

# Supabase Edge Functions (secrets)
supabase secrets set WOOVI_APP_ID=<seu_app_id>
supabase secrets set WOOVI_WEBHOOK_SECRET=<seu_webhook_secret>
```

### 22.3 Migration 008 — Schema Woovi

**Arquivo:** `supabase/migrations/008_woovi_integration.sql`

**Enums criados:**
- `woovi_charge_status`: `ACTIVE`, `COMPLETED`, `EXPIRED`, `ERROR`
- `woovi_transaction_status`: `PENDING`, `CONFIRMED`, `FAILED`, `REFUNDED`
- `woovi_transaction_type`: `CHARGE`, `PAYMENT`, `SPLIT`, `WITHDRAWAL`

**Tabelas criadas:**

| Tabela | Função |
|--------|--------|
| `woovi_charges` | Cobranças Pix — QR Code, BRCode, status, vínculo com `parcelas` e `emprestimos` |
| `woovi_transactions` | Transações financeiras — recebimentos, pagamentos, splits, saques |
| `woovi_subaccounts` | Subcontas de indicadores — saldo, chave Pix, ID Woovi |
| `woovi_webhooks_log` | Log de webhooks recebidos — evento, payload, processamento |

**Colunas adicionadas em tabelas existentes:**
- `clientes`: `pix_key`, `pix_key_type`
- `parcelas`: `woovi_charge_id`

**Função RPC:** `get_woovi_dashboard_stats()` — retorna estatísticas agregadas (total recebido, cobranças ativas/pagas, saldo subcontas, etc.)

### 22.4 Edge Functions

#### `woovi/index.ts` — API Gateway Woovi

Centraliza todas as chamadas à API da Woovi. Actions disponíveis:

| Action | Método Woovi | Descrição |
|--------|-------------|-----------|
| `create_charge` | `POST /charge` | Cria cobrança Pix, salva QR Code e BRCode |
| `get_charge` | `GET /charge/{id}` | Consulta status de cobrança |
| `list_charges` | `GET /charge` | Lista cobranças (com filtro status) |
| `delete_charge` | `DELETE /charge/{id}` | Cancela cobrança ativa |
| `create_payment` | `POST /payment` | Envia Pix para chave (liberação de empréstimo) |
| `get_balance` | `GET /balance` | Consulta saldo da conta Woovi |
| `create_subaccount` | `POST /subaccount` | Cria subconta para indicador |
| `get_subaccount` | `GET /subaccount/{id}` | Consulta subconta |
| `withdraw_subaccount` | `POST /subaccount/{id}/withdraw` | Saque de subconta do indicador |
| `get_transactions` | `GET /transactions` | Lista transações com filtros |
| `get_stats` | RPC local | Dashboard stats via `get_woovi_dashboard_stats()` |

**Deploy:**
```bash
supabase functions deploy woovi --no-verify-jwt
```

#### `webhook-woovi/index.ts` — Receptor de Webhooks

Recebe e processa webhooks da Woovi. Validação via header `x-webhook-secret`.

| Evento | Ação |
|--------|------|
| `OPENPIX:CHARGE_COMPLETED` | Marca parcela como `paga`, incrementa `parcelas_pagas` no empréstimo, cria transação, processa split para indicador |
| `OPENPIX:CHARGE_EXPIRED` | Marca cobrança como `EXPIRED` |
| `OPENPIX:TRANSACTION_RECEIVED` | Registra transação confirmada |
| `OPENPIX:TRANSACTION_REFUND_RECEIVED` | Registra estorno |

**URL do Webhook (configurar no painel Woovi):**
```
https://<project-id>.supabase.co/functions/v1/webhook-woovi
```

**Deploy:**
```bash
supabase functions deploy webhook-woovi --no-verify-jwt
```

### 22.5 Camada Frontend

#### Service: `wooviService.ts`

Funções principais:
- `criarCobranca()` / `consultarCobranca()` / `cancelarCobranca()`
- `getCobrancas()` / `getCobrancaById()` / `getCobrancasByParcela()` / `getCobrancasByCliente()`
- `liberarEmprestimoPix()` — envia Pix de liberação para chave do cliente
- `getSaldo()` / `getWooviStats()`
- `criarSubconta()` / `consultarSubconta()` / `sacarSubconta()` / `getSubcontas()`
- `getTransacoes()` / `getTransacoesByEmprestimo()`
- `subscribeToCharges()` / `subscribeToTransactions()` — Realtime via Supabase

#### Hook: `useWoovi.ts`

Hooks React Query com cache, polling e Realtime:

| Hook | Query Key | Polling | Realtime |
|------|-----------|---------|----------|
| `useCobrancasWoovi()` | `woovi-charges` | 30s | Sim |
| `useCobrancaWoovi(id)` | `woovi-charges` | — | — |
| `useCobrancasByParcela(id)` | `woovi-charges` | — | — |
| `useCobrancasByCliente(id)` | `woovi-charges` | — | — |
| `useSaldoWoovi()` | `woovi-balance` | 60s | — |
| `useWooviDashboardStats()` | `woovi-stats` | 60s | — |
| `useTransacoesWoovi()` | `woovi-transactions` | 30s | Sim |
| `useTransacoesByEmprestimo(id)` | `woovi-transactions` | — | — |
| `useSubcontasWoovi()` | `woovi-subaccounts` | — | — |
| `useSubcontaByCliente(id)` | `woovi-subaccounts` | — | — |
| `useWebhooksLogWoovi()` | `woovi-webhooks` | 30s | — |

Mutations: `useCriarCobrancaWoovi`, `useCancelarCobrancaWoovi`, `useLiberarEmprestimoPix`, `useCriarSubcontaWoovi`, `useConsultarSubcontaWoovi`, `useSacarSubcontaWoovi`

#### Componentes

| Componente | Descrição |
|------------|-----------|
| `WooviSaldoCard` | Card do dashboard — saldo, cobranças ativas/pagas, total recebido, subcontas |
| `PixQRCode` | QR Code Pix — imagem, BRCode copiável, link de pagamento, status, expiração |

#### Página: `PagamentosWooviPage`

Rota: `/pagamentos` (sidebar: PAGAMENTOS → Pagamentos Pix)

**Filtro de período global** — date pickers (Início / Fim) acima dos KPI cards. O período selecionado filtra **todas** as abas e os cards de métricas simultaneamente. Default: últimos 30 dias.

KPI Cards (topo):
| Card | Fonte | Descrição |
|------|-------|-----------|
| Conta EFI Bank | `useSaldoEfi()` | Saldo disponível na conta EFI |
| Entradas | API EFI (`/v2/pix`) + DB charges COMPLETED | Total recebido no período |
| Saídas | API EFI (`/v2/gn/pix/enviados`) | Total enviado no período |
| Cobranças | DB `woovi_charges` (gateway=efi) | Total / ativas / pagas / expiradas no período |

Tabs:
- **Cobranças** — lista com filtro por status (ACTIVE/COMPLETED/EXPIRED), busca, filtrada pelo período global
- **Transações** — recebimentos, pagamentos, splits, saques, filtrada pelo período global
- **Extratos** — timeline unificada de Pix recebidos + enviados via API EFI, com merge de cobranças pagas do DB (deduplicação por txid/e2eId). Filtro adicional por tipo (Todas / Entradas / Saídas). Cards de resumo: entradas, saídas e saldo do período

Hooks utilizados para extratos:
- `useListarPixRecebidosEfi(inicio, fim)` → `GET /v2/pix`
- `useListarPixEnviadosEfi(inicio, fim)` → `GET /v2/gn/pix/enviados`

> **Nota:** O campo `horario` retornado pela EFI é um **objeto** `{ solicitacao, liquidacao }`, não uma string ISO. O helper `extractDate()` trata ambos os formatos.

Modais:
- Nova Cobrança (selecionar cliente → parcela pendente/vencida → valor com juros calculado → ajuste manual opcional → envio automático via WhatsApp)
- Visualizar QR Code (exibe `PixQRCode` da cobrança ativa)

### 22.6 Ambientes — Sandbox vs Produção

A integração suporta dois ambientes. A diferença está na URL da API:

| Ambiente | URL API | Painel |
|----------|---------|--------|
| **Sandbox** | `https://api.woovi-sandbox.com/api/v1` | `app.woovi-sandbox.com` |
| **Produção** | `https://api.openpix.com.br/api/v1` | `app.woovi.com` |

A URL é configurável via variável de ambiente `WOOVI_API_URL` na edge function `woovi`.
Se não definida, usa sandbox por padrão.

> **Nota:** O sandbox da Woovi **não valida endpoints de webhook** apontando para
> URLs externas (ex: Supabase Edge Functions). Webhooks funcionam normalmente em produção.
> No sandbox, simule webhooks manualmente com `curl`:
>
> ```bash
> curl -X POST "https://<project>.supabase.co/functions/v1/webhook-woovi" \
>   -H "Content-Type: application/json" \
>   -d '{"event":"OPENPIX:CHARGE_COMPLETED","charge":{"correlationID":"xxx","transactionID":"tx-123","value":5000}}'
> ```

### 22.7 Guia Completo — Migração para Produção

#### Pré-requisitos

- Conta empresarial aprovada na Woovi ([app.woovi.com](https://app.woovi.com))
- Chave Pix cadastrada na conta Woovi
- Projeto Supabase em produção

#### Passo a Passo

**1. Gerar App ID de Produção:**
   - Acessar [app.woovi.com](https://app.woovi.com) → **API/Plugins** → **Nova API**
   - Copiar o **token de autorização (AppID)** gerado (só aparece uma vez!)

**2. Atualizar secrets no Supabase:**
```bash
# App ID de produção
supabase secrets set WOOVI_APP_ID="<app_id_producao>"

# URL da API de produção
supabase secrets set WOOVI_API_URL="https://api.openpix.com.br/api/v1"
```

**3. Fazer deploy das edge functions:**
```bash
supabase functions deploy woovi --no-verify-jwt
supabase functions deploy webhook-woovi --no-verify-jwt
```

**4. Cadastrar webhooks no painel Woovi (produção):**

Criar **10 webhooks** no painel, todos apontando para a mesma URL:

`https://<project-id>.supabase.co/functions/v1/webhook-woovi`

| # | Nome | Evento |
|---|------|--------|
| 1 | Cobrança Criada | `OPENPIX:CHARGE_CREATED` |
| 2 | Cobrança Paga | `OPENPIX:CHARGE_COMPLETED` |
| 3 | Cobrança Expirada | `OPENPIX:CHARGE_EXPIRED` |
| 4 | Paga por Terceiro | `OPENPIX:CHARGE_COMPLETED_NOT_SAME_CUSTOMER_PAYER` |
| 5 | Transação Recebida | `OPENPIX:TRANSACTION_RECEIVED` |
| 6 | Estorno Recebido | `OPENPIX:TRANSACTION_REFUND_RECEIVED` |
| 7 | Estorno Confirmado | `PIX_TRANSACTION_REFUND_RECEIVED_CONFIRMED` |
| 8 | Reembolso Confirmado | `PIX_TRANSACTION_REFUND_SENT_CONFIRMED` |
| 9 | Estorno Rejeitado | `PIX_TRANSACTION_REFUND_RECEIVED_REJECTED` |
| 10 | Reembolso Rejeitado | `PIX_TRANSACTION_REFUND_SENT_REJECTED` |

> A Woovi permite apenas 1 evento por webhook — crie um para cada.
> Na produção a validação do endpoint funciona normalmente.

**5. Configurar Webhook Secret:**

Após criar os webhooks, copie o secret gerado e configure:
```bash
supabase secrets set WOOVI_WEBHOOK_SECRET="<webhook_secret_producao>"
```

**6. Atualizar `.env` do frontend (opcional):**
```bash
VITE_WOOVI_APP_ID=<app_id_producao>
```

**7. Rodar migration (se ainda não rodou):**
```bash
supabase db push
```

**8. Testar em produção:**
```bash
# Verificar se a API responde
curl -s "https://api.openpix.com.br/api/v1/charge" \
  -H "Authorization: <app_id_producao>"

# Criar uma cobrança de teste (R$ 1,00)
curl -s -X POST "https://api.openpix.com.br/api/v1/charge" \
  -H "Authorization: <app_id_producao>" \
  -H "Content-Type: application/json" \
  -d '{"correlationID":"teste-prod-001","value":100,"comment":"Teste producao"}'
```

**9. Validação final:**
- [ ] Cobrança Pix criada e QR Code gerado
- [ ] Pagamento processado e parcela marcada como paga
- [ ] Webhook recebido e logado em `woovi_webhooks_log`
- [ ] Split para indicador creditado na subconta
- [ ] Página de Pagamentos exibe dados em tempo real

#### Rollback

Para voltar ao sandbox:
```bash
supabase secrets set WOOVI_API_URL="https://api.woovi-sandbox.com/api/v1"
supabase secrets set WOOVI_APP_ID="<app_id_sandbox>"
supabase functions deploy woovi --no-verify-jwt
```

### 22.8 Testes Realizados (Sandbox)

| Teste | Resultado |
|-------|-----------|
| Criar cobrança via API Woovi sandbox | ✅ 200 — QR Code + BRCode gerado |
| Webhook `CHARGE_COMPLETED` | ✅ 200 — Processado corretamente |
| Webhook `CHARGE_EXPIRED` | ✅ 200 — Processado corretamente |
| Webhook `CHARGE_COMPLETED_NOT_SAME_CUSTOMER_PAYER` | ✅ 200 — Processado com alerta |
| Webhook endpoint GET (validação) | ✅ 200 — `{"active":true}` |
| Webhook corpo vazio (validação) | ✅ 200 — Aceito sem erro |
| RLS bloqueia acesso anônimo a `woovi_webhooks_log` | ✅ Retorna `[]` |
| Edge function `woovi` rejeita JWT inválido | ✅ 401 — `"Token inválido"` |

---

## 23. Kanban Cobrança — Negociação Pix + Normalização Telefone (v7.1 — 17/03/2026)

### 23.1 Visão Geral

Esta atualização integra a **geração de cobranças Pix (Woovi/OpenPix)** diretamente no fluxo de negociação do Kanban de Cobrança e corrige o problema de **números de telefone sem DDI** que impediam o envio de mensagens via WhatsApp.

**Arquivos alterados:**

| Arquivo | Alteração |
|---------|----------|
| `src/app/pages/KanbanCobrancaPage.tsx` | Integração Woovi no modal de negociação, normalização de telefone |
| `supabase/functions/send-whatsapp/index.ts` | Normalização automática de DDI 55 no backend |

---

### 23.2 Normalização Automática de Telefone (DDI 55)

**Problema:** Números cadastrados sem o código do país (ex: `47989279037`) retornavam erro "Número não encontrado no WhatsApp" porque a Evolution API espera o formato internacional completo (`5547989279037`).

**Solução — duas camadas de proteção:**

#### Backend: `send-whatsapp/index.ts`

Antes de enviar para a Evolution API, o número é normalizado automaticamente:

```ts
let formattedNumber = telefone.replace(/@.*$/, "").replace(/\D/g, "");

// Garantir DDI 55 (Brasil): números com 10-11 dígitos sem prefixo 55
if (formattedNumber.length >= 10 && formattedNumber.length <= 11 && !formattedNumber.startsWith("55")) {
  formattedNumber = "55" + formattedNumber;
}
```

Regras:
- **10 dígitos** (DDD + fixo): `4732221234` → `554732221234`
- **11 dígitos** (DDD + celular com 9): `47989279037` → `5547989279037`
- **12-13 dígitos** (já com DDI): mantém como está
- Números com `@lid` (WhatsApp internal): bypass, enviado como está

#### Frontend: `KanbanCobrancaPage.tsx`

Função `normalizePhoneBR()` aplicada em todos os pontos de saída:

```ts
const normalizePhoneBR = (tel: string) => {
  const digits = tel.replace(/\D/g, '');
  if (digits.length >= 10 && digits.length <= 11 && !digits.startsWith('55')) {
    return '55' + digits;
  }
  return digits;
};
```

Pontos de aplicação:
- `handleEnviarWhatsappCobranca()` — envio via Evolution API
- `handleWhatsappDireto()` — abertura do wa.me
- Navegação para `/whatsapp?telefone=` (card dropdown e modal)

---

### 23.3 Geração de Cobrança Pix no Modal de Negociação

O modal de negociação do Kanban de Cobrança agora permite gerar uma **cobrança Pix via Woovi** diretamente, com expiração de 24 horas.

#### Fluxo Completo

```
Usuário abre Negociação
  ├─ Define valor acordado (pré-preenchido com valor da dívida)
  ├─ Clica "Gerar Pix (24h)"
  │   └─ Chama useCriarCobrancaWoovi() → Edge Function woovi → API Woovi
  │       └─ Retorna: QR Code + Link de Pagamento + BRCode
  ├─ Seleciona template de mensagem
  │   └─ Variáveis substituídas: {nome}, {valor}, {dias_atraso}, {valor_acordado}, {link_pix}
  ├─ Envia mensagem via WhatsApp Business (com link do Pix)
  └─ Card move para "Contatado"
```

#### Novos Estados no Componente

```ts
const [negValorAcordado, setNegValorAcordado] = useState('');
const [negCobrancaCriada, setNegCobrancaCriada] = useState<{
  paymentLink?: string;
  qrCodeImage?: string;
  brCode?: string;
  correlationID?: string;
} | null>(null);
```

#### Handler: `handleGerarPix()`

1. Valida o valor acordado (> 0)
2. Busca o empréstimo ativo/inadimplente do cliente para vincular
3. Chama `criarCobrancaWoovi.mutate()` com:
   - `cliente_id`, `emprestimo_id`
   - `valor` (valor acordado)
   - `expiration_minutes: 1440` (24h)
   - `cliente_nome`, `descricao`
4. Ao sucesso, armazena `paymentLink`, `qrCodeImage`, `brCode` no estado
5. Se já havia um template aplicado, substitui `{link_pix}` na mensagem

#### UI do Modal (ordem dos elementos)

1. **Valor Acordado (R$)** — input numérico + botão "Gerar Pix (24h)"
2. **Cobrança Pix Gerada** — QR Code, link copiável, código Pix Copia e Cola (exibido após gerar)
3. **Template de Mensagem** — selector com templates de cobrança e negociação
4. **Mensagem** — textarea editável com variáveis substituídas
5. **Instância WhatsApp** — selector de instância conectada
6. **Botões de Envio** — "Enviar via WhatsApp Business" + "App/Web"
7. **Mover sem enviar** — botão ghost para mover para Negociação

#### Variáveis de Template Suportadas

| Variável | Valor |
|----------|-------|
| `{nome}` | Nome do cliente |
| `{valor}` | Valor total da dívida (formatado R$) |
| `{dias_atraso}` | Dias em atraso |
| `{valor_acordado}` | Valor acordado na negociação (formatado R$) |
| `{link_pix}` | Link de pagamento Woovi (substituído após gerar Pix) |

---

### 23.4 Auto-Atualização ao Receber Pagamento

Quando o cliente paga o Pix gerado, o webhook da Woovi (`OPENPIX:CHARGE_COMPLETED`) dispara a seguinte cadeia:

```
Woovi → webhook-woovi Edge Function
  ├─ Atualiza woovi_charges.status = COMPLETED
  ├─ Marca parcela como paga (data_pagamento = hoje)
  ├─ Incrementa parcelas_pagas no empréstimo
  ├─ Se todas as parcelas pagas → status = quitado
  ├─ Registra transação em woovi_transactions
  └─ Processa split para indicador (se aplicável)

Próximo acesso ao Kanban → syncCobrancas()
  └─ Remove card do cliente sem dívida ativa
```

O Realtime do Supabase (`subscribeToCharges`) também invalida os caches React Query automaticamente.

---

### 23.5 Dependências Adicionadas ao Componente

```ts
import { useCriarCobrancaWoovi } from '../hooks/useWoovi';
```

Hook utilizado: `useCriarCobrancaWoovi()` — mutation que chama `wooviService.criarCobranca()` e invalida caches de cobranças, parcelas e stats.

---

## 24. Métricas do Projeto (v7.4.0)

| Métrica | Valor |
|---------|-------|
| Páginas funcionais | 36 |
| Rotas configuradas | 39 |
| React Query Hooks | 20 arquivos (~170+ hooks) |
| Services Supabase | 17 |
| Edge Functions | 12 |
| Componentes UI (shadcn) | 48 |
| Módulos compilados | ~2.900 |
| Erros de build | 0 |
| Dados mock | 0 (zero) |
| Tabelas PostgreSQL | 24+ |
| Políticas RLS | todas as tabelas |
| Integrações externas | WhatsApp (Evolution API), Pix (Woovi/OpenPix) |

---

## 25. Chat Interno — FloatingChat Widget (v7.3 — 18/03/2026)

### 25.1 Visão Geral

O Chat Interno é um sistema de comunicação em tempo real entre funcionários, implementado como um **widget flutuante** (`FloatingChat.tsx`) disponível em todas as páginas da aplicação.

**Arquivos principais:**

| Arquivo | Papel |
|---------|-------|
| `src/app/components/FloatingChat.tsx` | Widget flutuante principal |
| `src/app/services/chatInternoService.ts` | CRUD + Realtime subscription |
| `src/app/hooks/useChatInterno.ts` | React Query hooks |
| `src/app/hooks/useAudioRecorder.ts` | MediaRecorder (audio/webm) |
| `supabase/migrations/011_chat_interno_audio_atencao.sql` | Schema e bucket de Storage |

---

### 25.2 Banco de Dados — `chat_interno`

| Coluna | Tipo | Restrições |
|--------|------|-----------|
| `id` | UUID | PK, DEFAULT gen_random_uuid() |
| `remetente_id` | UUID | NOT NULL, FK → auth.users(id) CASCADE |
| `destinatario_id` | UUID | NOT NULL, FK → auth.users(id) CASCADE |
| `conteudo` | TEXT | NOT NULL |
| `tipo` | TEXT | NOT NULL, DEFAULT `'texto'` — valores: `texto`, `audio`, `atencao_cliente`, `atencao_emprestimo` |
| `metadata` | JSONB | DEFAULT `{}` — dados contextuais por tipo |
| `lida` | BOOLEAN | NOT NULL, DEFAULT false |
| `created_at` | TIMESTAMPTZ | DEFAULT now() |

**Migration 011** (`supabase/migrations/011_chat_interno_audio_atencao.sql`):
- Adiciona as colunas `tipo` e `metadata` à tabela `chat_interno`
- Cria bucket de Storage `chat-audio` para arquivos `audio/webm;codecs=opus`

---

### 25.3 Tipos de Mensagem

| `tipo` | `metadata` | Renderização |
|--------|-----------|-------------|
| `texto` | `{}` | Bubble de texto simples |
| `audio` | `{ url: string, duration?: number }` | `AudioPlayerInline` com waveform de 20 barras |
| `atencao_cliente` | `{ clienteId: string, clienteNome: string }` | Card âmbar com deep link → `/clientes?clienteId=` |
| `atencao_emprestimo` | `{ emprestimoId: string, clienteNome: string, valor: string }` | Card laranja-vermelho com deep link → `/clientes/emprestimos?emprestimoId=` |

---

### 25.4 FloatingChat.tsx — Arquitetura

**Posição:** `fixed bottom-6 right-6 z-50` · **Tamanho:** `w-96 h-[580px]`

**Views (estados internos):**

| View | Acesso | Descrição |
|------|--------|-----------|
| `contacts` | todos | Lista de contatos/conversas com preview da última mensagem |
| `chat` | todos | Conversa 1-a-1 com rolagem automática para baixo |
| `atencao` | admin only | Criação de card de atenção — tipo, cliente ou empréstimo |

**Componentes internos:**

| Componente | Descrição |
|------------|-----------|
| `AudioPlayerInline` | Player de áudio com waveform de 20 barras (`WAVE_BARS`). Botão play/pause alterna animação das barras durante reprodução. |
| `MsgBubble` | Renderiza bubble por tipo: texto / áudio / atencao_cliente (âmbar) / atencao_emprestimo (laranja-vermelho). |
| `SearchableCombobox` | Seletor com busca por nome + CPF. Usa `cmdk` (`Command`, `CommandInput`) dentro de Radix UI `Popover`. `PopoverContent` abre para cima (`side="top"`). |

**Estilo visual:**

| Tipo | Cor enviada | Cor recebida |
|------|------------|-------------|
| Texto | Gradiente indigo → violeta | Glass: bg-white/10 + backdrop-blur |
| Áudio | Gradiente indigo → violeta | Glass: bg-white/10 + backdrop-blur |
| Card cliente | amber-100 / amber-800 | — |
| Card empréstimo | orange-100 / red-800 | — |

**Fix de overflow:** A área de mensagens usa `flex flex-col flex-1 min-h-0` para garantir scroll correto dentro do contêiner de altura fixa.

---

### 25.5 Deep Links

O FloatingChat navega para páginas específicas ao clicar em um card de atenção:

| Card | Destino | Parâmetro |
|------|---------|-----------|
| `atencao_cliente` | `/clientes` | `?clienteId=<uuid>` |
| `atencao_emprestimo` | `/clientes/emprestimos` | `?emprestimoId=<uuid>` |

**Leitura dos parâmetros (padrão em ambas as páginas):**

```typescript
const [searchParams] = useSearchParams();
const paramId = searchParams.get('clienteId'); // ou 'emprestimoId'

useEffect(() => {
  if (paramId && data) {
    const item = data.find(i => i.id === paramId);
    if (item) { setSelected(item); setDialogOpen(true); }
  }
}, [paramId, data]);
```

---

### 25.6 Gravação de Áudio — `useAudioRecorder.ts`

| Estado / Função | Descrição |
|-----------------|-----------|
| `isRecording` | Boolean — gravação ativa |
| `startRecording()` | Solicita `getUserMedia({ audio: true })`, inicia `MediaRecorder` |
| `stopRecording()` | Para `MediaRecorder`, retorna `Blob` (audio/webm;codecs=opus) |
| `audioBlob` | Último blob gravado |

**Fluxo de envio de áudio no FloatingChat:**

1. Usuário pressiona o botão de microfone → `startRecording()`
2. Solta → `stopRecording()` → blob disponível
3. Upload para `chat-audio/` via `supabase.storage.from('chat-audio').upload(path, blob)`
4. Mensagem inserida na tabela com `tipo: 'audio'`, `metadata: { url: signedUrl }`

---

### 25.7 `SearchableCombobox` — Combobox Pesquisável (v7.3.1)

Componente inline em `FloatingChat.tsx` para seleção de clientes e empréstimos na view `atencao`.

**Dependências:** `cmdk` (via shadcn/ui `command.tsx`) + Radix UI `Popover` (via `popover.tsx`)

**Interface:**

```typescript
interface SearchableComboboxProps {
  value: string;
  onChange: (val: string) => void;
  items: { id: string; label: string; sub?: string }[];
  placeholder?: string;
}
```

**Conteúdo dos itens:**

| Seletor | `label` | `sub` |
|---------|---------|-------|
| Clientes | `nome` | `CPF · telefone` |
| Empréstimos | `nome do cliente` | `CPF · R$ valor` |

**Mecanismo de busca:** `CommandItem value={"\${item.label} \${item.sub ?? ''}"}` — cmdk filtra pela `value` inteira, permitindo match por qualquer combinação de nome, CPF, telefone ou valor.

---

### 25.8 Realtime

Cada conversa aberta no FloatingChat e no ChatPage (modo equipe) usa Supabase Realtime para receber mensagens em tempo real:

```typescript
supabase
  .channel(`chat-interno-${userId}`)
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'chat_interno',
    filter: `destinatario_id=eq.${userId}`,
  }, callback)
  .subscribe();
```

---

### 25.9 ChatPage — Modo Equipe

A página `/chat` (`ChatPage.tsx`) também exibe o histórico do chat interno com o mesmo sistema de renderização do FloatingChat:

- `AudioPlayerInline` para mensagens de áudio
- `MsgBubble` com os mesmos 4 tipos de mensagem
- Gradientes idênticos (enviado: indigo-violet; recebido: glass; cards: amber/orange-red)

---

## 26. Verificação de Identidade — Análise de Crédito (v7.4.0 — 19/03/2026)

### 26.1 Visão Geral

Sistema completo de verificação de identidade integrado ao fluxo de análise de crédito. O analista envia um magic link por e-mail ao cliente, que grava um vídeo-selfie lendo uma frase de verificação e faz upload de documentos (frente e verso do RG/CNH). O analista então revisa os materiais e aprova, rejeita ou solicita nova tentativa.

**Arquivos principais:**

| Arquivo | Papel |
|---------|-------|
| `src/app/pages/VerifyIdentityPage.tsx` | Página pública de verificação (wizard multi-etapa) |
| `src/app/components/AnaliseDetalhadaModal.tsx` | Modal de revisão com abas (Dados/Verificação/Histórico) |
| `src/app/services/identityVerificationService.ts` | CRUD + Storage (upload/signed URLs) |
| `src/app/hooks/useIdentityVerification.ts` | 9 React Query hooks |
| `src/app/lib/adapters.ts` | `dbIdentityVerificationToView()`, `dbVerificationLogToView()` |
| `supabase/migrations/012_identity_verification.sql` | Schema, RLS, Storage bucket |
| `supabase/functions/send-verification-link/index.ts` | Envio de magic link |
| `supabase/functions/approve-credit/index.ts` | Aprovação + Pix via Woovi |

---

### 26.2 Banco de Dados

#### `identity_verifications`

| Coluna | Tipo | Restrições |
|--------|------|------------|
| `id` | UUID | PK, default `gen_random_uuid()` |
| `analise_id` | UUID | FK → `analises_credito(id)` ON DELETE CASCADE |
| `user_id` | UUID | FK → `auth.users(id)`, nullable |
| `video_url` | TEXT | nullable |
| `document_front_url` | TEXT | nullable |
| `document_back_url` | TEXT | nullable |
| `verification_phrase` | TEXT | NOT NULL |
| `status` | `verification_status` | DEFAULT `'pending'` |
| `analyzed_by` | UUID | FK → `auth.users(id)`, nullable |
| `analyzed_at` | TIMESTAMPTZ | nullable |
| `rejection_reason` | TEXT | nullable |
| `requires_retry` | BOOLEAN | DEFAULT `false` |
| `retry_count` | INTEGER | DEFAULT `0` |
| `retry_phrase` | TEXT | nullable |
| `magic_link_sent_at` | TIMESTAMPTZ | nullable |
| `magic_link_expires_at` | TIMESTAMPTZ | nullable |
| `created_at` | TIMESTAMPTZ | DEFAULT `now()` |
| `updated_at` | TIMESTAMPTZ | DEFAULT `now()` |

#### `verification_logs`

| Coluna | Tipo | Restrições |
|--------|------|------------|
| `id` | UUID | PK, default `gen_random_uuid()` |
| `verification_id` | UUID | FK → `identity_verifications(id)` ON DELETE CASCADE |
| `analise_id` | UUID | FK → `analises_credito(id)` ON DELETE CASCADE |
| `action` | TEXT | NOT NULL |
| `performed_by` | UUID | FK → `auth.users(id)`, nullable |
| `details` | JSONB | DEFAULT `'{}'` |
| `created_at` | TIMESTAMPTZ | DEFAULT `now()` |

#### Colunas adicionadas em `analises_credito`

| Coluna | Tipo | Default |
|--------|------|---------|
| `verification_required` | BOOLEAN | `false` |
| `verification_id` | UUID | nullable, FK → `identity_verifications(id)` |

---

### 26.3 Fluxo Completo

```
1. Analista abre AnaliseDetalhadaModal → aba "Verificação"
2. Clica "Enviar Link de Verificação" → Edge Function send-verification-link
3. Edge Function:
   a. Valida role (admin/gerência)
   b. Gera frase de verificação aleatória
   c. Cria/atualiza registro em identity_verifications
   d. Envia magic link via auth.signInWithOtp()
   e. Link expira em 48h
4. Cliente recebe e-mail → clica no link → VerifyIdentityPage
5. VerifyIdentityPage (wizard):
   a. Verifica expiração do link
   b. Exibe frase de verificação
   c. Grava vídeo-selfie (5-30s) lendo a frase
   d. Upload de documentos (frente + verso, máx 5MB)
   e. Revisão → envio → upload para Storage bucket
6. Analista revisa no AnaliseDetalhadaModal:
   a. Assiste vídeo (signed URL)
   b. Compara documentos
   c. Escolhe: Aprovar / Rejeitar / Nova Tentativa
7. Se aprovado → Edge Function approve-credit:
   a. Cria empréstimo
   b. Dispara Pix via Woovi/OpenPix
   c. Registra transação
```

---

### 26.4 Regras de Negócio

| Regra | Implementação |
|-------|---------------|
| Máximo 3 tentativas de vídeo | `retry_count >= 3` → auto-rejeição em `AnaliseDetalhadaModal` |
| Auto-rejeição após 3 falhas | `handleReject()` atualiza análise para `recusado` |
| Analista não pode analisar próprio pedido | Validado em `AnaliseDetalhadaModal` + `approve-credit` edge function |
| Magic link expira em 48h | Verificado em `VerifyIdentityPage` ao carregar |
| Vídeo: mínimo 5s, máximo 30s | Constantes `MIN_RECORDING_TIME` / `MAX_RECORDING_TIME` |
| Documentos: máximo 5MB | Validação de `file.size` antes do upload |
| Formatos aceitos | Vídeo: MediaRecorder (webm); Documentos: JPG, PNG, WebP |
| Auditoria completa | Toda ação registrada em `verification_logs` |

---

### 26.5 Service — `identityVerificationService.ts`

| Função | Descrição |
|--------|-----------|
| `getVerificationById(id)` | Buscar verificação por ID (com JOIN analise) |
| `getVerificationsByAnalise(analiseId)` | Verificações de uma análise |
| `getVerificationsByStatus(status)` | Filtrar por status |
| `getPendingVerifications()` | Verificações pendentes de revisão |
| `createVerification(data)` | Criar registro de verificação |
| `updateVerification(id, updates)` | Atualizar (status, URLs, etc.) |
| `getVerificationLogs(verificationId)` | Logs de auditoria |
| `createVerificationLog(log)` | Registrar ação de auditoria |
| `uploadVerificationFile(path, file)` | Upload para bucket `identity-verification` |
| `getSignedUrl(path)` | Signed URL (1h) para vídeo/documentos |

---

### 26.6 Hooks — `useIdentityVerification.ts`

| Hook | Tipo | Query Key |
|------|------|-----------|
| `useVerification(id)` | Query | `['identity-verifications', id]` |
| `useVerificationsByAnalise(analiseId)` | Query | `['identity-verifications', 'analise', analiseId]` |
| `useVerificationsByStatus(status)` | Query | `['identity-verifications', 'status', status]` |
| `usePendingVerifications()` | Query | `['identity-verifications', 'pending']` |
| `useCreateVerification()` | Mutation | Invalida `'identity-verifications'` |
| `useUpdateVerification()` | Mutation | Invalida `'identity-verifications'` |
| `useVerificationLogs(verificationId)` | Query | `['verification-logs', verificationId]` |
| `useCreateVerificationLog()` | Mutation | Invalida `'verification-logs'` |
| `useUploadVerificationFile()` | Mutation | — |

---

### 26.7 VerifyIdentityPage — Wizard Multi-Etapa

Página pública acessada via magic link (`/verify-identity?analise_id=...`). Sem sidebar, sem autenticação de sessão.

**Estados do wizard:**

| Etapa | Descrição |
|-------|-----------|
| `loading` | Carregando dados da verificação |
| `intro` | Instruções e frase de verificação |
| `video` | Gravação de vídeo-selfie com timer |
| `documents` | Upload de documentos (frente + verso) |
| `review` | Revisão final antes do envio |
| `submitted` | Confirmação de envio |
| `error` | Erro de carregamento ou permissão |
| `expired` | Magic link expirado (>48h) |

**MediaRecorder:**
- Solicita `navigator.mediaDevices.getUserMedia({ video: true, audio: true })`
- Timer visual de contagem (5s mín → 30s máx)
- Auto-stop ao atingir 30s
- Preview do vídeo antes de avançar

---

### 26.8 AnaliseDetalhadaModal — Painel do Analista

Modal rico com 3 abas substituindo os modais inline anteriores em `AnaliseCreditoPage` e `KanbanAnalisePage`.

**Aba "Dados da Análise":**
- Informações do solicitante (nome, CPF, telefone, renda, score Serasa)
- Valor solicitado, prazo, taxa de juros
- Timeline de status

**Aba "Verificação":**
- Player de vídeo com signed URL
- Documentos frente/verso lado a lado
- Frase de verificação que o cliente deveria ter lido
- Botões: ✅ Aprovar | ❌ Rejeitar | 🔄 Nova Tentativa
- Formulário de motivo de rejeição
- Formulário de nova frase (para retentativa)

**Aba "Histórico":**
- Timeline de auditoria (`verification_logs`)
- Cada entrada mostra: ação, quem realizou, quando, detalhes

---

### 26.9 Edge Functions

#### `send-verification-link`

```
POST /functions/v1/send-verification-link
Authorization: Bearer <jwt>
Body: { "analise_id": "uuid" }

Fluxo:
1. Valida JWT → extrai user
2. Verifica role (admin/gerência)
3. Busca análise + cliente
4. Verifica retry_count < 3
5. Gera frase de verificação aleatória
6. Cria/atualiza identity_verifications
7. Envia magic link via auth.signInWithOtp()
8. Registra log de auditoria
9. Retorna { success: true, verification_id }
```

#### `approve-credit`

```
POST /functions/v1/approve-credit
Authorization: Bearer <jwt>
Body: { "analise_id": "uuid", "pix_key": "chave", "pix_key_type": "cpf|email|phone|random" }

Fluxo:
1. Valida JWT → extrai user
2. Verifica role (admin/gerência)
3. Busca análise + verificação
4. Valida: verificação aprovada, não é auto-análise
5. Cria empréstimo em emprestimos
6. Chama Woovi POST /payment (não-bloqueante)
7. Registra transação em woovi_transactions
8. Atualiza análise → status 'aprovado'
9. Registra log de auditoria
10. Retorna { success: true, emprestimo_id }
```

---

## Parte II — Deploy, Integrações & Operações

---

## 27. Pré-requisitos de Deploy

- **Supabase CLI** instalado: `npm install -g supabase`
- **Login** no Supabase: `supabase login`
- **Projeto vinculado**: `supabase link --project-ref ctvihcpojodsntoelfck`
- **Node.js** ≥ 18 e **npm** ≥ 9 (para o frontend)

### Verificar conexão

```bash
supabase projects list
```

---

## 28. Deploy de Edge Functions

### Deploy de TODAS as funções de uma vez

```bash
cd /Users/macbook/Desktop/botter/FinanceDigital

# Deploy individual de cada função
supabase functions deploy efi --no-verify-jwt
supabase functions deploy webhook-efi --no-verify-jwt
supabase functions deploy woovi --no-verify-jwt
supabase functions deploy webhook-woovi --no-verify-jwt
supabase functions deploy send-whatsapp --no-verify-jwt
supabase functions deploy webhook-whatsapp --no-verify-jwt
supabase functions deploy approve-credit --no-verify-jwt
supabase functions deploy invite-user --no-verify-jwt
supabase functions deploy delete-user --no-verify-jwt
supabase functions deploy update-user-role --no-verify-jwt
supabase functions deploy manage-instance --no-verify-jwt
supabase functions deploy check-ip --no-verify-jwt
supabase functions deploy send-verification-link --no-verify-jwt
supabase functions deploy cron-notificacoes --no-verify-jwt
```

### Script rápido — deploy de todas

```bash
for fn in efi webhook-efi woovi webhook-woovi send-whatsapp webhook-whatsapp approve-credit invite-user delete-user update-user-role manage-instance check-ip send-verification-link cron-notificacoes; do
  echo ">>> Deploying $fn..."
  supabase functions deploy "$fn" --no-verify-jwt
done
```

### Verificar status das funções

```bash
supabase functions list
```

---

## 29. EFI Bank (Gerencianet) — Configuração Completa

### 29.1. Criar conta e aplicação na EFI

1. Acesse [https://app.efipay.com.br](https://app.efipay.com.br) e crie uma conta.
2. No painel, vá em **API → Aplicações → Criar Aplicação**.
3. Ative os escopos: `cob.read`, `cob.write`, `pix.read`, `pix.write`, `gn.balance.read`.
4. Anote o **Client ID** e **Client Secret**.

### 29.2. Gerar o certificado .p12

1. No painel EFI, vá em **API → Meus Certificados**.
2. Selecione a aplicação criada e gere um novo certificado.
3. Faça download do arquivo `.p12`.

### 29.3. Converter o certificado para base64

**macOS:**
```bash
base64 -i caminho/para/certificado.p12
```

**Linux:**
```bash
base64 -w 0 caminho/para/certificado.p12
```

**Windows (PowerShell):**
```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("caminho\para\certificado.p12"))
```

> Copie a string base64 inteira (sem quebras de linha).

### 29.4. Cadastrar sua Chave PIX na EFI

1. No painel EFI, vá em **Pix → Minhas Chaves**.
2. Cadastre uma chave (e-mail, CPF, CNPJ, telefone ou aleatória).
3. Copie a chave cadastrada.

### 29.5. Configurar credenciais no sistema (via UI)

1. Acesse o sistema FinanceDigital como **admin**.
2. Vá em **Configurações → Comissões**.
3. Na seção **Gateways de Pagamento**, localize **EFI Bank**.
4. Clique em **"Configurar Credenciais"**.
5. Preencha os campos:
   - **Client ID**: Cole o Client ID da aplicação EFI
   - **Client Secret**: Cole o Client Secret
   - **Chave PIX**: Cole a chave Pix cadastrada
   - **Certificado .p12 (Base64)**: Cole a string base64 do certificado
   - **Modo Sandbox**: Ative para testes, desative para produção
6. Clique em **"Salvar Credenciais"**.
7. Ative o gateway no switch **Ativo/Inativo**.

> As credenciais são salvas na tabela `gateways_pagamento.config` (coluna JSONB).  
> A Edge Function `efi` lê automaticamente deste campo. Env vars são usadas como fallback.

### 29.6. Configurar credenciais via CLI (alternativo)

Se preferir usar variáveis de ambiente (Supabase Secrets) ao invés da UI:

```bash
supabase secrets set \
  EFI_CLIENT_ID="Client_Id_xxxxxxxxxxxxxxx" \
  EFI_CLIENT_SECRET="Client_Secret_xxxxxxxxxxxxxxx" \
  EFI_PIX_KEY="sua-chave-pix@email.com" \
  EFI_CERTIFICATE="MIIE...base64...==" \
  EFI_SANDBOX="true"
```

Verificar secrets configurados:

```bash
supabase secrets list
```

> **Prioridade**: A UI (config no banco) tem prioridade sobre as env vars.  
> Se ambos estiverem configurados, os valores da UI são usados.

### 29.7. Deploy da Edge Function EFI

```bash
supabase functions deploy efi --no-verify-jwt
supabase functions deploy webhook-efi --no-verify-jwt
```

### 29.8. Configurar Webhook na EFI

1. No painel EFI, vá em **API → Webhooks**.
2. Crie um novo webhook com a URL:
   ```
   https://ctvihcpojodsntoelfck.supabase.co/functions/v1/webhook-efi
   ```
3. Tipo de evento: **Pix** (notificações de recebimento).
4. O sistema processará automaticamente os pagamentos confirmados.

> **Dica**: Na UI do FinanceDigital, clique em "Copiar URL Webhook" no card do gateway EFI.

### 29.9. Testar a integração

1. Certifique-se de que o **Modo Sandbox** está ativado.
2. No sistema, crie uma cobrança PIX via EFI (aba de pagamentos ou gestão de parcelas).
3. Verifique no painel EFI se a cobrança aparece na seção **Pix → Cobranças**.
4. Os logs podem ser vistos com:
   ```bash
   supabase functions logs efi --tail
   supabase functions logs webhook-efi --tail
   ```

### 29.10. Colocar em produção

1. No sistema, desative o **Modo Sandbox** nas credenciais do gateway.
2. Gere um novo certificado de **produção** na EFI (diferente do sandbox).
3. Atualize o certificado base64 na UI.
4. Atualize a URL do webhook na EFI para apontar para produção.
5. Teste com uma cobrança de valor pequeno (R$ 0,01).

---

## 30. Woovi (OpenPix) — Configuração

### 30.1. Variáveis de ambiente

Adicione ao `.env` do frontend:

```env
VITE_WOOVI_APP_ID=seu_app_id_woovi
```

### 30.2. Secrets do Supabase (backend)

```bash
supabase secrets set \
  WOOVI_API_KEY="sua_chave_api_woovi"
```

### 30.3. Deploy

```bash
supabase functions deploy woovi --no-verify-jwt
supabase functions deploy webhook-woovi --no-verify-jwt
```

### 30.4. Webhook Woovi

Configure na Woovi (OpenPix):
```
https://ctvihcpojodsntoelfck.supabase.co/functions/v1/webhook-woovi
```
Evento: **OPENPIX:CHARGE_COMPLETED**

---

## 31. Webhook WhatsApp (Evolution API)

### 31.1. Deploy

```bash
supabase functions deploy send-whatsapp --no-verify-jwt
supabase functions deploy webhook-whatsapp --no-verify-jwt
```

### 31.2. Configurar webhook na Evolution API

URL do webhook:
```
https://ctvihcpojodsntoelfck.supabase.co/functions/v1/webhook-whatsapp
```

A instância Evolution API está em: `finance-digital-evolution.fly.dev`

---

## 32. Migrations (Banco de Dados)

### Listar migrations pendentes

```bash
supabase db diff
```

### Aplicar migrations

```bash
supabase db push
```

### Migrations existentes (ordem)

| #   | Arquivo                              | Descrição                             |
| --- | ------------------------------------ | ------------------------------------- |
| 001 | `001_base_schema.sql`                | Schema base, tabelas fundamentais     |
| 002 | `002_fix_whatsapp_enums.sql`         | Fix enum WhatsApp                     |
| 003 | `003_fix_instance_constraints.sql`   | Fix constraints de instância          |
| 004 | `004_lid_phone_map.sql`              | Mapeamento lid → telefone             |
| 005 | `005_storage_whatsapp_media.sql`     | Storage para mídia WhatsApp           |
| 006 | `006_etiquetas_conversa_cliente.sql` | Etiquetas de conversa/cliente         |
| 007 | `007_profiles_allowed_ips.sql`       | IPs permitidos por perfil             |
| 008 | `008_woovi_integration.sql`          | Schema integração Woovi/OpenPix       |
| 009 | `009_chat_interno.sql`               | Chat interno (mensagens entre equipe) |
| 010 | `010_profiles_select_all_authenticated.sql` | RLS: profiles SELECT para autenticados |
| 011 | `011_chat_interno_audio_atencao.sql` | Audio + atenção no chat interno       |
| 012 | `012_identity_verification.sql`      | Verificação de identidade             |
| 013 | `013_fix_verif_rls_auth_users.sql`   | Fix RLS verificação + auth.users      |
| 014 | `014_anon_verification_access.sql`   | Acesso anônimo para verificação       |
| 015 | `015_verification_new_fields.sql`    | Campos adicionais de verificação      |
| 016 | `016_fix_anon_storage_update.sql`    | Fix storage update anônimo            |
| 017 | `017_storage_anon_delete_policy.sql` | Policy de delete anônimo no storage   |
| 018 | `018_fix_storage_insert_policy.sql`  | Fix policy insert no storage          |
| 019 | `019_allowed_ips_whitelist.sql`      | Tabela allowed_ips + RPC check_ip_allowed |
| 020 | `020_repair_019_whitelist.sql`       | Reparos na whitelist (INET, RPC)      |
| 021 | `021_fix_policies_functions.sql`     | Fix geral de policies e funções       |
| 022 | `022_sessoes_update_policy.sql`      | Policy update para sessões atividade  |
| 023 | `023_pix_flow_comissoes.sql`         | Fluxo PIX + comissões + gateways      |
| 024 | `024_gerencia_comissao.sql`          | Comissão de gerência (incremental)    |
| 025 | `025_approval_flow_notifications.sql`| Fluxo aprovação + parcelas + notificações |
| 026 | `026_templates_tipo_notificacao.sql` | Vincula templates a automações        |
| 027 | `027_profissao_pagamento_parcial.sql`| Profissão (clientes/verificação) + obs/conta parcelas |

> **Nota**: Se a migration 023 já foi aplicada, NÃO rode novamente.  
> Migrations 024-027 são seguras (usam `IF NOT EXISTS` e `ADD COLUMN IF NOT EXISTS`).

---

## 33. Variáveis de Ambiente

### Frontend (`.env`)

```env
VITE_SUPABASE_URL=https://ctvihcpojodsntoelfck.supabase.co
VITE_SUPABASE_ANON_KEY=sua_anon_key
VITE_WOOVI_APP_ID=seu_woovi_app_id
```

### Supabase Secrets (Edge Functions)

| Secret                     | Descrição                                      | Obrigatório |
| -------------------------- | ---------------------------------------------- | ----------- |
| `SUPABASE_URL`             | URL do projeto (auto-configurado)              | Auto        |
| `SUPABASE_SERVICE_ROLE_KEY`| Service role key (auto-configurado)             | Auto        |
| `SUPABASE_ANON_KEY`        | Anon key (auto-configurado)                    | Auto        |
| `EFI_CLIENT_ID`            | Client ID da aplicação EFI¹                    | Opcional²   |
| `EFI_CLIENT_SECRET`        | Client Secret da aplicação EFI¹                | Opcional²   |
| `EFI_PIX_KEY`              | Chave Pix cadastrada na EFI¹                   | Opcional²   |
| `EFI_CERTIFICATE`          | Certificado .p12 em base64¹                    | Opcional²   |
| `EFI_SANDBOX`              | `"true"` para sandbox¹                         | Opcional²   |
| `WOOVI_API_KEY`            | API key da Woovi (OpenPix)                     | Sim³        |
| `EVOLUTION_API_URL`        | URL da instância Evolution API                 | Sim⁴        |
| `EVOLUTION_API_KEY`        | API key da Evolution API                       | Sim⁴        |

> ¹ Credenciais EFI podem ser configuradas via UI (Comissões → Gateways → Configurar Credenciais).  
> ² Opcional se configurado via UI; as credenciais salvas na UI têm prioridade.  
> ³ Necessário se o gateway Woovi estiver ativo.  
> ⁴ Necessário para envio de mensagens WhatsApp.

### Setar secrets via CLI

```bash
supabase secrets set CHAVE="valor"
```

### Listar secrets configurados

```bash
supabase secrets list
```

---

## 34. Arquitetura de Edge Functions

### Funções disponíveis

| Função                  | Descrição                                  | JWT  |
| ----------------------- | ------------------------------------------ | ---- |
| `efi`                   | API EFI Bank: cobranças, pagamentos, saldo | Sim  |
| `webhook-efi`           | Webhook recebimento EFI Pix               | Não  |
| `woovi`                 | API Woovi: cobranças, consultas            | Sim  |
| `webhook-woovi`         | Webhook pagamento Woovi                    | Não  |
| `send-whatsapp`         | Envio de mensagens via Evolution API       | Sim  |
| `webhook-whatsapp`      | Webhook mensagens recebidas                | Não  |
| `approve-credit`        | Aprovação de crédito + geração de parcelas | Sim  |
| `invite-user`           | Convite de novos usuários (admin)          | Sim  |
| `delete-user`           | Remoção de usuários (admin)                | Sim  |
| `update-user-role`      | Atualização de role (admin)                | Sim  |
| `manage-instance`       | Gerenciamento instância WhatsApp           | Sim  |
| `check-ip`              | Validação de IP permitido                  | Sim  |
| `send-verification-link`| Envio de link para verificação de identidade| Sim  |
| `cron-notificacoes`     | Notificações automáticas diárias (parcelas)| Não  |

> `--no-verify-jwt` é usado no deploy pois a autenticação é feita internamente pelas funções.

### Fluxo de cobranças EFI

```
1a. Admin/Operador cria cobrança manual → POST /functions/v1/efi { action: "create_charge" }
    └─ Edge Function (efi):
        ├─ Valida JWT + role (admin/gerencia)
        ├─ Lê credenciais de gateways_pagamento.config (ou env vars)
        ├─ Chama API EFI: PUT /v2/cob/{txid}
        ├─ Gera QR Code: GET /v2/loc/{id}/qrcode
        └─ Salva em woovi_charges (gateway="efi")

1b. Cobrança automática cobv (com vencimento) → cron-notificacoes
    └─ Edge Function (cron-notificacoes):
        ├─ Verifica configuracoes_sistema.mensagens_automaticas_ativas
        ├─ Busca parcelas com vencimento em ±3 dias
        ├─ Autentica via mTLS direto na API EFI (não usa efi function)
        ├─ Cria cobrança cobv: PUT /v2/cobv/{txid} (multa 2%, juros 1%/mês)
        ├─ Gera QR Code: GET /v2/loc/{id}/qrcode
        ├─ Salva em woovi_charges (gateway="efi_cobv")
        ├─ Envia texto WhatsApp com pix-copia-e-cola + QR como imagem
        └─ Registra em notificacoes_log

1c. Operador gera cobv via UI → POST /functions/v1/efi { action: "create_cobv" }
    └─ Edge Function (efi):
        ├─ Valida JWT + role
        ├─ Chama API EFI: PUT /v2/cobv/{txid} (com multa, juros, validadeAposVencimento)
        ├─ Gera QR Code: GET /v2/loc/{id}/qrcode
        ├─ Salva em woovi_charges (gateway="efi_cobv")
        └─ Retorna { success: true, charge: { br_code, qr_code_image }, efi: {...} }

2. Cliente paga o Pix → EFI envia POST /functions/v1/webhook-efi
   └─ Edge Function (webhook-efi):
       ├─ Processa payload { pix: [...] }
       ├─ Busca cobrança por txid em woovi_charges
       ├─ Atualiza woovi_charges → status="COMPLETED"
       ├─ Insere woovi_transactions
       ├─ Atualiza parcela vinculada → status="paga"
       └─ Processa splits (comissões venda/cobrança/gerência)

3. Trigger DB: após parcela paga → calcula comissões automaticamente
   └─ Insere em comissoes_liquidacoes (venda, cobrança, gerência)
```

### Fluxo de desembolso PIX (approve-credit)

```
1. Analista aprova crédito → approve-credit edge function
   └─ Desembolso PIX:
       ├─ Autentica via mTLS direto na API EFI
       ├─ Envia PIX: PUT /v2/gn/pix/{idEnvio}
       │   ├─ Chave PIX do cliente (cpf/cnpj/email/telefone)
       │   ├─ Valor aprovado
       │   └─ Retorna e2eId (não endToEndId)
       ├─ Espera 5s → verifica status: GET /v2/gn/pix/enviados/id-envio/{idEnvio}
       └─ Envia WhatsApp com comprovante (e2eId, valor, data)
```

---

## 35. Fluxo de Aprovação de Crédito

### 35.1. Visão geral

O fluxo completo de aprovação gera empréstimo, parcelas, desembolsa via PIX e notifica o cliente:

```
1. Operador cria análise de crédito (AnaliseCreditoPage)
   └─ Define: valor, nº parcelas, periodicidade, dia de pagamento

2. Analista aprova (AnaliseDetalhadaModal → "Aprovar")
   └─ Chama edge function: approve-credit
       ├─ Cria empréstimo na tabela emprestimos
       ├─ Gera N parcelas com datas corretas (semanal/quinzenal/mensal)
       ├─ Calcula valor da parcela (Tabela Price com juros compostos)
       ├─ Gateway EFI: desembolsa PIX via PUT /v2/gn/pix/{idEnvio} (mTLS)
       │   ├─ Usa chave PIX do CNPJ cadastrada na tabela clientes
       │   ├─ Verifica status após 5s via GET /v2/gn/pix/enviados/id-envio/{idEnvio}
       │   └─ Mapeia campo e2eId (não endToEndId) da resposta EFI
       ├─ Gateway Woovi: cria cobrança PIX (se configurado)
       ├─ Busca template "aprovacao" do banco (com gênero Sr./Sra.)
       ├─ Envia WhatsApp de aprovação ao cliente
       │   ├─ Template usa {valorNum} (sem prefixo "R$") para evitar duplicação
       │   └─ Comprovante PIX (e2eId, idEnvio, valor, data) SEMPRE anexado
       └─ Atualiza análise para status "aprovado" com data_resultado

3. Parcelas aparecem automaticamente em:
   ├─ EmprestimosAtivosPage (lista + modal de gestão + geração PIX cobv)
   ├─ GestaoParcelasPage (operações em lote + PIX cobv + comprovantes)
   ├─ KanbanCobrancaPage (parcelas vencidas + comprovante obrigatório)
   └─ DashboardFinanceiroPage (métricas)
```

### 35.2. Variáveis de template (approve-credit)

| Variável         | Descrição                                    | Exemplo              |
| ---------------- | -------------------------------------------- | -------------------- |
| `{nome}`         | Nome do cliente                              | João Silva           |
| `{valor}`        | Valor com "R$" (formatado)                   | R$ 1.500,00          |
| `{valorNum}`     | Valor numérico sem "R$"                      | 1.500,00             |
| `{valorFmt}`     | Alias de `{valor}`                           | R$ 1.500,00          |
| `{parcelas}`     | Resumo de parcelas                           | 12x de R$ 150,00     |
| `{parcelaNum}`   | Número de parcelas (inteiro)                 | 12                   |
| `{parcelaFmt}`   | Parcela formatada com "R$"                   | R$ 150,00            |

### 35.3. Campos de análise adicionais (migration 025)

| Campo              | Tipo     | Descrição                                    |
| ------------------ | -------- | -------------------------------------------- |
| `numero_parcelas`  | INTEGER  | Quantidade de parcelas definida pelo analista |
| `periodicidade`    | TEXT     | `semanal`, `quinzenal` ou `mensal`           |
| `dia_pagamento`    | INTEGER  | Dia da semana (0-6) ou dia do mês (1-28)    |
| `data_resultado`   | DATE     | Data de aprovação ou recusa                  |

### 35.3. Geração de parcelas

- **Mensal**: Parcela no dia `dia_pagamento` de cada mês
- **Semanal**: Parcela no dia da semana `dia_pagamento` (0=domingo)
- **Quinzenal**: Parcela a cada 14 dias a partir da data base
- Valor calculado via **Tabela Price**: `PMT = PV × [i(1+i)^n] / [(1+i)^n - 1]`

### 35.4. Sincronização automática

Ao registrar pagamento de uma parcela individual:
- `parcelas.status` → `'paga'`
- `emprestimos.parcelas_pagas` → recontado automaticamente via `syncEmprestimoStatus()`
- `emprestimos.proximo_vencimento` → atualizado para próxima pendente
- Recalcula status 3-way: todas pagas → `'quitado'`, alguma vencida → `'inadimplente'`, caso contrário → `'ativo'`

---

## 36. Notificações Automatizadas (Cron)

### 36.1. Configuração do pg_cron

O cron roda diariamente às 12:00 UTC via `pg_cron` + `pg_net`:

```sql
-- Ativar extensões (via Dashboard → Database → Extensions)
-- pg_cron (schema: pg_catalog)
-- pg_net (schema: extensions)

-- Agendar execução diária
SELECT cron.schedule(
  'notificacoes-diarias',
  '0 12 * * *',
  $$
  SELECT net.http_post(
    url := 'https://ctvihcpojodsntoelfck.supabase.co/functions/v1/cron-notificacoes',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
```

### 36.2. Verificação de configuração

Antes de processar qualquer notificação, o cron consulta a tabela `configuracoes_sistema`:

```sql
SELECT valor FROM configuracoes_sistema WHERE chave = 'mensagens_automaticas_ativas';
```

Se `valor = false`, retorna imediatamente sem processar. Isso permite desabilitar todas as mensagens via a página **Configurações → Sistema**.

### 36.3. Tipos de notificação

| Tipo               | Quando                       | Descrição                          | Cria cobv EFI? |
| ------------------ | ---------------------------- | ---------------------------------- | -------------- |
| `lembrete_3dias`   | 3 dias antes do vencimento   | Lembrete amigável + PIX            | ✅ Sim         |
| `lembrete_vespera` | 1 dia antes do vencimento    | Alerta de véspera + PIX            | ✅ Sim         |
| `vencida_ontem`    | 1 dia após o vencimento      | Cobrança de parcela vencida + PIX  | ✅ Sim         |
| `vencida_3dias`    | 3 dias de atraso             | Cobrança com dados do empréstimo   | ✅ Sim         |
| `vencida_7dias`    | 7+ dias de atraso            | Cobrança intensificada             | Reutiliza      |
| `aprovacao`        | Ao aprovar crédito           | Mensagem de boas-vindas            | —              |

> Cobranças cobv criadas automaticamente são salvas em `woovi_charges`. Notificações subsequentes (7+ dias) reutilizam a cobrança existente via `woovi_charge_id`.

### 36.4. Integração EFI cobv (mTLS direto)

O cron autentica diretamente na API EFI via mTLS (não usa a edge function `efi`):

```
1. Lê credenciais de gateways_pagamento (config JSONB)
2. Decodifica certificado .p12 base64 → PEM (cert + key)
3. Cria httpClient com mTLS: Deno.createHttpClient({ cert, key })
4. Obtém token OAuth2: POST https://pix.api.efipay.com.br/oauth/token
5. Para cada parcela elegível:
   ├─ Verifica se já existe cobrança (busca em woovi_charges por parcela_id)
   ├─ Se não existe: PUT /v2/cobv/{txid} (cria cobrança com vencimento)
   │   ├─ multa: { modalidade: 2, valorPerc: "2.00" }
   │   ├─ juros: { modalidade: 2, valorPerc: "1.00" }
   │   └─ validadeAposVencimento: 30
   ├─ Gera QR Code: GET /v2/loc/{id}/qrcode
   │   └─ Retorna: { imagemQrcode: "data:image/png;base64,...", qrcode: "0002..." }
   └─ Salva em woovi_charges (br_code, qr_code_image, gateway="efi_cobv")
```

### 36.5. Envio de mensagens WhatsApp

As mensagens são enviadas em duas partes:

1. **Texto** — Template personalizado com variáveis + pix-copia-e-cola em texto
2. **Imagem** — QR Code via `sendMedia` (Evolution API) com `tipo: 'image'` + `media_base64`

```
Envio texto: POST {evolution_url}/message/sendText/{instance}
Envio QR:   POST {evolution_url}/message/sendMedia/{instance}
  body: { number, media: base64_qrcode, mediatype: "image", caption: "QR Code PIX" }
```

### 36.6. Anti-duplicação

A tabela `notificacoes_log` registra cada envio. Antes de enviar, o cron verifica se já existe registro `(parcela_id, tipo)` com status `'enviado'` no dia atual.

### 36.7. Instância WhatsApp do sistema

A detecção de instância WhatsApp segue esta ordem:

1. Busca **todas** as instâncias de `whatsapp_instancias`
2. Prioriza instância com `is_system = true` e status conectado
3. Fallback: qualquer instância com status conectado
4. Comparação de status **case-insensitive**: aceita `connected`, `Connected`, `open`, `Open`, `conectado`, `conectada`

```sql
-- Marcar instância como sistema
UPDATE whatsapp_instancias SET is_system = true WHERE instance_name = 'sua-instancia';
```

> Apenas uma instância pode ser `is_system = true` (unique partial index).

### 36.8. Personalização por gênero

As mensagens automáticas usam o campo `clientes.sexo` para selecionar a versão correta do template:
- `sexo = 'masculino'` → usa `mensagem_masculino` (Sr.)
- `sexo = 'feminino'` → usa `mensagem_feminino` (Sra.)

---

## 37. Templates de Mensagens

### 37.1. Visão geral

Templates editáveis via UI em **Chat → Templates**. Cada template possui:
- Versão masculina e feminina (Sr. / Sra.)
- Variáveis dinâmicas: `{nome}`, `{valor}`, `{data}`, `{numeroParcela}`, `{diasAtraso}`, `{desconto}`, `{pixCopiaCola}`
- Categoria: `cobranca`, `boas_vindas`, `lembrete`, `negociacao`
- Vínculo opcional com automação (`tipo_notificacao`)

### 37.2. Vincular template a automação

Na UI de edição do template, selecione o campo **"Notificação Automática"**:

| Opção                          | Efeito                                                    |
| ------------------------------ | --------------------------------------------------------- |
| Nenhum (manual)                | Template só é usado manualmente                           |
| Lembrete — 3 dias antes        | Substitui mensagem hardcoded do cron (3 dias)             |
| Lembrete — véspera             | Substitui mensagem hardcoded do cron (amanhã)             |
| Parcela vencida ontem          | Substitui mensagem hardcoded do cron (vencida)            |
| Cobrança — 3 dias de atraso    | Ativa notificação automática após 3 dias de atraso        |
| Cobrança — 7 dias de atraso    | Ativa notificação automática após 7 dias de atraso        |
| Cobrança — 15 dias de atraso   | Ativa notificação automática após 15 dias de atraso       |
| Cobrança — 30 dias de atraso   | Ativa notificação automática após 30 dias de atraso       |
| Aprovação de crédito           | Substitui mensagem hardcoded do approve-credit            |

> **Restrição**: Apenas 1 template ativo por tipo de automação (unique index).

### 37.3. Variáveis disponíveis por contexto

| Variável          | Cron (lembretes) | Cron (atraso) | Aprovação | Descrição                    |
| ----------------- | ---------------- | ------------- | --------- | ---------------------------- |
| `{nome}`          | ✅               | ✅            | ✅        | Nome do cliente              |
| `{valor}`         | ✅               | ✅            | ✅        | Valor monetário (R$)         |
| `{valorNum}`      | —                | —             | ✅        | Valor numérico sem "R$"      |
| `{valorFmt}`      | —                | —             | ✅        | Alias de `{valor}`           |
| `{data}`          | ✅               | ✅            | ✅        | Data de vencimento           |
| `{numeroParcela}` | ✅               | ✅            | —         | Número da parcela            |
| `{totalParcelas}` | —                | ✅            | ✅        | Total de parcelas            |
| `{parcelasPagas}` | —                | ✅            | —         | Parcelas já pagas            |
| `{parcelaNum}`    | —                | —             | ✅        | Nº de parcelas (inteiro)     |
| `{parcelaFmt}`    | —                | —             | ✅        | Parcela formatada com "R$"   |
| `{diasAtraso}`    | —                | ✅            | —         | Dias em atraso               |
| `{parcelas}`      | —                | —             | ✅        | Resumo (ex: 12x de R$)      |
| `{pixCopiaCola}`  | ✅               | ✅            | —         | Código Pix copia-e-cola      |
| `{vencimento}`    | ✅               | ✅            | —         | Data de vencimento (DD/MM)   |
| `{parcela}`       | ✅               | ✅            | —         | "X/Y" (ex: 3/12)            |
| `{total}`         | ✅               | ✅            | —         | Total de parcelas (inteiro)  |
| `{desconto}`      | —                | —             | —         | Percentual de desconto¹      |

> ¹ Disponível para templates manuais (negociação/cobrança avançada).  
> A coluna **Cron (atraso)** se aplica aos tiers `vencida_3dias`, `vencida_7dias`.  
> **Importante**: templates de aprovação devem usar `{valorNum}` (não `{valor}`) para evitar duplicação "R$ R$ X,XX" quando o template já contém "R$".

### 37.4. Tabela templates_whatsapp (migration 026)

```sql
templates_whatsapp
├── id                  UUID PK
├── nome                TEXT NOT NULL
├── categoria           template_categoria (enum)
├── mensagem_masculino  TEXT NOT NULL
├── mensagem_feminino   TEXT NOT NULL
├── variaveis           TEXT[] DEFAULT '{}'
├── ativo               BOOLEAN DEFAULT true
├── tipo_notificacao    TEXT (nullable, unique quando ativo)
├── created_at          TIMESTAMPTZ
└── updated_at          TIMESTAMPTZ
```

---

## 38. IP Whitelist & Segurança

### 38.1. Visão geral

O sistema possui **dois níveis** de restrição de IP, que funcionam em camadas:

| Nível | Onde | Efeito |
|-------|------|--------|
| **Global** | Tabela `allowed_ips` | Se houver IPs ativos, **todos os usuários** devem vir de um IP da lista |
| **Por usuário** | Coluna `profiles.allowed_ips` | Se o array não for NULL/vazio, **aquele usuário** só acessa dos IPs listados |

> Ambos os níveis são verificados em sequência. Se o nível global bloquear, o nível por usuário nem é consultado.

### 38.2. Quando a verificação acontece

| Momento | Descrição |
|---------|-----------|
| **Login** | IP verificado ao autenticar com email/senha |
| **Restauração de sessão** | IP verificado ao reabrir o navegador / recarregar a página |
| **A cada 5 minutos** | Re-verificação periódica durante uso ativo da aplicação |
| **Startup do Electron** | Verificação no início da aplicação desktop |

Se o IP for bloqueado em qualquer momento, o usuário é deslogado e redirecionado ao login com a mensagem de erro.

### 38.3. Tabela allowed_ips (whitelist global)

```sql
allowed_ips
├── id          UUID PK
├── ip_address  INET NOT NULL          -- Ex: '138.118.29.138'
├── label       TEXT                    -- Descrição (ex: "Escritório SP")
├── added_by    UUID → profiles(id)    -- Quem adicionou
├── active      BOOLEAN DEFAULT TRUE
├── created_at  TIMESTAMPTZ
└── updated_at  TIMESTAMPTZ
```

**RPC de validação** (`check_ip_allowed`):
```sql
SELECT check_ip_allowed('138.118.29.138'::inet);  -- true ou false
```

### 38.4. Coluna profiles.allowed_ips (per-user)

```sql
profiles.allowed_ips  TEXT[]  DEFAULT NULL
-- NULL = sem restrição individual
-- Ex: ARRAY['138.118.29.138', '200.100.50.25']
```

Configurável pelo admin em **Configurações → Minha Conta** ou diretamente na tabela `profiles`.

### 38.5. Cenários de uso

| Global table | Profile column | Resultado |
|---|---|---|
| Vazia | NULL | Qualquer IP acessa |
| Vazia | `{1.2.3.4}` | Aquele usuário só do IP 1.2.3.4 |
| Has `5.6.7.8` | NULL | Todos devem usar 5.6.7.8 |
| Has `5.6.7.8` | `{1.2.3.4}` | Bloqueado — passa global mas falha no perfil |

### 38.6. UI de gerenciamento

- **Configurações → IP Whitelist** (`/configuracoes/ip-whitelist`): Gerencia a tabela global `allowed_ips`
- **Configurações → Minha Conta** (`/configuracoes/conta`): Configura `profiles.allowed_ips` individual
- **Token de Emergência** (`/emergency`): Permite registrar IP via token (caso se bloqueie acidentalmente)

### 38.7. Edge Function check-ip

A função `check-ip` pode ser chamada diretamente para validação:

```bash
# Verificar se o IP do chamador é permitido
curl -X POST "https://ctvihcpojodsntoelfck.supabase.co/functions/v1/check-ip" \
  -H "Authorization: Bearer ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'

# Verificar um IP específico
curl -X POST "https://ctvihcpojodsntoelfck.supabase.co/functions/v1/check-ip" \
  -H "Authorization: Bearer ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"ip": "138.118.29.138"}'

# Resgatar token de emergência
curl -X POST "https://ctvihcpojodsntoelfck.supabase.co/functions/v1/check-ip/redeem" \
  -H "Authorization: Bearer ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"token": "abc123", "label": "Notebook Admin"}'
```

### 38.8. Middleware (Vercel)

O middleware (`middleware.ts`) protege apenas as rotas `/download` com verificação de IP, exibindo 404 para IPs não autorizados. Rotas da aplicação são protegidas pelo AuthContext.

---

## 39. Pagamentos Pix (Woovi)

### 39.1. Visão geral

A página **Pagamentos → Pagamentos Pix** (`/pagamentos`) centraliza toda a gestão de pagamentos via Woovi (OpenPix):

- **Saldo da conta** com atualização em tempo real
- **Cobranças PIX** — criação, consulta, status (pendente/completa/expirada)
- **Transações** — histórico completo com filtros
- **Subcontas** — gestão de subcontas Woovi

### 39.2. Fluxo de cobrança

```
1. Operador cria cobrança → POST /functions/v1/woovi { action: "create_charge" }
2. QR Code gerado → exibido ao cliente
3. Cliente paga → Woovi notifica webhook → POST /functions/v1/webhook-woovi
4. Webhook processa → atualiza status da cobrança e parcela vinculada
5. Comissões calculadas automaticamente via trigger
```

### 39.3. Tabelas envolvidas

- `woovi_charges` — Cobranças (correlationID, valor, status, QR code)
- `woovi_transactions` — Transações confirmadas
- `woovi_subaccounts` — Subcontas
- `gateways_pagamento` — Configurações do gateway (config JSONB)

---

## 40. Gestão de Parcelas

### 40.1. Visão geral

A página **Clientes → Gestão de Parcelas** (`/clientes/parcelas`) exibe parcelas agrupadas por **Cliente → Empréstimo → Parcelas**, com:

- **Hierarquia accordion** — expande/colapsa por cliente e empréstimo
- **Filtros duplos** — por status do empréstimo (ativo/quitado/inadimplente) e status da parcela (pendente/paga/vencida)
- **Barra de progresso** por empréstimo — mostra parcelas pagas vs total
- **Seleção em lote** com operações batch:
  - Quitar parcelas selecionadas
  - Editar série (data/valor)
  - Excluir parcelas (apenas admin)

### 40.2. Ações por parcela

Cada parcela pendente/vencida possui 3 botões de ação:

| Botão                | Cor    | Função                                                           |
| -------------------- | ------ | ---------------------------------------------------------------- |
| QrCode               | Roxo   | Gera cobrança cobv EFI + envia QR e PIX copia-e-cola via WhatsApp |
| CheckCircle (Pagar)  | Verde  | Abre modal de confirmação de pagamento manual com upload de comprovante |
| Pencil (Editar)      | Azul   | Edita juros/multa inline                                         |

Para parcelas já pagas:
| Botão    | Cor  | Função                               |
| -------- | ---- | ------------------------------------ |
| Image    | Azul | Visualiza comprovante de pagamento   |

### 40.3. Geração de PIX cobv (EmprestimosAtivosPage + GestaoParcelasPage)

Ao clicar no botão QR Code de uma parcela:

```
1. Chama edge function efi: { action: "create_cobv", ... }
   ├─ txid: gerado automaticamente
   ├─ valor: parcela.valor (corrigido com juros/multa)
   ├─ cpf/nome: do cliente
   ├─ dataVencimento: da parcela
   └─ multa 2%, juros 1%/mês, validadeAposVencimento 30

2. Retorna: { success: true, charge: { br_code, qr_code_image }, efi: {...} }

3. Mostra dialog com:
   ├─ QR Code como <img> (base64 de qr_code_image)
   ├─ Campo de texto com PIX copia-e-cola (br_code) + botão "Copiar"
   └─ Input readOnly com seleção completa ao clicar

4. Envia via WhatsApp (se instância conectada):
   ├─ Mensagem texto: "PIX gerado para parcela X/Y..."
   └─ Mensagem imagem: QR Code via sendMedia (base64)
```

### 40.4. Comprovantes de pagamento

O sistema exige upload de comprovante para confirmações manuais de pagamento:

1. **Upload**: Operador seleciona imagem na modal "Confirmar Pagamento"
2. **Storage**: Imagem salva no bucket `comprovantes` do Supabase Storage
3. **Vinculação**: URL pública salva em `parcelas.comprovante_url`
4. **Metadados**: `pagamento_tipo: 'manual'`, `confirmado_por` (UUID do operador), `confirmado_em` (timestamp)
5. **Visualização**: Botão Image (azul) em parcelas pagas → modal com imagem + link "Abrir em nova aba"

> Comprovantes são visíveis para roles `admin` e `gerencia`.

### 40.5. Sincronização de status

Ao registrar pagamento de uma parcela, o sistema automaticamente:

1. Marca `parcelas.status` → `'paga'`
2. Reconta `emprestimos.parcelas_pagas` (query real, não incremento)
3. Atualiza `emprestimos.proximo_vencimento` → próxima parcela pendente
4. Recalcula `emprestimos.status` com lógica 3-way:
   - Todas pagas → `'quitado'`
   - Alguma vencida → `'inadimplente'`
   - Caso contrário → `'ativo'`

> A função `syncEmprestimoStatus()` garante consistência mesmo após operações em lote. Operações batch são executadas **sequencialmente** (não em paralelo) para evitar race conditions no contador.

### 40.6. SQL para recontabilizar dados legados

Se houver empréstimos com `parcelas_pagas` incorreto:

```sql
WITH stats AS (
  SELECT emprestimo_id,
         COUNT(*) FILTER (WHERE status = 'paga') AS pagas,
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE status = 'vencida') AS vencidas,
         MIN(data_vencimento) FILTER (WHERE status IN ('pendente','vencida')) AS prox_venc
  FROM parcelas GROUP BY emprestimo_id
)
UPDATE emprestimos e SET
  parcelas_pagas = s.pagas,
  proximo_vencimento = COALESCE(s.prox_venc, e.proximo_vencimento),
  status = CASE
    WHEN s.pagas >= s.total THEN 'quitado'
    WHEN s.vencidas > 0 THEN 'inadimplente'
    ELSE 'ativo'
  END
FROM stats s WHERE e.id = s.emprestimo_id;
```

---

## 41. Arquitetura Frontend

### 41.1. Stack

- **React 18.3** + **React Router 7.13** (SPA)
- **Tailwind CSS 4.1** + **Radix UI** + **Material-UI 7.3** 
- **React Query 5.90** (cache + sync)
- **Vite 6.3** (build)
- **Supabase JS 2.97** (auth + realtime + storage)

### 41.2. Estrutura de diretórios

```
src/app/
├── components/     → UI reutilizável (MainLayout, charts, figma, ui/)
├── contexts/       → AuthContext, ThemeContext
├── hooks/          → 23 custom hooks (useClientes, useEmprestimos, etc.)
├── lib/            → supabase.ts, adapters, types
├── pages/          → 40 páginas
└── services/       → 19 serviços de negócio
```

### 41.3. RBAC (Role-Based Access Control)

4 roles: `admin`, `gerencia`, `cobranca`, `comercial`

Cada item do sidebar é filtrado pela role do usuário logado. Páginas inacessíveis não aparecem na navegação.

### 41.4. Rotas principais

| Seção | Rotas | Roles |
|-------|-------|-------|
| **Dashboard** | `/dashboard`, `/dashboard/financeiro`, `/dashboard/cobranca`, `/dashboard/comercial` | admin, gerencia |
| **Clientes** | `/clientes`, `/clientes/analise`, `/clientes/emprestimos`, `/clientes/parcelas`, `/clientes/historico` | admin, gerencia, comercial |
| **Pagamentos** | `/pagamentos` | admin, gerencia |
| **Rede** | `/rede`, `/rede/bonus`, `/rede/bloqueados`, `/rede/indicar` | admin, gerencia, comercial |
| **Comunicação** | `/whatsapp`, `/chat/fluxos`, `/chat/templates` | admin, gerencia, cobranca |
| **Kanban** | `/kanban/cobranca`, `/kanban/analise`, `/kanban/atendimento`, `/kanban/gerencial` | admin, gerencia, cobranca |
| **Relatórios** | `/relatorios/gerenciais`, `/relatorios/operacionais`, `/relatorios/comissoes`, `/relatorios/exportar` | admin, gerencia |
| **Configurações** | `/configuracoes/perfis`, `/configuracoes/usuarios`, `/configuracoes/integracoes`, `/configuracoes/comissoes`, `/configuracoes/ip-whitelist`, `/configuracoes/conta`, `/configuracoes/sistema` | admin |
| **Equipe** | `/equipe/monitoramento`, `/equipe/produtividade` | admin, gerencia |

### 41.5. Deploy Frontend

```bash
# Build de produção
npm run build

# Deploy via Vercel
vercel --prod
```

---

## 42. Aplicativo Desktop (Electron)

### 42.1. Visão geral

O FinanceDigital possui um aplicativo desktop via **Electron 35**, com builds para:
- **macOS** (DMG)
- **Windows** (EXE/NSIS)
- **Linux** (AppImage)

### 42.2. Funcionalidades exclusivas desktop

- **IP Guard**: Verifica IP na inicialização antes de carregar o app
- **Machine ID**: Identifica a máquina para sessões de uso
- **Auto-update**: Verificação automática de atualizações

### 42.3. Comandos

```bash
# Desenvolvimento
npm run electron:dev

# Build de produção (todas as plataformas)
npm run electron:build

# Build específico por plataforma
npx electron-builder --mac
npx electron-builder --win
npx electron-builder --linux
```

### 42.4. Download

Página de download disponível em `/download` (pública, sem autenticação).

---

## 43. Troubleshooting

### Erro: "EFI_CLIENT_ID e EFI_CLIENT_SECRET não configurados"

**Causa:** As credenciais da EFI não foram inseridas.  
**Solução:** Vá em Configurações → Comissões → Gateways → Configurar Credenciais e preencha todos os campos.

### Erro: "Gateway EFI Bank não está ativo"

**Causa:** O switch do gateway está desligado.  
**Solução:** Ative o gateway na página de Comissões → Gateways.

### Erro: "EFI Auth error: 401"

**Causa:** Client ID ou Client Secret inválidos.  
**Solução:** Verifique se as credenciais estão corretas. Para sandbox, use credenciais de sandbox.

### Erro: "Chave PIX não configurada"

**Causa:** O campo Chave PIX está vazio.  
**Solução:** Cadastre uma Chave Pix na EFI e configure no sistema.

### Ver logs das Edge Functions

```bash
# Logs em tempo real
supabase functions logs efi --tail
supabase functions logs webhook-efi --tail

# Últimos 100 logs
supabase functions logs efi --limit 100
```

### Redeploy após alteração

```bash
supabase functions deploy efi --no-verify-jwt
```

### Verificar se as funções estão no ar

```bash
supabase functions list
```

### Testar função localmente

```bash
supabase functions serve efi --no-verify-jwt
```

### WhatsApp de aprovação não foi enviado

**Possíveis causas:**
1. Nenhuma instância WhatsApp com `is_system = true` e status `conectado/conectada`.
2. Cliente sem telefone cadastrado.
3. Evolution API fora do ar (`finance-digital-evolution.fly.dev`).

**Solução:**
```sql
-- Verificar instância sistema
SELECT instance_name, status, is_system FROM whatsapp_instancias WHERE is_system = true;

-- Verificar logs de notificação
SELECT * FROM notificacoes_log ORDER BY created_at DESC LIMIT 10;
```

### Cron de notificações não enviou mensagens

**Verificar:**
```sql
-- Status do job
SELECT * FROM cron.job WHERE jobname = 'notificacoes-diarias';

-- Histórico de execuções
SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 5;

-- Logs da edge function
supabase functions logs cron-notificacoes --tail
```

### Parcelas pagas mas empréstimo mostra 0/N

**Causa:** Parcelas foram marcadas como pagas antes da correção do `registrarPagamento`.  
**Solução:** Recontabilizar manualmente (ver seção 40.3).

---

## Checklist de Deploy Completo

- [ ] Supabase CLI instalado e logado
- [ ] Projeto vinculado (`supabase link --project-ref ctvihcpojodsntoelfck`)
- [ ] Todas as migrations aplicadas (`supabase db push`) — incluindo 033 (configuracoes_sistema + comprovantes)
- [ ] Edge Functions deployadas (14 funções — script de deploy na seção 28)
- [ ] Credenciais EFI configuradas (UI ou secrets)
- [ ] Credenciais Woovi configuradas (secrets)
- [ ] Webhook EFI configurado no painel EFI
- [ ] Webhook Woovi configurado no painel Woovi
- [ ] Evolution API configurada e instância WhatsApp conectada
- [ ] Instância WhatsApp marcada como `is_system = true`
- [ ] pg_cron + pg_net ativados no Supabase Dashboard
- [ ] Job `notificacoes-diarias` agendado (`cron.schedule`)
- [ ] Templates de mensagem configurados (Chat → Templates)
- [ ] IP Whitelist configurada (se aplicável)
- [ ] Configurações do sistema habilitadas (Configurações → Sistema)
- [ ] Bucket `comprovantes` criado no Supabase Storage (público)
- [ ] Frontend buildado e deployado (`vercel --prod`)
- [ ] Teste de cobrança Pix em sandbox (cob + cobv)
- [ ] Teste de webhook recebendo pagamento
- [ ] Teste de notificação cron (verificar `notificacoes_log`)
- [ ] Teste de comprovante upload/visualização
- [ ] Troca para produção (desativar sandbox)
- [ ] Limite diário EFI adequado para volume esperado

---

## 44. Profissão + Pagamento Configurável (v8.2.0 — 26/03/2026)

### 44.1. Campo Profissão

**Cadastro de clientes** (`ClientesPage.tsx`):
- Novo campo `profissao` (texto livre) no formulário de criação e edição
- Placeholder: "Ex: Engenheiro, Médico, Autônomo..."
- Persistido na coluna `clientes.profissao` (TEXT, nullable)

**Verificação de identidade** (`VerifyIdentityPage.tsx`):
- Campo "Qual sua profissão?" adicionado ao passo `address_refs`
- Valor salvo em `identity_verifications.profissao_informada`
- Obrigatório para avançar — botão "Próximo" desabilitado se vazio

### 44.2. Auto-rejeição por divergência

No `AnaliseDetalhadaModal.tsx`, ao abrir uma análise:

1. Busca profissão do cadastro (`clientes.profissao`) e da verificação (`identity_verifications.profissao_informada`)
2. Compara com `.trim().toLowerCase()`
3. Se divergir:
   - Auto-rejeita `identity_verifications` → `status = 'rejected'`
   - Auto-rejeita `analises_credito` → `status = 'recusado'`
   - Cria log com `action = 'profession_mismatch_auto_rejected'`
   - Toast de erro para o analista
4. Visual: grid lado-a-lado mostrando "Cadastro" vs. "Verificação" com alerta vermelho

> Usa `useRef(autoRejectedRef)` para prevenir execução duplicada em re-renders.

### 44.3. Modal "Efetuar Pagamento"

Substituiu os botões inline (Quitar/Parcial) no `EmprestimoDetailModal` por um modal dedicado:

| Campo               | Completo | Parcial | Editável |
|---------------------|----------|---------|----------|
| Vencimento          | ✓        | ✓       | Não      |
| Data Pagamento      | ✓        | ✓       | Sim      |
| Dias de atraso      | ✓        | ✓       | Não (auto) |
| Valor Parcela       | ✓        | —       | Não      |
| Valor Corrigido     | ✓        | —       | Não      |
| Valor Total         | —        | ✓       | Não      |
| Valor a Pagar       | —        | ✓       | Sim      |
| Desconto (R$)       | ✓        | ✓       | Sim      |
| Total a pagar       | ✓        | —       | Não (auto) |
| Restante            | —        | ✓       | Não (auto) |
| Observação          | ✓        | ✓       | Sim      |
| Conta Bancária      | ✓        | ✓       | Sim (dropdown) |

**Lógica de pagamento completo:** chama `registrarPagamento` + persiste desconto/obs/conta via `updateParcela`.  
**Lógica de pagamento parcial:** valida valor > 0 e < total, calcula restante, atualiza `parcelas.valor` com saldo restante.

Novos campos na tabela `parcelas`: `observacao` (TEXT) e `conta_bancaria` (TEXT).

### 44.4. Segurança — IP Whitelist

- Removida exibição de IPs permitidos nas mensagens de login bloqueado
- Antes: "IPs permitidos: 201.131.x, 179.129.x, ..."
- Agora: "Contate o administrador."
- Impede reconhecimento de IPs autorizados por usuários não-autorizados

### 44.5. Migration 027

```sql
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS profissao TEXT DEFAULT NULL;
ALTER TABLE identity_verifications ADD COLUMN IF NOT EXISTS profissao_informada TEXT DEFAULT NULL;
ALTER TABLE parcelas ADD COLUMN IF NOT EXISTS observacao TEXT DEFAULT NULL,
                      ADD COLUMN IF NOT EXISTS conta_bancaria TEXT DEFAULT NULL;
```

### 44.6. Arquivos modificados

| Arquivo | Alteração |
|---------|----------|
| `supabase/migrations/027_profissao_pagamento_parcial.sql` | Nova migration |
| `src/app/lib/database.types.ts` | Tipos: profissao, profissao_informada, observacao, conta_bancaria |
| `src/app/lib/view-types.ts` | Interfaces: Cliente, IdentityVerification, Parcela |
| `src/app/lib/adapters.ts` | Mapeamentos DB→View para os novos campos |
| `src/app/pages/ClientesPage.tsx` | Campo profissão no formulário |
| `src/app/pages/VerifyIdentityPage.tsx` | Campo profissão no passo address_refs |
| `src/app/components/AnaliseDetalhadaModal.tsx` | Auto-reject + comparativo visual |
| `src/app/pages/EmprestimosAtivosPage.tsx` | Modal Efetuar Pagamento (Completo/Parcial) |
| `src/app/contexts/AuthContext.tsx` | Removida exibição de IPs permitidos |

---

## 45. Pendências + Notificações Realtime (v8.3.0 — 30/03/2026)

### 45.1. Sistema de alerta de pendências

RPCs PostgreSQL para verificar pendências de clientes:

```sql
-- Verificar pendências por CPF (via verificação de identidade)
SELECT verificar_pendencias_cliente('12345678901');

-- Verificar pendências por ID de cliente
SELECT verificar_pendencias_cliente_id('uuid-do-cliente');
```

Ambas retornam: empréstimos em atraso, parcelas vencidas e alertas visuais. São **não-bloqueantes** — apenas informativas.

### 45.2. Notificações Realtime (MainLayout)

Realtime habilitado para `analises_credito`:

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE analises_credito;
```

No `MainLayout.tsx`, para roles admin/gerência:
- **Canal Realtime**: escuta INSERT em `analises_credito`
- **Som**: toca `alarme.mp3` quando nova análise chega
- **Toast**: exibe dados da análise (cliente, valor, parcelas)
- **Modo silencioso**: toggle persistido em `localStorage` (`fd-silencioso`), usa `useRef(silenciosoRef)` para evitar stale closure no callback Realtime

### 45.3. Exclusão de parcelas por role

Botão de deletar parcela em `GestaoParcelasPage` visível apenas para role `admin`.

### 45.4. Endereço detalhado (migration 032)

Novos campos de endereço em `clientes`:

| Campo    | Tipo     | Descrição                    |
| -------- | -------- | ---------------------------- |
| `rua`    | TEXT     | Logradouro                   |
| `numero` | TEXT     | Número do imóvel             |
| `bairro` | TEXT     | Bairro                       |
| `cidade` | TEXT     | Cidade (carregada via IBGE)  |
| `estado` | CHAR(2)  | UF (seleção via dropdown)    |
| `cep`    | TEXT     | CEP com auto-formatação      |

Formulário usa API IBGE para cidades por UF: `GET https://servicodados.ibge.gov.br/api/v1/localidades/estados/{uf}/municipios`

---

## 46. Mapa Interativo + Filtro por Cidade (v8.4.0 — 30/03/2026)

### 46.1. Componente BrazilMap

O mapa SVG do Brasil (`BrazilMap.tsx`) foi reescrito com:

- **Zoom**: in/out/reset via botões + scroll do mouse
- **Pan**: arrastar com cursor grab
- **Indicador**: percentual de zoom exibido
- **Seleção de estado**: clique no estado → abre painel lateral de cidades
- **Painel de cidades**: lista com contagem de clientes, busca por texto, opção "Todas as cidades"
- **Barra de filtro**: exibe filtro ativo (ex: "SP → São Paulo") com botão Limpar

### 46.2. Dados de empréstimo ativo

`clientesService.getClientes()` faz nested select com empréstimos:

```typescript
.select('*, emprestimos(id, valor, parcelas, parcelas_pagas, proximo_vencimento, status)')
```

O adapter `dbClienteToView` enriquece `valor`, `vencimento`, `parcelasPagas`, `totalParcelas` com dados do empréstimo ativo (status `ativo` ou `inadimplente`), sobrescrevendo campos estáticos.

### 46.3. Colunas da listagem de clientes

| Coluna           | Dado                       | Sem empréstimo |
| ---------------- | -------------------------- | -------------- |
| Empréstimo       | Valor do empréstimo ativo  | —              |
| Próx. Vencimento | Data de vencimento próxima | —              |
| Parcelas         | Pagas/Total (ex: 2/6)     | —              |

---

## 47. Cobranças Automáticas EFI cobv (v8.5.0 — 31/03/2026)

### 47.1. Visão geral

O sistema cria cobranças PIX com vencimento (**cobv**) automaticamente via `cron-notificacoes`, enviando QR Code + link PIX copia-e-cola por WhatsApp.

### 47.2. API EFI — Endpoints utilizados

| Endpoint                         | Método | Função                           |
| -------------------------------- | ------ | -------------------------------- |
| `/oauth/token`                   | POST   | Autenticação OAuth2 (mTLS)       |
| `/v2/cobv/{txid}`                | PUT    | Cria cobrança com vencimento     |
| `/v2/loc/{id}/qrcode`            | GET    | Gera QR Code (base64 + brCode)   |
| `/v2/gn/pix/{idEnvio}`           | PUT    | Envia PIX (desembolso)           |
| `/v2/gn/pix/enviados/id-envio/{idEnvio}` | GET | Consulta status do envio  |
| `/v2/gn/saldo`                   | GET    | Consulta saldo da conta          |

### 47.3. Estrutura da cobrança cobv

```json
{
  "calendario": {
    "dataDeVencimento": "2026-04-15",
    "validadeAposVencimento": 30
  },
  "devedor": {
    "cpf": "12345678901",
    "nome": "João Silva"
  },
  "valor": {
    "original": "150.00",
    "multa": { "modalidade": 2, "valorPerc": "2.00" },
    "juros": { "modalidade": 2, "valorPerc": "1.00" }
  },
  "chave": "efirecebimento@outlook.com",
  "solicitacaoPagador": "Parcela 3/12 - Empréstimo"
}
```

### 47.4. Resposta do QR Code

```json
{
  "qrcode": "00020126580014br.gov.bcb.pix...",
  "imagemQrcode": "data:image/png;base64,iVBORw0KG..."
}
```

- `qrcode` → Código PIX copia-e-cola (br_code)
- `imagemQrcode` → Imagem Base64 para exibir no frontend e enviar via WhatsApp

### 47.5. Geração manual via UI

Nas páginas `EmprestimosAtivosPage` e `GestaoParcelasPage`, cada parcela pendente/vencida tem um botão de geração PIX que:

1. Chama `efi` edge function com `action: "create_cobv"`
2. Recebe `{ success: true, charge: { br_code, qr_code_image }, efi: {...} }`
3. Mostra dialog com QR Code (imagem) + campo copiável com PIX copia-e-cola
4. Envia por WhatsApp: texto com link + QR como imagem separada

### 47.6. Limites diários EFI

| Tipo de conta | Limite diário de envio PIX |
| ------------- | -------------------------- |
| Pro           | R$ 0,30/dia (padrão)      |
| Empresas      | R$ 1,00/dia (padrão)      |

> Solicitar aumento de limite via painel EFI ou contato com suporte. Cobranças (recebimento) não têm limite.

---

## 48. Comprovantes de Pagamento (v8.5.0 — 31/03/2026)

### 48.1. Visão geral

Pagamentos manuais agora **exigem** upload de comprovante (imagem) para confirmação.

### 48.2. Fluxo de upload

```
1. Operador clica "Confirmar Pagamento" em parcela pendente/vencida
2. Modal exibe:
   ├─ Valor e vencimento da parcela
   ├─ Área de drop/seleção de imagem
   └─ Preview da imagem selecionada
3. Ao confirmar:
   ├─ Upload para Supabase Storage (bucket: comprovantes)
   ├─ Gera URL pública da imagem
   ├─ Atualiza parcela:
   │   ├─ comprovante_url: URL da imagem
   │   ├─ pagamento_tipo: 'manual'
   │   ├─ confirmado_por: UUID do operador logado
   │   └─ confirmado_em: timestamp atual
   └─ Marca parcela como 'paga'
```

### 48.3. Visualização

Parcelas pagas com `comprovante_url` exibem botão Image (azul) que abre modal com:
- Imagem do comprovante em tamanho completo
- Link "Abrir em nova aba"

> Visível para roles `admin` e `gerencia`.

### 48.4. Kanban de Cobrança

No `KanbanCobrancaPage`:
- Botão "Quitar" renomeado para **"Confirmar Pag."** — exige comprovante
- Arrastar parcela para coluna "pago" abre modal de comprovante (não quita automaticamente)
- Todas as parcelas do empréstimo são marcadas como pagas com `pagamento_tipo: 'manual'`

### 48.5. Migration 033 — Campos adicionados

```sql
-- Novos campos em parcelas
ALTER TABLE parcelas ADD COLUMN comprovante_url TEXT DEFAULT NULL;
ALTER TABLE parcelas ADD COLUMN pagamento_tipo TEXT DEFAULT NULL;  -- 'pix', 'manual', 'boleto'
ALTER TABLE parcelas ADD COLUMN confirmado_por UUID REFERENCES profiles(id) DEFAULT NULL;
ALTER TABLE parcelas ADD COLUMN confirmado_em TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE parcelas ADD COLUMN woovi_charge_id TEXT DEFAULT NULL;
```

---

## 49. Configurações do Sistema (v8.5.0 — 31/03/2026)

### 49.1. Visão geral

Nova página **Configurações → Sistema** (`/configuracoes/sistema`) permite controlar comportamentos automáticos do sistema.

### 49.2. Tabela configuracoes_sistema

```sql
CREATE TABLE configuracoes_sistema (
  chave TEXT PRIMARY KEY,
  valor JSONB NOT NULL DEFAULT 'true'::jsonb,
  tipo TEXT DEFAULT 'boolean',
  descricao TEXT
);
```

### 49.3. Configurações disponíveis

| Chave                          | Tipo    | Default | Descrição                                    |
| ------------------------------ | ------- | ------- | -------------------------------------------- |
| `mensagens_automaticas_ativas` | boolean | true    | Habilita/desabilita o cron de notificações   |
| `cobv_auto_ativa`              | boolean | true    | Habilita criação automática de cobranças cobv |
| `multa_percentual`             | number  | 2.00    | Percentual de multa nas cobranças cobv       |
| `juros_percentual`             | number  | 1.00    | Percentual de juros/mês nas cobranças cobv   |

### 49.4. RLS (Row Level Security)

```sql
-- Todos autenticados podem ler
CREATE POLICY "config_select" ON configuracoes_sistema FOR SELECT TO authenticated USING (true);

-- Apenas admin/gerencia podem atualizar
CREATE POLICY "config_update" ON configuracoes_sistema FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'gerencia')));
```

### 49.5. React Query Hooks

```typescript
// Leitura
const { data: config } = useConfigSistema();
// config = { mensagens_automaticas_ativas: true, cobv_auto_ativa: true, ... }

// Atualização
const updateConfig = useUpdateConfig();
updateConfig.mutate({ chave: 'mensagens_automaticas_ativas', valor: false });
```

### 49.6. UI (ConfigSistemaPage)

A página exibe cards com toggles e inputs:
- **Mensagens automáticas**: Switch on/off → controla se o cron envia mensagens
- **Cobranças cobv automáticas**: Switch on/off → controla criação de cobranças EFI
- **Multa (%)**: Input numérico → percentual aplicado em cobranças cobv
- **Juros (%/mês)**: Input numérico → percentual de juros mensal

> Acessível apenas para roles `admin` e `gerencia`. Alterações têm efeito imediato (próxima execução do cron).
