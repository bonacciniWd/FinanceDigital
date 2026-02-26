# FintechFlow - Plataforma de Gestão de Crédito

> **Última atualização**: 23/02/2026  
> **Versão**: 2.0.0 (MVP Frontend Completo)

Plataforma completa para gestão de crédito, cobrança, rede de indicações e monitoramento de equipe.

---

## Stack Tecnológico

| Tecnologia | Versão | Uso |
|---|---|---|
| React | 18 | Framework frontend |
| TypeScript | 5 | Tipagem estática |
| Vite | 6 | Build tool |
| Tailwind CSS | v4 | Estilização (com `@tailwindcss/vite`) |
| React Router | 7 | Navegação SPA |
| Radix UI / shadcn/ui | — | Componentes acessíveis |
| Recharts | — | Gráficos e visualizações |
| Lucide React | — | Ícones |
| Sonner | — | Toasts/notificações |
| react-hook-form | — | Formulários |
| date-fns | — | Manipulação de datas |

---

## Funcionalidades Principais

### 🔐 Autenticação e Perfis de Acesso
- **Admin**: Acesso completo ao sistema
- **Gerência**: Dashboard, relatórios e equipe
- **Cobrança**: Clientes vencidos, kanban de cobrança, comunicação
- **Comercial**: Gestão de novos clientes, indicações, chat
- **Cliente**: Área de autoatendimento

### 📊 Dashboards (4 páginas)
- **Visão Geral** (`/dashboard`): KPIs financeiros, evolução mensal, composição de carteira
- **Financeiro** (`/dashboard/financeiro`): Receitas/despesas, fluxo de caixa, margem líquida
- **Cobrança** (`/dashboard/cobranca`): Inadimplência, aging, status de cobranças
- **Comercial** (`/dashboard/comercial`): Leads, conversões, pipeline, top indicadores

### 👥 Gestão de Clientes (5 páginas)
- **Lista de Clientes** (`/clientes`): Tabela com filtros, busca, visualização em cards
- **Análise de Crédito** (`/clientes/analise`): Fila de análise com score, aprovar/recusar workflow
- **Empréstimos Ativos** (`/clientes/emprestimos`): Tabela com barra de progresso, status, detalhes
- **Gestão de Parcelas** (`/clientes/parcelas`): **Operações em lote** — quitar parcelas em lote, editar série (valor/dia de vencimento), excluir em lote com confirmação
- **Histórico** (`/clientes/historico`): Timeline de todas as atividades do cliente

> **Campo `sexo`**: Cadastro de clientes inclui sexo (masculino/feminino) para personalização de mensagens WhatsApp com tratamento por gênero.

### 🕸️ Rede de Indicações (4 páginas)
- **Mapa da Rede** (`/rede`): Visualização hierárquica da rede de indicações
- **Bônus e Comissões** (`/rede/bonus`): Ranking de indicadores, gráfico mensal, leaderboard
- **Grupos Bloqueados** (`/rede/bloqueados`): Redes bloqueadas por inadimplência solidária
- **Indicar Novo** (`/rede/indicar`): Wizard 3 etapas (indicador → dados pessoais com sexo → confirmação)

### 💬 Comunicação (4 páginas)
- **Chat Geral** (`/chat`): Chat em tempo real com clientes
- **WhatsApp** (`/whatsapp`): Interface estilo WhatsApp com bolhas verdes, status de entrega (✓✓)
- **Fluxos de Chat** (`/chat/fluxos`): Gestão de fluxos automatizados (ativar/pausar/configurar)
- **Templates** (`/chat/templates`): Templates com versões M/F, preview com toggle de gênero, variáveis dinâmicas

> **Mensagens por gênero**: Templates possuem campos `mensagemMasculino` e `mensagemFeminino` para cobrança personalizada via WhatsApp.

### 📋 Kanban (4 páginas)
- **Cobrança** (`/kanban/cobranca`): Fluxo visual de cobrança com drag & drop
- **Análise de Crédito** (`/kanban/analise`): 5 colunas (Nova Solicitação → Documentação → Em Análise → Aprovado → Recusado)
- **Atendimento** (`/kanban/atendimento`): Fila de atendimento (Aguardando → Em Atendimento → Aguardando Cliente → Resolvido)
- **Visão Gerencial** (`/kanban/gerencial`): KPIs do pipeline, volume semanal, performance por analista, gargalos

### 📈 Relatórios (3 páginas)
- **Gerenciais** (`/relatorios/gerenciais`): Relatórios personalizados com filtros e métricas rápidas
- **Operacionais** (`/relatorios/operacionais`): Inadimplência, volume de operações, recebimentos previsto vs realizado, eficiência de cobrança
- **Exportar Dados** (`/relatorios/exportar`): Seleção múltipla de relatórios, formatos (XLSX/CSV/PDF), períodos customizados, histórico de exportações

### ⚙️ Configurações (3 páginas) — 🔒 SOMENTE ABA ANÔNIMA
- **Perfis de Acesso** (`/configuracoes/perfis`): CRUD de perfis com matriz de permissões por módulo
- **Integrações** (`/configuracoes/integracoes`): WhatsApp API, Supabase, PIX, SMS, Email SMTP, Serasa
- **Minha Conta** (`/configuracoes/conta`): Dados pessoais, segurança (2FA, sessão máxima, IP restrito), notificações

> **⚠️ Segurança**: As 3 páginas de Configurações detectam se o navegador está em modo incógnito. Se não estiver, exibem uma tela de bloqueio com instruções para abrir em aba anônima. Isso garante que nenhum registro de acesso a configurações sensíveis fique no histórico do navegador dos funcionários.

### 👥 Equipe (2 páginas) — NOVO
- **Monitoramento** (`/equipe/monitoramento`): Status online/ausente/offline em tempo real, sessões de hoje (entrada/saída/IP), horas trabalhadas (dia/semana/mês), progresso de meta diária, alertas de inatividade
- **Produtividade** (`/equipe/produtividade`): Meta vs realizado, evolução semanal, atividades por hora do dia, ranking de produtividade com pontuação, radar comparativo entre funcionários

### 🎯 Área do Cliente
- Visualização de empréstimos e parcelas
- Extrato de pagamentos
- Sistema de indicações
- Chat com suporte

---

## Credenciais de Teste

| Perfil | Email | Senha |
|---|---|---|
| Admin | `admin@financeira.com` | qualquer (modo demo) |
| Gerente | `gerente@financeira.com` | qualquer (modo demo) |
| Cobrança | `cobranca@financeira.com` | qualquer (modo demo) |
| Comercial | `comercial@financeira.com` | qualquer (modo demo) |

---

## Paleta de Cores

| Cor | Hex | Uso |
|---|---|---|
| Primária | `#0A2472` | Azul Marinho - Confiança |
| Secundária | `#2EC4B6` | Verde Água - Sucesso/Destaques |
| Acento | `#FCA311` | Laranja - Alertas |
| Erro | `#E71D36` | Vermelho - Inadimplência |
| Sucesso | `#2DC937` | Verde - Em dia |
| Atenção | `#FFB703` | Amarelo - À vencer |

---

## Navegação (Sidebar)

1. **DASHBOARD** — Visão Geral · Financeiro · Cobrança · Comercial
2. **CLIENTES** — Lista · Análise de Crédito · Empréstimos · Gestão de Parcelas · Histórico
3. **REDE DE INDICAÇÕES** — Mapa · Bônus e Comissões · Grupos Bloqueados · Indicar Novo
4. **COMUNICAÇÃO** — Chat Geral · WhatsApp · Fluxos de Chat · Templates
5. **KANBAN** — Cobrança · Análise de Crédito · Atendimento · Visão Gerencial
6. **RELATÓRIOS** — Gerenciais · Operacionais · Exportar Dados
7. **CONFIGURAÇÕES** — Perfis de Acesso · Integrações · Minha Conta
8. **EQUIPE** — Monitoramento · Produtividade

---

## Recursos Implementados (v2.0)

✅ Sistema de autenticação com 4 perfis (admin, gerência, cobrança, comercial)  
✅ 4 dashboards interativos com gráficos (Recharts)  
✅ Gestão completa de clientes com campo `sexo` para mensagens personalizadas  
✅ **Gestão de Parcelas em lote** (quitar, editar série, excluir)  
✅ Análise de crédito com workflow de aprovação  
✅ Rede de indicações com wizard de cadastro  
✅ Chat + WhatsApp com interface nativa  
✅ Templates de mensagens com versões masculino/feminino  
✅ Fluxos de chat automatizados  
✅ 4 kanban boards (cobrança, análise, atendimento, gerencial)  
✅ Relatórios operacionais com gráficos de inadimplência  
✅ Exportação de dados em múltiplos formatos  
✅ Configurações protegidas por modo incógnito  
✅ **Monitoramento de atividade da equipe em tempo real**  
✅ **Dashboard de produtividade com radar comparativo e ranking**  
✅ Área do cliente (autoatendimento)  
✅ Sidebar com controle de acesso por role (RBAC)  
✅ 28 rotas funcionais (zero placeholders)  
✅ Responsividade completa  
✅ Build sem erros (2357 módulos)  

---

## Estrutura de Arquivos

```
src/
├── main.tsx                          # Entry point
├── app/
│   ├── App.tsx                       # Root component
│   ├── routes.tsx                    # 28 rotas (React Router 7)
│   ├── components/
│   │   ├── MainLayout.tsx            # Sidebar + Header + Outlet (8 seções)
│   │   ├── ProtectedRoute.tsx        # Auth guard
│   │   ├── StatusBadge.tsx           # Badge reutilizável
│   │   └── ui/                       # shadcn/ui components (~40 componentes)
│   ├── contexts/
│   │   └── AuthContext.tsx            # Mock auth com localStorage
│   ├── lib/
│   │   └── mockData.ts               # Interfaces + dados mock centralizados
│   └── pages/
│       ├── LoginPage.tsx              # Login
│       ├── ClienteAreaPage.tsx        # Autoatendimento
│       ├── DashboardPage.tsx          # Dashboard Visão Geral
│       ├── DashboardFinanceiroPage.tsx
│       ├── DashboardCobrancaPage.tsx
│       ├── DashboardComercialPage.tsx
│       ├── ClientesPage.tsx           # Lista de Clientes
│       ├── AnaliseCreditoPage.tsx
│       ├── EmprestimosAtivosPage.tsx
│       ├── GestaoParcelasPage.tsx     # Operações em lote
│       ├── HistoricoClientesPage.tsx
│       ├── RedeIndicacoesPage.tsx     # Mapa da Rede
│       ├── BonusComissoesPage.tsx
│       ├── GruposBloqueadosPage.tsx
│       ├── IndicarNovoPage.tsx        # Wizard 3 etapas
│       ├── ChatPage.tsx               # Chat Geral
│       ├── WhatsAppPage.tsx           # Interface WhatsApp
│       ├── FluxosChatPage.tsx
│       ├── TemplatesMensagensPage.tsx # Templates M/F
│       ├── KanbanCobrancaPage.tsx
│       ├── KanbanAnalisePage.tsx      # 5 colunas
│       ├── KanbanAtendimentoPage.tsx
│       ├── KanbanGerencialPage.tsx    # KPIs + gráficos
│       ├── RelatoriosPage.tsx
│       ├── RelatoriosOperacionaisPage.tsx
│       ├── ExportarDadosPage.tsx
│       ├── PerfisAcessoPage.tsx       # 🔒 Incógnito
│       ├── IntegracoesPage.tsx        # 🔒 Incógnito
│       ├── MinhaContaPage.tsx         # 🔒 Incógnito
│       ├── MonitoramentoAtividadePage.tsx  # Equipe
│       └── ProdutividadePage.tsx          # Equipe
└── styles/
    ├── fonts.css
    ├── index.css
    ├── tailwind.css
    └── theme.css
```

---

## Modelos de Dados (mockData.ts)

### Interfaces Principais

| Interface | Campos-chave |
|---|---|
| `Cliente` | id, nome, cpf, **sexo** (masculino/feminino), email, telefone, status, score, limiteCredito, saldoDevedor |
| `Emprestimo` | id, clienteId, clienteNome, valor, parcelas, parcelasPagas, taxaJuros, status, dataInicio, dataFim |
| `Parcela` | id, emprestimoId, numero, valorOriginal, juros, multa, desconto, valorFinal, dataVencimento, status |
| `Funcionario` | id, nome, email, cargo, status (online/ausente/offline), **horasHoje/Semana/Mês**, atividadesHoje, metaDiaria, sessoes |
| `SessaoAtividade` | id, funcionarioId, entrada, saida, ip, navegador |
| `TemplateWhatsApp` | id, nome, categoria, **mensagemMasculino**, **mensagemFeminino**, variaveis[], ativo |
| `IndicacaoRede` | id, indicadorId, indicadoId, status, dataIndicacao, bonus |

---

## Próximos Passos (Backend)

1. Conectar ao **Supabase** para persistência de dados
   - Edge Functions para lógica de negócio
   - Row Level Security (RLS) por perfil
2. Implementar **autenticação real** com JWT via Supabase Auth
3. Adicionar **WebSockets** para chat e monitoramento em tempo real
4. Integrar **WhatsApp Business API** para envio de mensagens
5. Implementar **geração de PDFs** server-side para relatórios
6. Adicionar **notificações push** (Web Push API)
7. Implementar **sistema de permissões** granular no backend
8. **Tracking real de atividade** — capturar logins, sessões e ações dos funcionários
9. Integrar **API PIX** para geração de QR Codes e confirmação de pagamentos