# Changelog — FintechFlow

Todas as alterações notáveis do projeto serão documentadas neste arquivo.

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).

---

## [6.1.0] — 2026-03-11

### Alterado — Produtividade Kanban + Auto-Ticket WhatsApp

**ProdutividadePage.tsx**
- KPIs agora contabilizam atividades reais dos Kanbans por role: cobranca → kanban_cobranca, comercial → tickets_atendimento, admin/gerencia → analises_credito
- Visão Geral: substituído LWCChart histogram por CategoryBarChart (barras agrupadas Meta × Realizado)
- Ranking: redesenhado com gradientes, ícones Top 3 (Trophy/Medal/Star), barras de progresso, badge por kanban
- Comparativo: trocado LWCChart quadrado por CategoryBarChart horizontal (Horas Hoje × Semana)
- Cores adaptadas para dark mode em todos os KPIs e ranking

**webhook-whatsapp (Edge Function)**
- Auto-criação de ticket em `tickets_atendimento` quando mensagem chega de cliente cadastrado sem ticket aberto
- Condições: mensagem de entrada + cliente vinculado + sem ticket ativo (aberto/em_atendimento/aguardando_cliente)

**WhatsAppPage.tsx**
- Botão "Abrir ticket de atendimento" no header do chat (aparece quando conversa vinculada a cliente sem ticket aberto)
- Hooks adicionados: `useCreateTicket`, `useTicketsByCliente`

---

## [6.0.0] — 2026-03-07

### Adicionado — De-Mocking Completo + Painel de Empréstimo + Bot WhatsApp

Finalização do programa de 6 blocos de de-mocking. **Zero mock** em produção. Todas as 33 páginas operam com dados reais do Supabase. Modal rico de empréstimo com gestão completa de parcelas. Bot WhatsApp responde automaticamente a consultas de Score e Status.

---

#### Bloco 1 — Dashboards e Relatórios

**DashboardPage.tsx**
- Composição de carteira computada em runtime a partir de `useClientes()` (contagem por status real)
- Evolução financeira vinculada a parcelas pagas agrupadas por mês

**DashboardFinanceiroPage.tsx**
- Receita, lucro, ROI calculados de empréstimos + parcelas reais
- Gráficos Recharts alimentados por dados de produção

**DashboardCobrancaPage.tsx**
- Taxa de inadimplência = empréstimos inadimplentes / total
- Recuperação = parcelas pagas de empréstimos inadimplentes

**DashboardComercialPage.tsx**
- Conversão = análises aprovadas / total de análises
- Ticket médio = soma de empréstimos / count

**RelatoriosPage.tsx**
- Geração real de relatórios com dados do Supabase
- Download CSV funcional

**RelatoriosOperacionaisPage.tsx**
- KPIs operacionais calculados de dados reais (parcelas, empréstimos, clientes)

**ExportarDadosPage.tsx**
- Exportação multi-formato (CSV) com dados reais de todas as entidades

---

#### Bloco 2 — Monitoramento e Configurações

**MonitoramentoAtividadePage.tsx**
- `useFuncionarios()` para dados reais; contagens online/ausente/offline
- Tracking de sessões com `useActivityTracker` hook

**ProdutividadePage.tsx**
- Métricas de produtividade por funcionário real
- RadarChart com dados computados

**PerfisAcessoPage.tsx**
- RBAC switches lidos/escritos via `useAdminUsers` + mutations

**IntegracoesPage.tsx**
- Configurações de API salvas em banco (chaves mascaradas)

**MinhaContaPage.tsx**
- Perfil editável via Supabase Auth + profiles table

**GerenciarUsuariosPage.tsx**
- CRUD completo via Edge Functions (invite-user, update-user-role, delete-user)

---

#### Bloco 3 — Kanban e Chat

**KanbanCobrancaPage.tsx**
- 6 colunas com drag-and-drop real, mutations `useMoverCardCobranca`
- Modal de registro de contato

**KanbanAnalisePage.tsx**
- 4 colunas, drag-and-drop, modal aprovar/recusar com mutation

**KanbanAtendimentoPage.tsx**
- 4 colunas com tickets reais, canal/prioridade badges

**KanbanGerencialPage.tsx**
- KPIs cross-board via RPC `get_kanban_stats()`, gráficos Recharts

**ChatPage.tsx**
- Chat real com Supabase Realtime, toggle WhatsApp/interno, templates de banco

---

#### Bloco 4 — Gestão de Parcelas e Análise de Crédito

**GestaoParcelasPage.tsx**
- Operações em lote reais: quitar, editar série, excluir
- Filtros por status, busca, seleção múltipla

**AnaliseCreditoPage.tsx**
- CRUD via `useAnalises`, aprovar/recusar com mutation, score Serasa

---

#### Bloco 5 — Clientes e Rede

**ClienteAreaPage.tsx**
- Reescrita completa: seletor de cliente, empréstimos via `useEmprestimosByCliente`, parcelas via `useParcelasByCliente`, indicados via `useIndicados`
- Botões funcionais: Chat, Copiar link, Ver rede

**ClientesPage.tsx**
- 7 botões mortos corrigidos: Novo Cliente (dialog com `useCreateCliente`), Editar (dialog com `useUpdateCliente`), Histórico (navigate), Bloquear (update status)
- Filtro de data inerte removido

**HistoricoClientesPage.tsx**
- Timeline real: pagamentos, empréstimos, análises, vencimentos
- Exportar CSV funcional
- Bug fix: `useCallback` movido acima do early return (Rules of Hooks)

**BonusComissoesPage.tsx**
- Exportar CSV funcional

**RedeIndicacoesPage.tsx**
- "Ver no Clientes" → navigate; "Enviar Mensagem" → navigate chat com telefone

---

#### Bloco 6 — Empréstimos Ativos: Painel Completo

**EmprestimosAtivosPage.tsx** — Reescrita do modal de detalhes

*Modal antigo:* Dialog básico com info simples + 3 botões (Ver Parcelas → página genérica, Quitar, Inadimplente)

*Modal novo (`EmprestimoDetailModal`):*
- **Largura:** 95vw (full width)
- **Header:** Gradiente com avatar, dados ao vivo (parcelas pagas/total computados da query, não do prop estático)
- **3 tabs:**
  1. **Parcelas** — Tabela completa das parcelas deste empréstimo (via `useParcelasByEmprestimo`):
     - Cards de resumo: Saldo devedor, Total juros, Total multa, Pagas/Total
     - Por parcela: Quitar, Baixa parcial (com desconto), Editar juros/multa manualmente (inline), Zerar juros
     - Dados atualizados ao vivo após cada ação (React Query invalidation)
  2. **Cliente** — Card completo: dados pessoais (3 colunas), financeiro (score com progress bar, limite, utilizado, disponível, bônus), rede de indicações (`useIndicados`), ações rápidas (Chat, Ligar, WhatsApp)
  3. **Empréstimo** — 4 cards de métricas, detalhes do contrato, progress bar, ações (Quitar Tudo, Inadimplente, Reativar)
- **Dialog de reativação:** Ao quitar última parcela, exibe dialog perguntando se deve reativar o cliente ou mantê-lo inativo (mal pagador)

---

#### WhatsApp Bot — Auto-resposta Score/Status

**webhook-whatsapp Edge Function**
- Detecta mensagens "score", "meu score", "status", "meu status"
- Busca cliente pelo telefone no banco (`clientes` table)
- Responde automaticamente com dados formatados:
  - **Score:** Score/1000, faixa (Excelente/Bom/Regular/Baixo), limite, disponível, bônus
  - **Status:** Status (ativo/bloqueado/inadimplente), score, limite, utilizado, dias em atraso
- Se cliente não encontrado: resposta informativa
- Processado antes dos fluxos de chatbot (prioridade)
- Log automático em `whatsapp_mensagens_log` com `metadata.auto_reply = true`

---

### Corrigido

- **EmprestimosAtivosPage:** `getStatusBadge()` crashava com status desconhecido (`configs[status]` → `undefined`). Adicionado fallback para badge cinza.
- **EmprestimosAtivosPage:** Header do modal mostrava dados estáticos do prop (`emprestimo.parcelasPagas`). Agora computa de `parcelas` query ao vivo.
- **EmprestimosAtivosPage:** Width do modal não ultrapassava `sm:max-w-lg` do base DialogContent. Corrigido com `sm:max-w-[95vw]` override.
- **HistoricoClientesPage:** `useCallback` declarado após early return (`if (isLoading)`) violava Rules of Hooks. Movido acima.

---

### Métricas finais (v6.0)

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
| Dados mock restantes | 0 |

---

## [5.1.0] — 2026-03-03

### Removido — Limpeza Total de Mocks (Zero Mock em Produção)

Remoção definitiva de toda camada mock do codebase. A aplicação agora opera **exclusivamente** com dados reais do Supabase.

#### Arquivo deletado
- **`src/app/lib/mockData.ts`** (829 linhas) — removido por completo. Continha arrays de dados fictícios (`mockClientes`, `mockEmprestimos`, `mockParcelas`, `mockFuncionarios`, `mockMensagens`, `mockTemplatesWhatsApp`, `mockAnalises`, `mockMembrosRede`, `mockBloqueiosRede`, `mockEvoluacaoFinanceira`, `mockComposicaoCarteira`, `mockProdutividadePorHora`, `mockProdutividadeSemanal`, `mockUsers`) e suas interfaces TypeScript.
- **`scripts/`** — pasta de scripts temporários de limpeza removida.

#### Arquivo criado
- **`src/app/lib/view-types.ts`** — Todas as interfaces TypeScript do domínio migradas para cá (`User`, `Funcionario`, `SessaoAtividade`, `Cliente`, `Emprestimo`, `Parcela`, `Mensagem`, `TemplateWhatsApp`, `AnaliseCredito`, `MembroRede`, `BloqueioRedeView`, `RedeStats`, `TicketAtendimentoView`, `KanbanCobrancaView`, `KanbanStats`). Separação limpa entre tipos de domínio (view-types) e tipos de banco (database.types).

#### `src/app/contexts/AuthContext.tsx` — Reescrito
- Removido: flag `useSupabase`, `isMockMode`, array `mockUsers`, função `mockUserToAuthUser`, todo import de `mockData`.
- Removido: leitura/escrita de `localStorage.getItem('fintechflow_user')`.
- Adicionado: `localStorage.removeItem('fintechflow_user')` no startup para limpar sessões mock residuais.
- Adicionado: handler `TOKEN_REFRESHED` no `onAuthStateChange`.
- Adicionado: `fetchProfile` com auto-criação via `upsert` se profile não existir.
- Resultado: 212 linhas, Supabase Auth only.

#### `src/app/pages/LoginPage.tsx`
- Removida: seção "Contas de teste" com emails mock e aviso "Qualquer senha funciona no modo demo".

#### `src/app/services/whatsappService.ts`
- Removido: constante `VITE_DEV_BYPASS_KEY`, objeto `devHeaders`, header bypass no `invokeManageInstance`.
- Corrigido: extração de erro do context (`Response.json()` vs plain object).
- Corrigido: enum `'falha'` → `'erro'` (compatível com `WhatsappMsgStatus`).
- Corrigido: cast de tipo `rawData as WhatsappMensagemLog[]`.

#### `supabase/functions/manage-instance/index.ts`
- Removido: bloco de bypass (`DEV_BYPASS_KEY`, `isBypassMode`, toda lógica de bypass).
- Removido: verificação de role na tabela `profiles`.
- Resultado: auth limpo — requer apenas `Authorization: Bearer <jwt>` válido; `getUser()` determina autenticação.

#### `supabase/functions/_shared/cors.ts`
- Adicionado `x-dev-bypass-key` ao `Access-Control-Allow-Headers` (fix CORS anterior, permanece inofensivo).

#### `.env`
- Removido: `VITE_DEV_BYPASS_KEY=local-dev-bypass-2025`.
- Resultado: apenas `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.

#### Supabase Secrets
- Removido: secret `DEV_BYPASS_KEY` via `supabase secrets unset DEV_BYPASS_KEY`.

#### Services — Correção de fragmentos de código quebrado
O script de limpeza anterior havia removido blocos mock mas deixado fragmentos sintáticos inválidos (`, }));`, `; }`, `as AnaliseCredito; return mockX[idx];`). Corrigidos manualmente arquivo a arquivo:

- **`adminUsersService.ts`** — 5 fragmentos removidos de `getUsers`, `createUser`, `updateUserRole`, `deleteUser`, `updateUserName`. JSDoc atualizado (removida referência a `mockUsers`).
- **`analiseCreditoService.ts`** — Array `mockAnalises` (90 linhas) removido. 2 fragmentos em `createAnalise` e `updateAnalise` removidos. JSDoc atualizado.
- **`clientesService.ts`** — 3 fragmentos em `getClienteComIndicados`, `getIndicados`, `getClienteStats` removidos. JSDoc atualizado.
- **`emprestimosService.ts`** — 2 fragmentos em `getEmprestimos`, `getEmprestimoById` removidos. JSDoc atualizado.
- **`funcionariosService.ts`** — 1 fragmento em `getFuncionarioStats` removido. 3 guards `if (!isSupabaseConfigured()) return;` removidos.
- **`mensagensService.ts`** — 3 fragmentos em `getUltimasMensagens`, `enviarMensagem`, `subscribeToMensagens` removidos. 1 guard `if (!isSupabaseConfigured()) return;` removido.
- **`parcelasService.ts`** — 2 fragmentos em `getParcelas`, `getParcelasByCliente` removidos. JSDoc atualizado.
- **`templatesService.ts`** — Função `adaptMockTemplate` removida (dead code).

#### `src/app/lib/supabase.ts`
- Removida: função `isSupabaseConfigured()` (agora sem uso).

#### `src/app/lib/adapters.ts`
- Import migrado: `from './mockData'` → `from './view-types'`.
- JSDoc atualizado: referências a `mockData` → `view-types`.

#### Pages — 9 arquivos com `import type` migrado de `mockData` → `view-types`
- `AnaliseCreditoPage.tsx`, `KanbanCobrancaPage.tsx`, `TemplatesMensagensPage.tsx`, `KanbanAtendimentoPage.tsx`, `GruposBloqueadosPage.tsx`, `KanbanAnalisePage.tsx`, `ClientesPage.tsx`, `RedeIndicacoesPage.tsx`, `EmprestimosAtivosPage.tsx`.

#### Pages — 3 arquivos com dados runtime substituídos

**`DashboardPage.tsx`**
- Removido: `import { mockEvoluacaoFinanceira, mockComposicaoCarteira }`.
- Adicionado: `evoluacaoFinanceira` — array tipado vazio (pendente query de agregação real).
- Adicionado: `composicaoCarteira` — computado em runtime a partir dos dados reais de `useClientes()` (conta `em_dia`, `a_vencer`, `vencido` e calcula porcentagens reais).

**`MonitoramentoAtividadePage.tsx`**
- Removido: `import { mockFuncionarios }`.
- Adicionado: `const { data: funcionarios = [] } = useFuncionarios()` — dados reais via hook.
- Contagens `onlineCount`, `ausenteCount`, `offlineCount` calculadas dos dados reais.

**`ProdutividadePage.tsx`**
- Removido: `import { mockFuncionarios, mockProdutividadePorHora, mockProdutividadeSemanal }`.
- Adicionado: `produtividadePorHora` e `produtividadeSemanal` como arrays tipados vazios com comentário `// TODO: replace with real Supabase aggregation query`.

### Pendente / Problema Aberto

- **401 em `manage-instance`**: A Edge Function retorna 401 mesmo com usuário autenticado via Supabase Auth. O JWT é enviado automaticamente pelo SDK (`supabase.functions.invoke`). Causa provável: JWT não está sendo persistido/repassado corretamente pelo cliente Supabase no contexto do browser após login. Investigar `supabase.auth.getSession()` antes de invocar a função e passar o token explicitamente via `headers: { Authorization: \`Bearer ${session.access_token}\` }`.

---

## [5.0.0] — 2026-03-04

### Adicionado — WhatsApp Bot (Edge Functions + Evolution API)

Integração completa de WhatsApp via Supabase Edge Functions e Evolution API. Escopo: Schema → Edge Functions → Services → Hooks → Páginas reescritas.

#### Schema — Migração `005_whatsapp_fluxos.sql`
- 4 novos enums: `whatsapp_instance_status`, `fluxo_status`, `fluxo_etapa_tipo`, `whatsapp_msg_status`
- Tabela `whatsapp_instancias` — instâncias da Evolution API (1 por departamento)
- Tabela `fluxos_chatbot` — fluxos de automação com gatilho por palavra-chave/cron/evento
- Tabela `fluxos_chatbot_etapas` — etapas ordenadas (mensagem, condição, ação, espera, finalizar)
- Tabela `whatsapp_mensagens_log` — log bidirecional de mensagens (entrada/saída)
- RLS, índices e triggers `updated_at` para todas as novas tabelas

#### Edge Functions (3 novas, deployadas)
- **`send-whatsapp`** — Envia mensagens (texto/imagem/documento/áudio) via Evolution API. Valida auth, busca instância, formata número, loga em `whatsapp_mensagens_log`.
- **`webhook-whatsapp`** — Recebe webhooks da Evolution API (sem JWT). Trata: `messages.upsert` (salva + dispara chatbot), `messages.update` (status delivery/leitura), `qrcode.updated`, `connection.update`. Auto-resposta por fluxo ativo.
- **`manage-instance`** — 7 ações: create, connect, disconnect, status, delete, restart, set_webhook. Requer role admin/gerência. Configura webhook automaticamente ao criar.

#### Types (`database.types.ts`)
- Tipo `Json` adicionado para campos JSONB
- Aliases: `WhatsappInstanceStatus`, `FluxoStatus`, `FluxoEtapaTipo`, `WhatsappMsgStatus`
- Row/Insert/Update para 4 novas tabelas
- `Relationships: []` nas novas tabelas (compatibilidade com postgrest-js v2.97)
- Tipo JOIN: `FluxoChatbotComEtapas`

#### Services (2 novos)
- **`whatsappService.ts`** (~290 linhas) — Instâncias (CRUD via Edge Function), envio de mensagens, queries de log, Realtime subscriptions
- **`fluxosChatbotService.ts`** (~260 linhas) — Fluxos CRUD, etapas CRUD, duplicação de fluxo com etapas, reordenação de etapas

#### Hooks (2 novos)
- **`useWhatsapp.ts`** (~200 linhas) — 14 hooks: instâncias com Realtime, envio, mensagens com Realtime, conversas, estatísticas
- **`useFluxosChatbot.ts`** (~200 linhas) — 15 hooks: fluxos CRUD, toggle status, duplicar, etapas CRUD, reordenar

#### Páginas reescritas (3) — sem mocks
- **`WhatsAppPage.tsx`** — Gestão de instâncias (criar/conectar/QR Code), chat real com Realtime, envio via Edge Function, stats
- **`FluxosChatPage.tsx`** — Métricas reais, criar/editar fluxos, gestão de etapas, toggle, duplicar, deletar
- **`ChatPage.tsx`** — Toggle WhatsApp/interno, conversas reais, templates de banco, envio via Edge Function ou interno

---

## [4.0.0] — 2026-03-03

### Adicionado — Kanban com Dados Reais (sem mocks)

Todas as 4 páginas Kanban foram reescritas para operar com dados reais do Supabase, drag-and-drop nativo e monitoramento de desempenho por funcionário.

#### Schema (`supabase/schema.sql`)
- 4 novos enums: `ticket_status`, `ticket_canal`, `ticket_prioridade`, `kanban_cobranca_etapa`
- Tabela `tickets_atendimento` com RLS, indexes e FK para clientes/funcionarios
- Tabela `kanban_cobranca` com RLS, indexes e FK para clientes/funcionarios/parcelas
- RPC `get_kanban_stats()` — KPIs agregados cross-board

#### Types (`database.types.ts`)
- Aliases: `TicketStatus`, `TicketCanal`, `TicketPrioridade`, `KanbanCobrancaEtapa`
- Row/Insert/Update types para ambas as tabelas
- Tipos JOIN compostos: `TicketComCliente`, `KanbanCobrancaComCliente`

#### Services (novos)
- `ticketsService.ts` — CRUD completo + `moverTicket()` + `atribuirTicket()`
- `kanbanCobrancaService.ts` — CRUD + `moverCard()` + `registrarContato()` + `getKanbanStats()`

#### Hooks (novos)
- `useTickets.ts` — 10 hooks (useTickets, useMoverTicket, useAtribuirTicket, etc.)
- `useKanbanCobranca.ts` — 11 hooks (useCardsCobranca, useMoverCardCobranca, useRegistrarContato, etc.)

#### Páginas reescritas
- **KanbanCobrancaPage** — 6 colunas (a_vencer→pago), drag-and-drop, modal de contato, stats
- **KanbanAnalisePage** — 4 colunas (pendente→recusado), drag-and-drop, modal com aprovar/recusar, KPIs
- **KanbanAtendimentoPage** — 4 colunas (aberto→resolvido), canal/prioridade badges, tempo desde abertura
- **KanbanGerencialPage** — KPIs cross-board, gráficos Recharts, tabela de desempenho por funcionário, gargalos

#### Adapters
- `dbTicketToView()` — snake→camelCase para tickets
- `dbKanbanCobrancaToView()` — snake→camelCase para cards de cobrança

### Documentado
- Arquitetura Kanban completa no `DOCUMENTACAO.md`
- Arquitetura WhatsApp / Evolution API (1 número por departamento)
- Diagramas de fluxo, tabelas de referência, próximos passos

---

## [3.1.0] — 2026-03-02

### Corrigido — Dark Mode Completo (Rede de Indicações)

Todas as 4 páginas da seção Rede de Indicações foram refatoradas para visibilidade plena em ambos os temas (claro e escuro).

#### `RedeIndicacoesPage.tsx`
- **ReactFlow nodes** agora usam mapas de cores duais (`STATUS_COLORS_LIGHT` / `STATUS_COLORS_DARK`) com `useTheme()` em runtime
- **Edges** com cores tema-aware (`EDGE_COLORS_LIGHT` / `EDGE_COLORS_DARK`)
- **`<Background>`** cor adaptativa: `#f1f5f9` (light) → `#1e293b` (dark)
- **`<MiniMap>`** maskColor e nodeColor adaptados ao tema corrente
- Alert banners, sidebar stats e modal de detalhes com classes `dark:*`
- Filtros e legendas com referências corrigidas para constantes renomeadas

#### `GruposBloqueadosPage.tsx`
- 20 pontos de cor corrigidos: cards, badges, borders, backgrounds, breakdowns
- Tabs "Bloqueados" e "Em Risco" com contraste correto em ambos os temas
- Membros, status e valores agora legíveis em dark mode

#### `IndicarNovoPage.tsx`
- 8 pontos de cor corrigidos: success screen, indicador card, captação direta, search badges
- Combobox de busca com badges de status contrastantes

#### `BonusComissoesPage.tsx`
- 4 pontos de cor corrigidos: bônus total, score badges, amount text, status badges

### Documentação
- **DOCUMENTACAO.md**: Adicionadas seções 15 (Rede de Indicações — Arquitetura) e 16 (Rede de Indicações — Páginas)
- **DOCUMENTACAO.md**: Seção 14 (Tema e Dark Mode) expandida com tabela de variáveis CSS e padrões de uso
- **DOCUMENTACAO.md**: Checklist completo de deploy adicionado como seção comentada ao final
- **CHANGELOG.md**: Atualizado com versões 3.0.0 e 3.1.0

---

## [3.0.0] — 2026-03-01

### Adicionado — Rede de Indicações (Backend Real)

#### Nova camada de serviço
- **`redeIndicacoesService.ts`**: Serviço completo para rede de indicações derivada de `clientes.indicado_por` (FK recursiva). Algoritmo BFS para computar árvores hierárquicas, níveis e rede_ids. Sem dados mock.
- **`useRedeIndicacoes.ts`**: 9 hooks React Query (5 queries + 4 mutations) para membros, bloqueios, indicações e desbloqueio.

#### Novos adapters
- `dbRedeIndicacaoToView()`: Converte `RedeIndicacaoComCliente` → `MembroRede`
- `dbBloqueioRedeToView()`: Converte `BloqueioRedeComCausador` → `BloqueioRedeView`

#### Novos tipos
- `MembroRede`, `BloqueioRedeView`, `RedeStats` em `mockData.ts`
- `BloqueioRede`, `BloqueioRedeComCausador`, `BloqueioRedeInsert`, `BloqueioRedeUpdate` em `database.types.ts`
- `CriarIndicacaoPayload` em `redeIndicacoesService.ts`

#### Schema atualizado
- Tabela `bloqueios_rede` com RLS (select: autenticado, insert/update: admin/gerência)
- Índices `idx_bloqueios_rede_id`, `idx_bloqueios_ativo` (partial)

### Alterado — Páginas reescritas

- **`RedeIndicacoesPage.tsx`**: Reescrito como mapa interativo ReactFlow com nodes customizados, layout hierárquico por BFS, filtros multi-dimensionais (rede, status, nível), sidebar de estatísticas, modal de detalhes, busca com highlight
- **`BonusComissoesPage.tsx`**: Reescrito com tabela ranqueada por bônus, filtros, score badges, formatação BRL
- **`GruposBloqueadosPage.tsx`**: Reescrito com tabs (Bloqueados + Em Risco), bloquear/desbloquear via mutations, identificação automática de redes em risco, JOIN para nome do causador
- **`IndicarNovoPage.tsx`**: Reescrito como wizard 3 etapas com combobox de busca por nome/CPF (Popover + Command), validação, tela de sucesso

---

## [2.1.0] — 2026-02-23

### Adicionado — Documentação Completa

- **JSDoc em todos os 31 arquivos de página** (`src/app/pages/`): cada arquivo agora possui bloco `/** @module ... */` descrevendo propósito, rota, nível de acesso e dependências de dados mock.
- **JSDoc em `mockData.ts`**: documentação de todas as 8 interfaces (`User`, `Funcionario`, `SessaoAtividade`, `Cliente`, `Emprestimo`, `Parcela`, `Mensagem`, `TemplateWhatsApp`) e 11 arrays de dados mock com descrições de uso.
- **JSDoc nos componentes core**: `MainLayout.tsx`, `ProtectedRoute.tsx`, `StatusBadge.tsx`, `ImageWithFallback.tsx`.
- **JSDoc nos módulos de infraestrutura**: `AuthContext.tsx`, `routes.tsx`, `App.tsx`, `main.tsx`.
- **CHANGELOG.md** (este arquivo): histórico completo de versões.

---

## [2.0.0] — 2026-02-23

### Adicionado — 22 Novas Páginas (Frontend MVP Completo)

#### Dashboard (4 páginas)
- `DashboardPage.tsx` — Visão geral com KPIs, AreaChart e PieChart
- `DashboardFinanceiroPage.tsx` — Dashboard financeiro (receita, lucro, ROI)
- `DashboardCobrancaPage.tsx` — Dashboard de cobrança (inadimplência, recuperação)
- `DashboardComercialPage.tsx` — Dashboard comercial (vendas, conversão, metas)

#### Clientes (5 páginas)
- `ClientesPage.tsx` — Listagem completa com campo `sexo` para mensagens por gênero
- `AnaliseCreditoPage.tsx` — Análise de crédito com score e parecer
- `EmprestimosAtivosPage.tsx` — Empréstimos ativos com status e vencimentos
- `GestaoParcelasPage.tsx` — **Gestão de parcelas com operações em lote** (quitar, editar série, excluir)
- `HistoricoClientesPage.tsx` — Timeline de eventos do cliente

#### Rede de Indicações (4 páginas)
- `RedeIndicacoesPage.tsx` — Painel de indicações refatorado
- `BonusComissoesPage.tsx` — Bônus e comissões da rede
- `GruposBloqueadosPage.tsx` — Gestão de indicadores bloqueados
- `IndicarNovoPage.tsx` — Formulário de nova indicação

#### Comunicação (4 páginas)
- `ChatPage.tsx` — Chat em tempo real (painel lateral + mensagens)
- `WhatsAppPage.tsx` — Integração WhatsApp Business API
- `FluxosChatPage.tsx` — Editor visual de fluxos de chatbot
- `TemplatesMensagensPage.tsx` — Templates com versões masculino/feminino

#### Kanban (4 páginas)
- `KanbanCobrancaPage.tsx` — Kanban de cobrança refatorado com drag-and-drop
- `KanbanAnalisePage.tsx` — Kanban de análise de crédito
- `KanbanAtendimentoPage.tsx` — Kanban de atendimento ao cliente
- `KanbanGerencialPage.tsx` — Visão gerencial consolidada com gráficos

#### Relatórios (3 páginas)
- `RelatoriosPage.tsx` — Central de relatórios com download/agendamento
- `RelatoriosOperacionaisPage.tsx` — Relatórios operacionais com tabs
- `ExportarDadosPage.tsx` — Exportação de dados em massa (CSV/Excel/JSON)

#### Configurações (3 páginas — modo incógnito obrigatório ⚠️)
- `PerfisAcessoPage.tsx` — Gestão RBAC com switches por módulo
- `IntegracoesPage.tsx` — Configuração de APIs externas
- `MinhaContaPage.tsx` — Perfil do usuário, senha e 2FA

#### Equipe (2 páginas)
- `MonitoramentoAtividadePage.tsx` — Monitoramento em tempo real de funcionários
- `ProdutividadePage.tsx` — Relatórios de produtividade com RadarChart

### Alterado

- **`routes.tsx`**: Expandido de 9 para 28 rotas + wildcard fallback
- **`MainLayout.tsx`**: Sidebar expandida de 5 para 8 seções de navegação com ícones Lucide
- **`mockData.ts`**: Adicionadas interfaces `Funcionario`, `SessaoAtividade`, `TemplateWhatsApp`; campo `sexo` em `Cliente`; arrays `mockFuncionarios`, `mockParcelas`, `mockEmprestimos`, `mockTemplatesWhatsApp`, `mockProdutividadePorHora`, `mockProdutividadeSemanal`

### Documentação

- **PLATAFORMA.md**: Reescrito completamente — corrigido de Vue 3 para React 18 + TypeScript
- **README.md**: Atualizado com stack real, scripts e instruções
- **Guidelines.md**: Reescrito com padrões React/TypeScript e convenções do projeto

---

## [1.0.0] — 2026-02-22

### Versão Inicial

#### Páginas funcionais (9)
- `LoginPage.tsx` — Autenticação mock com localStorage
- `DashboardPage.tsx` — Dashboard com KPIs básicos
- `ClientesPage.tsx` — Listagem de clientes
- `ClienteAreaPage.tsx` — Portal do cliente
- `DashboardCobrancaPage.tsx` — Dashboard de cobrança
- `KanbanCobrancaPage.tsx` — Kanban de cobrança
- `ChatPage.tsx` — Chat básico
- `RedeIndicacoesPage.tsx` — Rede de indicações
- `RelatoriosPage.tsx` — Relatórios financeiros

#### Infraestrutura
- React 18 + TypeScript 5 + Vite 6
- Tailwind CSS v4 com tema customizado (Primary: `#0A2472`, Secondary: `#2EC4B6`)
- shadcn/ui (40+ componentes Radix UI)
- React Router 7 com `createBrowserRouter`
- Recharts para gráficos
- Sonner para notificações toast
- Sistema de autenticação mock com RBAC (5 papéis)

---

## Legenda

- **Adicionado** — novos recursos
- **Alterado** — mudanças em funcionalidades existentes
- **Corrigido** — correções de bugs
- **Removido** — funcionalidades removidas
- **Documentação** — melhorias na documentação
