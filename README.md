# FintechFlow — Documentação Técnica Completa

> **Atualizado:** 19 de março de 2026 (v7.4.0 — Verificação de Identidade para Análise de Crédito)  
> **Stack:** React 18 · TypeScript 5 · Vite 6 · Tailwind CSS v4 · Supabase · React Query (TanStack)

---

## Sumário

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

Tabs:
- **Cobranças** — lista com filtro por status (ACTIVE/COMPLETED/EXPIRED), busca, ações (ver QR Code, cancelar)
- **Transações** — recebimentos, pagamentos, splits, saques com ícones e cores diferenciadas
- **Subcontas** — subcontas de indicadores com saldo e total recebido

Modais:
- Nova Cobrança (selecionar cliente, valor, descrição)
- Nova Subconta (selecionar cliente indicador, nome, CPF, chave Pix)
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
