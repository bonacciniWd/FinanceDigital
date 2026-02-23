# FintechFlow - Plataforma de Gestão de Crédito

Plataforma completa para gestão de crédito, cobrança e rede de indicações.

## Funcionalidades Principais

### 🔐 Autenticação e Perfis de Acesso
- **Admin**: Acesso completo ao sistema
- **Gerência**: Dashboard e relatórios
- **Cobrança**: Apenas clientes vencidos
- **Comercial**: Gestão de novos clientes
- **Cliente**: Área de autoatendimento

### 📊 Dashboards
- **Dashboard Principal**: Visão geral com métricas financeiras
- **Dashboard Cobrança**: Foco em inadimplência
- Gráficos de evolução financeira e composição de carteira
- Cards com métricas em tempo real

### 👥 Gestão de Clientes
- Lista completa com filtros avançados
- Visualização em tabela ou cards
- Detalhes financeiros e histórico
- Gestão de crédito e limites

### 🕸️ Rede de Indicações
- Visualização hierárquica da rede
- Bloqueio solidário automático
- Gestão de bônus e comissões
- Rastreamento de conversões

### 💬 Comunicação
- Chat em tempo real com clientes
- Templates de mensagens
- Histórico de conversas
- Status de visualização

### 📋 Kanban
- Fluxo de cobrança visual
- Gestão de negociações
- Acompanhamento de acordos
- Drag & drop entre colunas

### 📈 Relatórios
- Relatórios gerenciais personalizados
- Exportação em PDF e Excel
- Envio por e-mail
- Relatórios rápidos com métricas

### 🎯 Área do Cliente
- Visualização de empréstimos
- Extrato de pagamentos
- Sistema de indicações
- Chat com suporte

## Credenciais de Teste

### Admin
- Email: `admin@financeira.com`
- Senha: qualquer senha (modo demo)

### Gerente
- Email: `gerente@financeira.com`
- Senha: qualquer senha (modo demo)

### Cobrança
- Email: `cobranca@financeira.com`
- Senha: qualquer senha (modo demo)

## Paleta de Cores

- **Primária**: #0A2472 (Azul Marinho) - Confiança
- **Secundária**: #2EC4B6 (Verde Água) - Sucesso
- **Acento**: #FCA311 (Laranja) - Alertas
- **Erro**: #E71D36 (Vermelho) - Inadimplência
- **Sucesso**: #2DC937 (Verde) - Em dia
- **Atenção**: #FFB703 (Amarelo) - À vencer

## Navegação Principal

1. **Dashboard** - Visão geral e métricas
2. **Clientes** - Gestão completa de clientes
3. **Rede de Indicações** - Visualização e gestão da rede
4. **Comunicação** - Chat e WhatsApp
5. **Kanban** - Gestão visual de processos
6. **Relatórios** - Análises e exportações
7. **Configurações** - Perfis e integrações

## Recursos Implementados

✅ Sistema de autenticação com perfis
✅ Dashboard interativo com gráficos
✅ Gestão completa de clientes
✅ Rede de indicações visual
✅ Chat em tempo real
✅ Kanban de cobrança
✅ Sistema de relatórios
✅ Área do cliente (autoatendimento)
✅ Filtros avançados
✅ Responsividade
✅ Componentes reutilizáveis

## Próximos Passos

Para transformar esta aplicação em produção com backend real:

1. Conectar ao Supabase para persistência de dados
2. Implementar autenticação real com JWT
3. Adicionar WebSockets para chat em tempo real
4. Integrar API do WhatsApp Business
5. Implementar geração de PDFs server-side
6. Adicionar notificações push
7. Implementar sistema de roles e permissões no backend

## Stack Tecnológico

- **React 18** - Framework frontend
- **TypeScript** - Tipagem estática
- **React Router 7** - Navegação
- **Tailwind CSS v4** - Estilização
- **Radix UI** - Componentes acessíveis
- **Recharts** - Gráficos e visualizações
- **Lucide Icons** - Ícones
- **Vite** - Build tool
