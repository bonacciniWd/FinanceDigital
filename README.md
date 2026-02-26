FintechFlow - Plataforma de Gestão de Crédito

![version](https://img.shields.io/badge/version-2.0.0-blue)
![React](https://img.shields.io/badge/React-18-61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6)
![Vite](https://img.shields.io/badge/Vite-6-646CFF)
![license](https://img.shields.io/badge/license-MIT-orange)

> **Última atualização**: 23/02/2026
> 
> ⚠️ **Nota**: Este projeto utiliza **React 18 + TypeScript**. Referências anteriores a Vue 3/Pinia na documentação eram de uma versão draft e foram corrigidas.

## 🚀 Sobre o Projeto

FintechFlow é uma plataforma completa para gestão de financeiras de crédito, com 4 dashboards interativos, gestão de parcelas em lote, rede de indicações, chat/WhatsApp com templates por gênero, monitoramento de equipe e configurações protegidas por modo incógnito.

## 🎯 Funcionalidades Principais

- **4 Dashboards**: Visão Geral, Financeiro, Cobrança, Comercial
- **Gestão de Clientes**: Cadastro com campo sexo, análise de crédito, empréstimos, histórico
- **Gestão de Parcelas em Lote**: Quitar parcelas, editar série (valor/dia), excluir em lote
- **Rede de Indicações**: Mapeamento hierárquico, bônus, bloqueio solidário automático
- **Comunicação**: Chat, WhatsApp nativo, fluxos automatizados, templates M/F
- **4 Kanban Boards**: Cobrança, Análise de Crédito, Atendimento, Visão Gerencial
- **Relatórios**: Operacionais com gráficos, exportação multi-formato
- **Configurações**: 🔒 Protegidas por modo incógnito (sem registro no navegador)
- **Monitoramento de Equipe**: Login/atividade em tempo real, produtividade, ranking
- **RBAC Completo**: Controle de acesso por papel (admin, gerência, cobrança, comercial)

## 📋 Pré-requisitos

- Node.js 18+
- NPM

## 🛠️ Stack Tecnológica

| Camada | Tecnologia | Detalhes |
|---|---|---|
| Framework | React 18 | Componentes funcionais + hooks |
| Linguagem | TypeScript 5 | Tipagem estática |
| Build | Vite 6 | HMR + `@tailwindcss/vite` plugin |
| Estilização | Tailwind CSS v4 | Utility-first com tema customizado |
| Componentes | Radix UI / shadcn/ui | ~40 componentes acessíveis |
| Rotas | React Router 7 | `createBrowserRouter`, 28 rotas |
| Gráficos | Recharts | Bar, Line, Area, Pie, Radar charts |
| Ícones | Lucide React | Iconografia consistente |
| Toasts | Sonner | Notificações de feedback |
| Formulários | react-hook-form | Validação e controle |
| Datas | date-fns | Formatação e cálculos |
| Backend (futuro) | Supabase | Banco + Auth + Realtime + Edge Functions |

## 🚦 Como Começar

### 1. Clone o repositório

```bash
git clone https://github.com/sua-empresa/fintechflow.git
cd fintechflow
```

### 2. Instale as dependências

```bash
npm install
```

### 3. Rode o projeto

```bash
npm run dev
```

Acesse http://localhost:5173

### 4. Build de produção

```bash
npm run build
```

## 👥 Credenciais de Teste

| Papel | Email | Senha |
|---|---|---|
| Admin | `admin@financeira.com` | qualquer |
| Gerente | `gerente@financeira.com` | qualquer |
| Cobrança | `cobranca@financeira.com` | qualquer |
| Comercial | `comercial@financeira.com` | qualquer |

## 📁 Estrutura de Diretórios

```
src/
├── main.tsx                    # Entry point
├── styles/                     # CSS global (fonts, theme, tailwind)
└── app/
    ├── App.tsx                 # Root component
    ├── routes.tsx              # 28 rotas configuradas
    ├── components/
    │   ├── MainLayout.tsx      # Sidebar (8 seções) + Header
    │   ├── ProtectedRoute.tsx  # Auth guard
    │   └── ui/                 # ~40 shadcn/ui components
    ├── contexts/
    │   └── AuthContext.tsx      # Mock auth com localStorage
    ├── lib/
    │   └── mockData.ts         # Interfaces TypeScript + dados mock
    └── pages/                  # 31 páginas funcionais
        ├── LoginPage.tsx
        ├── ClienteAreaPage.tsx
        ├── Dashboard*.tsx       (4 páginas)
        ├── Clientes*.tsx        (5 páginas)
        ├── Rede*.tsx            (4 páginas)
        ├── *Chat*.tsx           (4 páginas)
        ├── Kanban*.tsx          (4 páginas)
        ├── Relatorios*.tsx      (3 páginas)
        ├── *Config*.tsx         (3 páginas - incógnito)
        └── *Equipe*.tsx         (2 páginas)
```

## 👥 Papéis de Usuário

| Papel | Acesso | Módulos |
|---|---|---|
| admin | Total | Todos os módulos + Configurações + Equipe |
| gerencia | Alto | Dashboard, Clientes, Rede, Kanban, Relatórios, Equipe |
| cobranca | Médio | Dashboard, Clientes, Chat/WhatsApp, Kanban Cobrança |
| comercial | Médio | Dashboard, Clientes (lista), Rede, Chat, Kanban Atendimento |

## 🔒 Regras de Negócio Importantes

### Rede de Indicações
- Se um membro da rede ficar inadimplente → rede toda bloqueada
- Bônus por indicações que geram crédito
- Visualização hierárquica completa

### Cálculo de Juros
- Juros compostos sobre atraso
- Multa de 2% + juros de mora (1% ao mês pro rata)
- Parcelamento automático

### Operações em Lote (Parcelas)
- **Quitar em lote**: Selecionar parcelas → aplicar desconto opcional → confirmar quitação
- **Editar série**: Alterar valor e/ou dia de vencimento para múltiplas parcelas
- **Excluir em lote**: Confirmação obrigatória com contagem

### Mensagens por Gênero
- Campo `sexo` no cadastro (masculino/feminino)
- Templates WhatsApp com `mensagemMasculino` e `mensagemFeminino`
- Preview com toggle de gênero

### Configurações em Modo Incógnito
- Detecção automática via Storage API / FileSystem API
- Tela de bloqueio com instruções para cada navegador
- Garante zero registro no histórico do browser

### Monitoramento de Equipe
- Tracking de login/logout com IP
- Horas trabalhadas (dia/semana/mês)
- Meta diária de atividades
- Alertas de inatividade

## 📈 Status do Projeto

| Métrica | Valor |
|---|---|
| Páginas funcionais | 31 |
| Rotas configuradas | 28 |
| Módulos compilados | 2.357 |
| Erros de build | 0 |
| Bundle JS (gzip) | ~296 KB |
| Bundle CSS (gzip) | ~17 KB |

## 🚀 Próximos Passos (Backend)

1. Conectar ao **Supabase** (persistência + RLS)
2. Autenticação real com **JWT** via Supabase Auth
3. **WebSockets** para chat e monitoramento em tempo real
4. Integração **WhatsApp Business API**
5. Geração de **PDFs** server-side
6. **Notificações push** (Web Push API)
7. Permissões granulares no backend
8. Tracking real de sessões de funcionários
9. Integração **API PIX** (QR Codes + confirmação)

## 📄 Licença

Distribuído sob licença MIT.