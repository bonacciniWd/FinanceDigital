# Changelog — FintechFlow

Todas as alterações notáveis do projeto serão documentadas neste arquivo.

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).

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
