FintechFlow - Plataforma de Gestão de Crédito

![version](https://img.shields.io/badge/version-6.0.0-blue)
![React](https://img.shields.io/badge/React-18-61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6)
![Vite](https://img.shields.io/badge/Vite-6-646CFF)
![Supabase](https://img.shields.io/badge/Supabase-Backend-3ECF8E)
![license](https://img.shields.io/badge/license-MIT-orange)

> **Última atualização**: 07/03/2026 — v6.0 (Zero Mock · Painel de Empréstimo · Bot WhatsApp)

## Sobre o Projeto

FintechFlow é uma plataforma completa para gestão de financeiras de crédito, com backend **Supabase** (PostgreSQL + Auth + Edge Functions + Realtime), integração **WhatsApp** via Evolution API, bot automático, 4 dashboards interativos, gestão de parcelas em lote, rede de indicações com mapa visual, chat em tempo real, 4 kanbans com drag-and-drop, e controle de equipe.

**Zero mock** — todas as 33 páginas operam exclusivamente com dados reais do Supabase.

## Funcionalidades Principais

### Dashboards (4)
- Visão Geral, Financeiro, Cobrança, Comercial — KPIs calculados em tempo real

### Gestão de Clientes
- Cadastro completo (nome, CPF, telefone, sexo, endereço, score, limite crédito)
- Criar/editar clientes via dialogs inline
- Análise de crédito com score Serasa
- Histórico unificado (timeline de pagamentos, empréstimos, análises, vencimentos)

### Empréstimos Ativos — Painel Completo
- Listagem com métricas, filtros e busca
- **Modal rico** com 3 tabs (Parcelas, Cliente, Empréstimo):
  - Parcelas: Quitar, Baixa parcial, Editar juros/multa manualmente, Zerar juros
  - Cliente: Card completo com scores, limites, rede de indicações, ações rápidas
  - Empréstimo: Progresso, detalhes do contrato, Quitar Tudo, Inadimplente, Reativar
- Dialog de reativação ao quitar última parcela (reativar vs. manter inativo)
- Contadores de parcelas calculados em tempo real (live query data)

### Gestão de Parcelas em Lote
- Quitar em lote com desconto opcional
- Editar série (valor/dia de vencimento)
- Excluir em lote com confirmação

### WhatsApp + Bot Inteligente
- Integração nativa via Evolution API (1 número por departamento)
- Chat em tempo real com Supabase Realtime
- Fluxos de chatbot automatizados (editor visual ReactFlow)
- **Bot automático:** cliente envia "score" ou "status" → recebe seus dados instantaneamente
- Templates com mensagens por gênero (masculino/feminino)

### Rede de Indicações
- Mapa interativo hierárquico (ReactFlow com BFS)
- Bônus e comissões por indicação
- Bloqueio solidário automático (inadimplência bloqueia rede)
- Wizard de nova indicação

### Kanban Boards (4)
- Cobrança (6 colunas), Análise (4), Atendimento (4), Gerencial (KPIs cross-board)
- Drag-and-drop nativo com mutations em tempo real

### Comunicação
- Chat interno + WhatsApp
- Templates de banco com preview por gênero
- Envio via Edge Function `send-whatsapp`

### Relatórios e Exportação
- Relatórios operacionais com gráficos (Recharts)
- Exportação CSV em todas as páginas relevantes

### Segurança e RBAC
- 4 papéis: admin, gerência, cobrança, comercial
- Sidebar filtrada por role
- Configurações protegidas por modo incógnito
- Edge Functions com `service_role` para operações admin

### Equipe
- Monitoramento de atividade em tempo real
- Produtividade com RadarChart e ranking

## Pré-requisitos

- Node.js 18+
- NPM
- Projeto Supabase configurado (**obrigatório**)

## Stack Tecnológica

| Camada | Tecnologia | Detalhes |
|---|---|---|
| Framework | React 18 | Componentes funcionais + hooks |
| Linguagem | TypeScript 5 | Tipagem estática completa |
| Build | Vite 6 | HMR + `@tailwindcss/vite` plugin |
| Estilização | Tailwind CSS v4 | Utility-first com dark mode |
| Componentes | Radix UI / shadcn/ui | 46 componentes acessíveis |
| Rotas | React Router 7 | `createBrowserRouter`, 36 rotas |
| Gráficos | Recharts | Bar, Line, Area, Pie, Radar charts |
| Fluxos visuais | ReactFlow | Editor de fluxos de chatbot + Mapa de rede |
| Ícones | Lucide React | Iconografia consistente |
| Toasts | Sonner | Notificações de feedback |
| Backend | Supabase | Auth + PostgreSQL + RLS + Edge Functions + Realtime |
| Server State | TanStack React Query | Cache, mutations, invalidação automática |
| WhatsApp | Evolution API | Integração bidirecional com bot |

## Como Começar

### 1. Clone e instale

```bash
git clone https://github.com/sua-empresa/fintechflow.git
cd fintechflow
npm install
```

### 2. Configure o Supabase

Crie um arquivo `.env` na raiz:

```bash
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

### 3. Execute o schema

```bash
# Aplicar schema e migrações
supabase db push
# Ou executar manualmente: supabase/schema.sql + migrações em supabase/migrations/
```

### 4. Deploy das Edge Functions

```bash
supabase functions deploy invite-user --no-verify-jwt
supabase functions deploy update-user-role --no-verify-jwt
supabase functions deploy delete-user --no-verify-jwt
supabase functions deploy send-whatsapp --no-verify-jwt
supabase functions deploy webhook-whatsapp --no-verify-jwt
supabase functions deploy manage-instance --no-verify-jwt
```

> **IMPORTANTE:** Sempre usar `--no-verify-jwt` — o gateway Supabase valida HS256 mas o Auth gera ES256.

### 5. Configure os Secrets

```bash
supabase secrets set EVOLUTION_API_URL=https://sua-evolution.fly.dev
```

### 6. Criar admin inicial

```bash
# 1. Crie um usuário no Supabase Dashboard → Authentication → Users
# 2. Execute:
UPDATE profiles SET role = 'admin' WHERE id = '<USER_ID>';
# 3. A partir daí, crie novos usuários pela plataforma
```

### 7. Rode o projeto

```bash
npm run dev
# Acesse http://localhost:5173
```

### 8. Build de produção

```bash
npm run build
```

## Estrutura de Diretórios

```
src/
├── main.tsx                    # Entry point
├── styles/                     # CSS (fonts, theme, tailwind)
└── app/
    ├── App.tsx                 # Root component
    ├── routes.tsx              # 36 rotas
    ├── components/
    │   ├── MainLayout.tsx      # Sidebar (8 seções RBAC) + Header
    │   ├── ProtectedRoute.tsx  # Auth guard
    │   └── ui/                 # 46 shadcn/ui components
    ├── contexts/
    │   ├── AuthContext.tsx      # Supabase Auth (JWT)
    │   └── ThemeContext.tsx     # Dark mode
    ├── hooks/                  # 16 arquivos, ~120+ React Query hooks
    │   ├── useClientes.ts      # Clientes + Indicados
    │   ├── useEmprestimos.ts   # Empréstimos CRUD
    │   ├── useParcelas.ts      # Parcelas + pagamento + por empréstimo/cliente
    │   ├── useAnaliseCredito.ts
    │   ├── useMensagens.ts
    │   ├── useTemplates.ts
    │   ├── useFuncionarios.ts
    │   ├── useAdminUsers.ts
    │   ├── useWhatsapp.ts      # 14 hooks (instâncias, mensagens, Realtime)
    │   ├── useFluxosChatbot.ts # 15 hooks (fluxos + etapas)
    │   ├── useKanbanCobranca.ts
    │   ├── useTickets.ts
    │   ├── useRedeIndicacoes.ts
    │   ├── useEtiquetas.ts
    │   ├── useDashboardStats.ts
    │   └── useActivityTracker.ts
    ├── services/               # 13 serviços Supabase
    ├── lib/
    │   ├── view-types.ts       # Interfaces TypeScript do domínio
    │   ├── database.types.ts   # Tipos gerados do PostgreSQL
    │   ├── adapters.ts         # snake_case → camelCase
    │   └── supabase.ts         # Client Supabase
    └── pages/                  # 33 páginas funcionais
supabase/
├── config.toml
├── schema.sql                  # Schema completo
├── seed-admin.sql
├── seed-data.sql
├── functions/                  # 6 Edge Functions (Deno)
│   ├── invite-user/
│   ├── update-user-role/
│   ├── delete-user/
│   ├── send-whatsapp/
│   ├── webhook-whatsapp/       # Webhook + Bot Score/Status
│   └── manage-instance/
├── migrations/
└── snippets/
```

## Papéis de Usuário (RBAC)

| Papel | Acesso | Módulos |
|---|---|---|
| admin | Total | Todos + Configurações + Gerenciar Usuários + Equipe |
| gerencia | Alto | Dashboard, Clientes, Rede, Kanban, Relatórios, Equipe |
| cobranca | Médio | Dashboard, Clientes, Chat/WhatsApp, Kanban Cobrança |
| comercial | Médio | Dashboard, Clientes (lista), Rede, Chat, Kanban Atendimento |

## Arquitetura

### Fluxo de Dados

```
Página → useHook (React Query) → service → Supabase client
                                        ↓
                                  adapters.ts (snake_case → camelCase)
```

Cada domínio segue o padrão: `service` (queries + mutations) → `hook` (React Query wrapper com `select` para adaptação de tipos).

### Edge Functions (6)

Operações que requerem `service_role_key` (nunca exposta no client):

| Função | Descrição |
|---|---|
| `invite-user` | Cria usuário com `auth.admin.createUser()`, email auto-confirmado |
| `update-user-role` | Altera role no `profiles` + `user_metadata` |
| `delete-user` | Remove usuário com `auth.admin.deleteUser()` (CASCADE) |
| `send-whatsapp` | Envia mensagem via Evolution API |
| `webhook-whatsapp` | Recebe mensagens + bot automático score/status |
| `manage-instance` | CRUD de instâncias Evolution API |

**Segurança:**
- Role `admin` validado via tabela `profiles` (server-side)
- Admin não pode remover seu próprio papel ou conta
- `--no-verify-jwt` obrigatório (HS256 vs ES256)

### WhatsApp Bot — Comandos Automáticos

| Comando | Resposta |
|---|---|
| `score` / `meu score` | Score/1000, faixa, limite, disponível, bônus |
| `status` / `meu status` | Status do cadastro, score, limite, utilizado, dias de atraso |

O bot identifica o cliente pelo número de telefone cadastrado. Se não encontrado, responde com mensagem informativa.

## Regras de Negócio

### Rede de Indicações
- Inadimplência de membro → rede inteira bloqueada (solidário)
- Bônus por indicações que geram crédito
- Visualização hierárquica completa com ReactFlow

### Cálculo de Juros
- Juros compostos sobre atraso
- Multa de 2% + juros de mora (1% ao mês pro rata)
- Edição manual de juros/multa por parcela individual

### Operações em Lote (Parcelas)
- **Quitar em lote**: Selecionar parcelas → aplicar desconto opcional → confirmar
- **Editar série**: Alterar valor e/ou dia de vencimento para múltiplas parcelas
- **Excluir em lote**: Confirmação obrigatória com contagem

### Reativação de Cliente
- Ao quitar última parcela, dialog oferece reativação automática
- Opções: "Reativar Cliente" (status → ativo) ou "Manter Inativo"

### Mensagens por Gênero
- Campo `sexo` no cadastro (masculino/feminino)
- Templates WhatsApp com `mensagemMasculino` e `mensagemFeminino`
- Preview com toggle de gênero

### Configurações em Modo Incógnito
- Detecção automática via Storage API / FileSystem API
- Tela de bloqueio com instruções por navegador
- Zero registro no histórico do browser

## Status do Projeto (v6.0)

| Métrica | Valor |
|---|---|
| Páginas funcionais | 33 |
| Rotas configuradas | 36 |
| React Query Hooks | 16 arquivos (~120+ hooks) |
| Services Supabase | 13 |
| Edge Functions | 6 |
| Componentes UI (shadcn) | 46 |
| Módulos compilados | ~2.610 |
| Erros de build | 0 |
| Dados mock | 0 (zero) |

## Próximos Passos

### Pendente
1. Geração de **PDFs** server-side (contratos, boletos)
2. **Notificações push** (Web Push API)
3. Integração **API PIX** (QR Codes + confirmação automática)
4. Testes automatizados (Vitest + Testing Library)
5. **Envio de áudio WhatsApp** com signed URL
6. **2FA real** com Supabase MFA

## Licença

Distribuído sob licença MIT.
