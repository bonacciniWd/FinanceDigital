# Changelog — FintechFlow

Todas as alterações notáveis do projeto serão documentadas neste arquivo.

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).

---

## [1.4.19] — 2026-04-28

### Adicionado
- **Adicionar parcela manual**: botão "+ Adicionar parcela" na aba Cobrança do modal do cliente. Abre dialog com seleção de empréstimo ativo/inadimplente, valor, vencimento e número automático (max + 1). Após inserção, atualiza total de parcelas do empréstimo e dispara `sync_emprestimo_status_from_parcelas` para recompute de `proximo_vencimento` e `status`. Invalida queries de `parcelas`, `emprestimos`, `clientes`, `dashboard-stats`, `kanban-cobranca`, `kanban-stats`.

### Corrigido
- **Nome do cliente na cobrança PIX via WhatsApp**: o campo "Olá Cliente!" ocorria porque o fallback `emp?.clienteNome` retornava `undefined`. Agora busca `cli?.nome` (query Supabase) antes de definir o nome, com fallback `emp?.clienteNome || 'Cliente'`.
- **Data de vencimento redundante na mensagem PIX**: quando a parcela estava vencida e o vencimento era ajustado para hoje (requisito da API EFI), a mensagem mostrava a data ajustada como se fosse o vencimento real. Agora exibe "Vencimento original: DD/MM/YYYY — *pague hoje*" para parcelas vencidas, e a data normal para parcelas dentro do prazo.

---

## [1.4.18] — 2026-04-27

### Corrigido
- **Espaço preto ao redor da Calculadora**: `calc-shell` tinha largura fixa 320px e era centralizado num fundo `#202020`, gerando bordas pretas visíveis. Agora `calc-shell` usa `flex: 1` e preenche toda área de conteúdo da janela.
- **Ícone do Windows com baixa resolução**: ICO regenerável via Pillow com 9 entradas (16, 24, 32, 40, 48, 64, 96, 128, 256) — cada entrada PNG-comprimida individualmente.

---

## [1.4.17] — 2026-04-27

### Corrigido
- **Dupla barra de título na Calculadora**: o componente `Calculadora.tsx` tinha uma barra de título falsa estilo Windows dentro do HTML (com botões de minimizar/maximizar/fechar), além da barra nativa do SO já exibida pelo Electron. Removida a barra falsa do JSX e do CSS. Padding do label `Padrão` ajustado.

---

## [1.4.16] — 2026-04-27

### Corrigido
- **App empacotado abria direto em `/login` (sem mostrar a Calculadora)**: o Electron carregava `app://bundle/index.html`, que fazia o React Router ver `pathname = '/index.html'`. Como a rota `/` da Calculadora exige match exato, o roteador caia no fallback `*` dentro do `ProtectedRoute`, que redirecionava para `/login`. Corrigido carregando `app://bundle/` (raiz) — o protocol handler já serve `index.html` como fallback de SPA. Agora o app abre na fachada Calculadora e o cálculo `777÷3==` precisa ser refeito a cada nova abertura.

---

## [1.4.15] — 2026-04-27

### Adicionado

- **Gastos Internos** (substitui Configuração de Comissões): admin cadastra categorias de gastos internos com nome e termo de match, e o sistema cruza automaticamente com lançamentos dos extratos.
- **Saídas Órfãs**: nova página para revisar saídas extratadas que não casaram com nenhum gasto interno cadastrado.
- **Cron `cron-saidas-orfas`**: edge function Supabase que processa saídas órfãs periodicamente.
- **Migration 051**: schema para `gastos_internos` e `saidas_orfas`.
- **Ícones**: app rebrandeado com ícone oficial da Calculadora do Windows 11 (`.icns`, `.ico`, PWA 192/512).

### Alterado
- Rota raiz `/` agora exibe `Calculadora` (fachada). Rotas autenticadas seguem em `/dashboard`, `/login`, etc.
- Sidebar substituiu `Comissões` por `Gastos Internos` + `Saídas Órfãs`.
- Electron: janela inicial 340×560 não-redimensionável; IPC `app:reveal` desbloqueia + redimensiona para 1400×900.

### Removido
- `ComissoesConfigPage.tsx`.

---

## [1.4.14] — 2026-04-26

### Alterado
- **Rota fallback (`*`)**: texto atualizado para "Pagina em Desenvolvimento..." e animação Lottie redimensionada (150×150).

---

## [1.4.13] — 2026-04-26

### Corrigido
- **Crash do app na rota fallback (`*`)**: `routes.tsx` usava `require('../assets/animations/welcome.json')` dentro de JSX, o que não funciona em bundle ESM/Vite — `require is not defined` quebrava todo o roteador ao montar (tela branca no app empacotado). Substituído por `import welcomeAnimation from '../assets/animations/welcome.json'` no topo do módulo.

---

## [1.4.12] — 2026-04-26

### Corrigido
- **Dashboard de Cobrança com valores absurdos** (R$ 171M): juros não eram congelados para clientes arquivados/perdidos nem para parcelas com >365 dias de atraso, criando totais irreais. `DashboardCobrancaPage` agora aplica a mesma régua do Kanban de Cobrança:
  - exclui empréstimos de clientes cujo card está em `arquivado`, `perdido` ou `vencido > 365d`;
  - exclui parcelas individuais com `diasAtraso > 365` (juros congelados);
  - cap de 365d no `diasAtrasoReal` por cliente exibido na tabela.

### Melhorado (UX)
- **Loading dos dashboards**: novo componente `DashboardSkeleton` substitui o estado "tudo zerado" enquanto os hooks do React Query ainda estão hidratando. Aplicado em `DashboardPage`, `DashboardCobrancaPage` e `DashboardComercialPage` agregando o `isLoading` de todos os hooks consumidos (clientes, empréstimos, parcelas, cards, acordos, stats). Antes apenas alguns dashboards tinham fallback parcial.

---

## [1.4.11] — 2026-04-26

### Corrigido
- **Clientes desaparecendo a partir do 1001º registro** (crítico): consultas em `clientesService.getClientes`, `emprestimosService.getEmprestimos` e `analiseCreditoService.getAnalises` não usavam `range()` e estavam sujeitas ao limite default de 1000 linhas do PostgREST. Como a lista de clientes é ordenada por `nome`, registros que caíam após a posição 1000 alfabeticamente (ex.: VANIA…) **não apareciam em ClientesPage, não eram encontrados na busca de "Nova Análise" (AnaliseCreditoPage), nem listados em EmprestimosAtivosPage**. Adicionado `.range(0, 49999)` nos três services para subir o teto.

### Melhorado (UX)
- **Empréstimos Ativos — botão `Eye` unificado**: agora abre o `ClienteDetalhesModal` direto na aba **Cobrança** (via `openClienteModal(clienteId, { tab: 'cobranca' })`) em vez do antigo `EmprestimoDetailModal`. Centraliza o ponto de entrada de cobrança no modal do cliente.
- **ClienteDetalhesModal — aba Cobrança enriquecida**: ports completos das ações por parcela que antes só existiam no `EmprestimoDetailModal`:
  - **Pagar** (modal completo/parcial com observação, data, desconto, conta bancária, auto-seleção de gateway).
  - **Gerar PIX + WhatsApp** (cria cobrança EFI, envia copia-e-cola + QR para a instância conectada).
  - **Confirmar pagamento manual com comprovante** (upload + OCR + auto-aprovação/divergência).
  - **Editar juros/multa/desconto** inline (já existia, agora ao lado das demais ações).

---

## [1.4.10] — 2026-04-25

### Melhorado
- **Ícone do app em alta qualidade**: substituído por arte 1024×1024 nova. Regenerados `build/icon.icns` (macOS), `build/icon.ico` (Windows), `build/icon.png` (Linux) e todo o `build/icon.iconset/`.

---

## [1.4.9] — 2026-04-25

### Corrigido
- **Kanban Cobrança — Total em Cobrança contabilizava arquivados**: o card de estatísticas "Total em Cobrança" e a contagem de clientes incluíam cards exibidos na coluna ARQUIVADOS (cards com `etapa='vencido'` e `diasAtraso > 365`). Agora o cálculo de `stats.total`/`stats.totalClientes` exclui também esses casos, refletindo apenas a carteira ativa de cobrança.

---

## [1.4.8] — 2026-04-25

### Corrigido
- **Kanban Cobrança — coluna VENCE HOJE vazia**: filtro exigia `c.etapa === 'a_vencer'`, mas quando o empréstimo está com `status='inadimplente'` (ou tem qualquer parcela vencida acumulada) o sync marca o card como `vencido` mesmo com a parcela do dia vencendo HOJE (diasAtraso=0). Agora o filtro é baseado direto em `parcelasInfoByCliente.proxVencFuturo === todayStr`, ignorando o `etapa` armazenado (exceto estados finais: pago/perdido/arquivado/contatado/negociacao/acordo). Mesmo critério aplicado a `A VENCER (3d)`.
- **Ícone do app desatualizado nos builds**: `build/icon.icns/.ico/.png` ainda eram a arte antiga (Apr 11). Regenerados a partir de `public/icon-512.png` (ícone novo, Apr 25) via `sips` + `iconutil` + `png-to-ico`. Agora Mac/Win/Linux exibem o ícone correto.

---

## [1.4.7] — 2026-04-25

### Corrigido
- **Sidebar/MainLayout**: logo voltou para "FINTECH" (estava "CALCULADORA").

---

## [1.4.6] — 2026-04-25

### Corrigido
- **Kanban Cobrança — datas/dias incorretos**: card mostrava "10/04/2026" e "8d" simultaneamente em 25/04. Causa raiz dupla:
  1. **Timezone shift**: `new Date("2026-04-10").toLocaleDateString('pt-BR')` em UTC-3 retornava "09/04". Novo helper `lib/date-utils.ts` (`parseISODateLocal`, `formatDateBR`, `todayISO`) trata strings ISO `yyyy-mm-dd` como datas locais.
  2. **Dados stale**: `kanban_cobranca.dias_atraso` e `emprestimos.proximo_vencimento` ficavam desatualizados. Agora o card recalcula ao vivo a partir da tabela `parcelas` (fonte de verdade) via novo `parcelasInfoByCliente` memo.
- **`diasDeAtraso()` em `lib/juros.ts`** corrigido com mesmo parsing local — afeta cálculo automático de juros em todas as parcelas vencidas.
- **BadRequest 400 ao Sincronizar Kanban**: query `parcelas.in('emprestimo_id', ...)` excedia limite de URL do PostgREST quando havia muitos empréstimos. Solução: chunks de 100 IDs por request. Erros do Supabase deixam de ser silenciados (propaga `error.message` + `console.error` com payload).

---

## [1.4.5] — 2026-04-25

### Adicionado
- **Editor completo de empréstimo** (`EmprestimoEditModal`): clicar em um empréstimo na aba "Empréstimos" do `ClienteDetalhesModal` abre janela com 3 abas — **Dados** (valor, parcelas, taxa, tipo de juros, datas, status), **Parcelas** (edição inline de valor, vencimento e status por parcela) e **Auditoria** (aprovado por/quando, desembolsado em, vendedor, cobrador, gateway, skip verification).
- **Code-splitting** em todas as 40+ páginas via `React.lazy` + `Suspense` em `routes.tsx` — bundle inicial reduzido drasticamente, navegação entre abas do MainLayout muito mais leve.

### Corrigido
- **Kanban A Vencer** mostrando cards com vencimento de ontem: `proximoVencDoCliente` agora filtra apenas datas `>= todayStr` e re-recalcula ao virar o dia.
- **Modal do cliente estreitando** com muitos empréstimos: `DialogContent` agora `w-[96vw] sm:max-w-5xl lg:max-w-6xl xl:max-w-7xl h-[92vh]`.

### Alterado
- **Renomeação da aplicação**: "Fintech Digital" → **"Calculadora"** em todas as superfícies visíveis (Electron window title, PWA manifest, `<title>` HTML, meta tags OG/Twitter, sidebar `MainLayout`, `LoginPage`, `ClienteAreaPage`, `DocsPage`, `DownloadPage`).
- `electron-builder.json`: `productName` → `Calculadora`; `artifactName` → `Calculadora-${version}-${os}-${arch}.${ext}`.
- URLs de download dos artefatos atualizadas em `DownloadPage`.
- Ícones do PWA atualizados em `public/`.

---

## [1.4.4] — 2026-04-25

### Adicionado
- **OCR de comprovantes** com Tesseract.js: extrai valor, data e remetente automaticamente ao anexar imagem em pagamentos manuais.
- **Conciliação automática de pagamentos órfãos**: webhooks Woovi/EFI tentam vincular pagamento a parcela; se não houver match, registra em `pagamentos_orfaos` para revisão manual.
- **Tela `/pagamentos-orfaos`**: lista pagamentos sem vínculo, permite vincular manualmente a uma parcela existente ou descartar.
- **Acordos formais**: modal de Negociação no Kanban Cobrança gera cobrança Pix (Woovi 24h), envia WhatsApp ao cliente, congela parcelas vencidas e cria parcelas novas com entrada %, parcelamento e dia de pagamento configuráveis.
- **Refinanciamento**: novo fluxo no `ClienteDetalhesModal` para refinanciar empréstimo ativo (quita atual + cria novo).
- **Edição inline** de valor e vencimento por parcela em `GestaoParcelasPage`.
- **Modal de Negociação universal**: disponível em todas as telas que listam inadimplentes.
- **Lazy loading** do Histórico (20 itens por rolagem) — fix de travamento ao abrir a tela.
- **Página de Perfis de Acesso** clicável e editável pelo admin (persistido em Supabase).
- **Cobranças → parcela**: clicar no card de cobrança abre o detalhe da parcela vinculada.

### Melhorado
- Cards do Kanban de Análise de Crédito agora exibem renda mensal, valor da parcela e score.
- Scroll vertical interno em todos os Kanbans (atendimento, cobrança, análise).
- Skeletons "liquidmetal" no Dashboard, Histórico e Cobranças.
- Filtro de UI refinado.
- **Restaurado** ordenador por dias (`ArrowUpDown` por coluna) e filtro "A Vencer = hoje" no Kanban Cobrança.
- **Restaurados** estilos do Kanban Cobrança: largura da coluna `w-[500px]`, botão Chat `secondary`, dropdown amplo com hover verde.

### Banco de Dados
- Migration `050_conciliacao_ocr_orfaos.sql`: tabela `pagamentos_orfaos`, colunas em `acordos`, `parcelas.refinanciada_em`, helpers de conciliação.

### Edge Functions
- `_shared/conciliacao.ts`: lógica compartilhada de match Woovi/EFI → parcela.
- `webhook-woovi`, `webhook-efi`, `approve-credit` republicados.

---

## [1.4.3] - 24-04-2026


### Melhorias no Desempenho e Fixes

- Charge detail modal com dados de parcela e empréstimo
- Perfis de acesso editáveis pelo admin (persistido em Supabase)
- Histórico de clientes com lazy-load (20 por scroll)
- Skeletons liquid-metal em todas as páginas
- Dashboard Financeiro: performance otimizada, skeleton completo
- Fix: Intl.NumberFormat singleton em HistoricoClientesPage e DashboardFinanceiroPage
---

## [1.4.2] — 2026-04-23

### Adicionado — Juros automáticos configuráveis via ConfigSistema

**Parâmetros de juros por atraso agora editáveis (migration 049)**
- Novas chaves em `configuracoes_sistema`: `juros_fixo_dia` (R$/dia, default 100), `juros_perc_dia` (fração, default 0,10 = 10%/dia), `juros_limiar` (valor até o qual usa juro fixo, default 1000) e `juros_dias_max` (teto de dias de atraso considerados, default 365)
- Seeds idempotentes com `ON CONFLICT DO NOTHING`
- Card "Juros Automáticos por Atraso" em `/configuracoes-sistema` com 4 inputs; campo de percentual exibe como % e persiste como fração
- Box informativo explicando que juros congelam quando o cliente está em Kanban `arquivado`/`perdido`

**Runtime mutável em `src/app/lib/juros.ts`**
- `setJurosConfig(partial)` / `getJurosConfig()` e defaults exportados (`JUROS_*_DEFAULT`)
- `calcularJurosAtraso` e `valorCorrigido` passam a ler do runtime em vez de constantes fixas
- Hook `useSyncJurosConfig()` propaga valores do DB → runtime; montado via `RuntimeConfigSync` dentro dos providers em `App.tsx`

### Corrigido — Congelamento de juros em GestaoParcelas e scroll do Kanban de Cobrança

**Propagação de `congelarJuros` por etapa Kanban**
- `GestaoParcelasPage` consome `useCardsCobranca()` para montar `Set` de clientes em `arquivado`/`perdido` (`ETAPAS_CONGELA_JUROS`)
- Closure `parcelaTotal(p)` passa `{ congelarJuros }` para `valorCorrigido`, garantindo que parcelas desses clientes parem de acumular juros no relatório

**Scroll do Kanban de Cobrança reescrito**
- Removido scroller sticky duplicado + lógica de sincronização (causava loop "volta sozinho" e cobertura de cards)
- Board agora tem altura fixa `calc(100vh - 260px)` (mín. 400px) → scrollbar horizontal nativo fica sempre visível na base da viewport
- Cada coluna tem scroll vertical próprio (`overflow-y-auto` no `CardContent` com `flex-1 min-h-0`), header da coluna fixo
- Funciona bem com 200+ cards por coluna sem precisar rolar a página até o fim

### Arquivos criados/modificados

| Arquivo | Tipo | Alteração |
|---------|------|-----------|
| `supabase/migrations/049_juros_automaticos_config.sql` | Criado | Seeds das 4 chaves de juros |
| `src/app/lib/juros.ts` | Modificado | Runtime mutável + getters/setters |
| `src/app/hooks/useConfigSistema.ts` | Modificado | Campos de juros + `useSyncJurosConfig()` |
| `src/app/App.tsx` | Modificado | `RuntimeConfigSync` dentro dos providers |
| `src/app/pages/ConfigSistemaPage.tsx` | Modificado | Card "Juros Automáticos por Atraso" |
| `src/app/pages/GestaoParcelasPage.tsx` | Modificado | `congelarJuros` por etapa Kanban |
| `src/app/pages/KanbanCobrancaPage.tsx` | Modificado | Scroll horizontal reescrito |

---

## [1.4.1] — 2026-04-22

### Adicionado — Botão manual de atualização na tela de login (desktop)

- Novos IPC handlers no Electron main: `update:check`, `update:getStatus`, `update:quitAndInstall`
- Preload expõe `electronAPI.checkForUpdates()`, `getUpdateStatus()`, `quitAndInstall()` e `onUpdateStatus()`
- Tela de login mostra a versão instalada, botão "Verificar atualizações" e barra de progresso do download
- Mensagens de erro do updater ficam visíveis (ajuda a diagnosticar falhas de assinatura de código em macOS)
- Quando o update termina de baixar, a tela troca automaticamente para "Reiniciar e instalar {versão}"
- Versão web não mostra o botão (detecta `window.electronAPI`)

---

## [1.4.0] — 2026-04-22

### Adicionado — Valores variáveis por parcela, auto-aprovação auditada e desembolso em Pagamentos

**Dois valores por análise (migration 047)**
- Separação entre `valor_solicitado` (PIX enviado ao cliente) e `valor_total_receber` (total que volta para nós)
- Campo manual `valor_parcela` com derivação bidirecional automática (alterar parcelas recalcula total e vice-versa)
- `approve-credit` passa a honrar os valores manuais quando informados; caso contrário, cai no cálculo legado (Price 2.5%)

**Valores individuais por parcela (migration 048)**
- Grid dinâmico no modal de nova análise: após definir o nº de parcelas, cada uma pode receber um valor diferente
- Soma dos valores alimenta automaticamente o campo "Valor a Receber"
- Novo campo `analises_credito.valores_parcelas jsonb` persistido; `approve-credit` grava cada linha em `parcelas` com o valor específico
- Valor médio continua sendo gravado em `emprestimos.valor_parcela` para compatibilidade

**Pular link de verificação com auditoria (migration 048)**
- Novo checkbox "Pular link de verificação (auto-aprovar)" com motivo opcional no modal de criação
- A análise é criada e imediatamente auto-aprovada, sem vídeo-selfie nem validação de documentos
- Registro em `verification_logs` com `action = credit_approved_skip_verification` (verification_id nulo)
- Novo campo `emprestimos.skip_verification` com índice parcial para varredura admin rápida
- Card vermelho exclusivo para admin na aba Desembolsos listando empréstimos aprovados sem verificação

**Controle de Desembolso migrado para Pagamentos**
- Painel removido de `/clientes/analise-credito` e movido para `/pagamentos-woovi` (aba "Desembolsos")
- Aba só aparece para admin/gerência quando o desembolso automático está ligado/desligado e há aprovações para acompanhar
- Totais de pendente/enviado, botão "Marcar Enviado" e colapso de já enviados preservados
- Badges "sem verificação" destacam empréstimos auto-aprovados na própria lista

---

## [1.3.0] — 2026-04-20

### Adicionado — Sincronização estrutural, desembolso configurável e Arquivados no Kanban

**Sincronização automática de status (migration 045)**
- Funções SQL e triggers para manter `parcelas`, `emprestimos` e `clientes` sincronizados
- Nova função `mark_parcelas_vencidas()` para marcar parcelas vencidas sem depender de ajuste manual
- `get_dashboard_stats()` reescrita para usar `emprestimos` como fonte de verdade

**Dashboard e cobranças mais consistentes**
- Dashboard agora calcula carteira ativa diretamente dos empréstimos ativos/inadimplentes
- `getParcelasVencidas()` também considera parcelas `pendente` já vencidas, mesmo antes do cron rodar
- `cron-notificacoes` passa a executar a marcação de vencidas no início de cada ciclo

**Aprovação e desembolso configuráveis**
- Novas configurações globais para controle de desembolso, PIX automático e notificações de aprovação
- `approve-credit` agora pode aprovar sem enviar PIX automaticamente, deixando o desembolso em fluxo manual
- Mensagem de aprovação via WhatsApp respeita as novas flags e informa quando o pagamento será manual

**Kanban de cobrança com Arquivados**
- Nova etapa `arquivado` para clientes com mais de 365 dias de atraso
- Botão manual para arquivar cards em N3
- Scroll horizontal também no topo do quadro para facilitar navegação
- Métricas gerenciais e relatórios passaram a excluir Arquivados da cobrança ativa

### Arquivos criados/modificados

| Arquivo | Tipo | Alteração |
|---------|------|-----------|
| `supabase/migrations/045_auto_sync_statuses.sql` | Novo | Sync estrutural de status + RPC do dashboard |
| `supabase/migrations/046_kanban_arquivados_desembolso_config.sql` | Novo | Etapa `arquivado` + novas chaves de configuração |
| `supabase/functions/approve-credit/index.ts` | Modificado | Desembolso automático opcional |
| `supabase/functions/cron-notificacoes/index.ts` | Modificado | Executa `mark_parcelas_vencidas()` |
| `src/app/pages/DashboardPage.tsx` | Modificado | Carteira ativa por empréstimos |
| `src/app/pages/AnaliseCreditoPage.tsx` | Modificado | Controle manual de desembolso e totais |
| `src/app/pages/ConfigSistemaPage.tsx` | Modificado | Toggles de aprovação/desembolso |
| `src/app/pages/KanbanCobrancaPage.tsx` | Modificado | Arquivados + scroll superior + arquivar manual |
| `src/app/services/kanbanCobrancaService.ts` | Modificado | Autoarquivamento >365 dias |
| `src/app/services/parcelasService.ts` | Modificado | Busca vencidas com fallback de data |

---

## [1.2.0] — 2026-04-20

### Adicionado — Migração PlataPlumo + Gestão de Instância WhatsApp

**Migração de dados PlataPlumo (042 + 043)**
- Importação completa de CSV: 1.136 clientes, 5.821 empréstimos, 26.749 parcelas
- Fix de consistência: parcelas vencidas, empréstimos inadimplentes/quitados, clientes vencidos
- Kanban cards criados automaticamente para empréstimos ativos

**Rate limiting no cron de notificações**
- Limite de 40 mensagens/dia com delay de 3s entre envios
- Guard para não notificar clientes migrados (`plataplumo_migrado`)

**Admin: Definir Instância do Sistema (WhatsAppPage)**
- Botão "Definir como Sistema" no card de instância (admin/gerência)
- `setAsSystem()` no service layer: remove `is_system` de todas e marca a selecionada
- Hook `useSetAsSystem()` com invalidação automática de cache

**Correções Evolution API**
- Token da instância Sistema atualizado (migration 044)
- Webhook auto-configurado para CONNECTION_UPDATE/QRCODE_UPDATED

### Arquivos criados/modificados

| Arquivo | Tipo | Alteração |
|---------|------|-----------|
| `supabase/migrations/042_migrate_plataplumo.sql` | Novo | Migração completa PlataPlumo |
| `supabase/migrations/043_fix_data_consistency.sql` | Novo | Fix status parcelas/empréstimos/clientes |
| `supabase/migrations/044_fix_sistema_instance_token.sql` | Novo | Token + URL da instância Sistema |
| `supabase/functions/cron-notificacoes/index.ts` | Modificado | Rate limit + migration guard |
| `src/app/services/whatsappService.ts` | Modificado | `setAsSystem()` |
| `src/app/hooks/useWhatsapp.ts` | Modificado | `useSetAsSystem()` |
| `src/app/pages/WhatsAppPage.tsx` | Modificado | Botão "Definir como Sistema" |

---

## [1.1.0] — 2026-04-17

### Adicionado — Score Dinâmico + Desembolso + Renda Mensal + Acordos + Formatação R$

**Score dinâmico automático (webhook-efi, webhook-woovi, cron-notificacoes)**
- Função SQL `ajustar_score_cliente(p_cliente_id, p_delta, p_motivo)` com limites 0–1000
- Pagamento antecipado: +25 pontos | No dia: +15 | Atrasado: -5/dia (máx -100)
- Cron de atraso: -9 (3d), -21 (7d), -45 (15d), -90 (30d)
- Motivo registrado para auditoria (ex: `pagamento_parcela:antecipado`)

**Controle de desembolso (AnaliseCreditoPage + approve-credit)**
- Novos campos `desembolsado`, `desembolsado_em`, `desembolsado_por` na tabela `emprestimos`
- Card "Controle de Desembolso" visível apenas para admin/gerência
- Botão "Marcar Enviado" para empréstimos aprovados sem PIX automático
- `approve-credit` marca `desembolsado=true` automaticamente quando PIX é enviado com sucesso

**Renda mensal no cadastro de clientes (ClientesPage)**
- Campo `renda_mensal` migrado para tabela `clientes` (antes era apenas na análise)
- Input com formatação R$ x.xxx,xx e helpers `parseBRL`/`formatBRLValue`
- +60 pontos no score inicial quando renda é preenchida
- Auto-preenchimento na análise de crédito ao selecionar cliente

**CPF e formatação monetária (AnaliseCreditoPage)**
- CPF auto-formatado (000.000.000-00) ao digitar e ao selecionar cliente
- Valor solicitado e renda mensal com prefixo R$ e formatação pt-BR
- Score preenchido automaticamente do `scoreInterno` do cliente (Score Serasa removido)

**RPCs tipadas (database.types.ts)**
- `verificar_pendencias_cliente`, `verificar_pendencias_cliente_id`, `ajustar_score_cliente`
- Eliminação de erros TS em AnaliseCreditoPage e MainLayout

**Migration 041: renda_mensal + desembolso + score dinâmico**
- `ALTER TABLE clientes ADD renda_mensal NUMERIC(12,2) DEFAULT 0`
- `ALTER TABLE emprestimos ADD desembolsado BOOLEAN DEFAULT false, desembolsado_em TIMESTAMPTZ, desembolsado_por UUID`
- `CREATE FUNCTION ajustar_score_cliente(UUID, INTEGER, TEXT) RETURNS INTEGER`

### Arquivos criados/modificados

| Arquivo | Tipo | Alteração |
|---------|------|-----------|
| `supabase/migrations/041_renda_mensal_desembolso.sql` | Novo | renda_mensal, desembolsado, ajustar_score_cliente |
| `supabase/functions/webhook-efi/index.ts` | Modificado | Score adjustment on payment |
| `supabase/functions/webhook-woovi/index.ts` | Modificado | Score adjustment on payment |
| `supabase/functions/cron-notificacoes/index.ts` | Modificado | Score reduction on overdue |
| `supabase/functions/approve-credit/index.ts` | Modificado | desembolsado tracking |
| `src/app/lib/database.types.ts` | Modificado | RPC types + renda_mensal + desembolsado fields |
| `src/app/lib/view-types.ts` | Modificado | rendaMensal, desembolsado, desembolsadoEm |
| `src/app/lib/adapters.ts` | Modificado | Mapping renda + desembolsado |
| `src/app/pages/ClientesPage.tsx` | Modificado | Renda mensal R$ formatting, score calc |
| `src/app/pages/AnaliseCreditoPage.tsx` | Modificado | CPF format, R$ format, auto-fill, desembolso UI |
| `src/app/pages/DownloadPage.tsx` | Modificado | Version 1.1.0, changelog update |

---

## [8.5.0] — 2026-03-31

### Adicionado — PIX EFI (Cobranças + Desembolso) + Comprovantes + Configurações do Sistema

**Correção do fluxo PIX de desembolso (approve-credit)**
- Endpoint corrigido de `/v3/gn/pix/` para `/v2/gn/pix/:idEnvio`
- Removido `pix_key` hardcoded (`analise.cpf`) do frontend — agora usa a chave PIX do CNPJ cadastrada na tabela `clientes`
- Mapeamento de resposta EFI: campo `e2eId` (não `endToEndId`)
- Verificação automática de status pós-envio via `GET /v2/gn/pix/enviados/id-envio/:idEnvio` com delay de 5s
- Logging extensivo em cada etapa do fluxo PIX

**Comprovante PIX no WhatsApp (approve-credit)**
- Comprovante (e2eId, idEnvio, valor, data/hora) agora é SEMPRE anexado à mensagem — mesmo quando template do banco é usado
- Variável `{valor}` para templates usa `valorNum` (número sem prefixo "R$") para evitar duplicação "R$ R$ X,XX"
- Novas variáveis: `{valorNum}`, `{parcelaNum}` (sem formatação), `{valorFmt}`, `{parcelaFmt}` (com formatação)

**Sistema de cobranças automáticas EFI cobv (cron-notificacoes)**
- Reescrita completa da função `cron-notificacoes` com integração mTLS EFI
- Cria cobranças `cobv` (com vencimento) via `PUT /v2/cobv/:txid` 3 dias antes do vencimento
- Suporte a multa (2%) e juros (1%) configuráveis
- Gera QR Code via `GET /v2/loc/:id/qrcode` (base64 + pix-copia-e-cola)
- Envia QR Code como imagem via Evolution API `sendMedia` + texto com `{pixCopiaCola}`
- Reutiliza cobranças existentes (busca por `woovi_charge_id`) para notificações subsequentes
- Notificações por tier: 3 dias antes, dia do vencimento, 1 dia vencida, 3 dias vencida, 7+ dias vencida
- Variáveis de template: `{nome}`, `{valor}`, `{vencimento}`, `{parcela}`, `{total}`, `{pixCopiaCola}`
- Consulta `configuracoes_sistema` antes de processar — se `mensagens_automaticas_ativas` desabilitada, retorna sem processar

**Página de Configurações do Sistema (ConfigSistemaPage)**
- Nova página `/configuracoes/sistema` acessível para `admin` e `gerencia`
- Toggle: `mensagens_automaticas_ativas` — ativa/desativa cron-notificacoes e mensagens automáticas
- Toggle: `cobv_auto_ativa` — ativa/desativa criação automática de cobranças EFI cobv
- Inputs numéricos: `multa_percentual` e `juros_percentual` — configuração da multa e juros das cobranças
- Hook `useConfigSistema()` + `useUpdateConfig()` com React Query (invalidação automática)

**Gestão de Parcelas — PIX e comprovantes (GestaoParcelasPage)**
- Nova coluna "Ações" na tabela de parcelas:
  - Botão QrCode (roxo): gera cobrança cobv + envia QR e link PIX por WhatsApp
  - Botão CheckCircle (verde): abre modal para confirmar pagamento manual com upload de comprovante
  - Botão Image (azul): visualiza comprovante de parcela já paga
- Modal "Confirmar Pagamento Manual": upload de imagem (comprovante), salva no Supabase Storage bucket `comprovantes`, atualiza parcela com `comprovante_url`, `pagamento_tipo: 'manual'`, `confirmado_por`, `confirmado_em`
- Modal "Ver Comprovante": exibe imagem do comprovante com link para abrir em nova aba

**Kanban de Cobrança — Comprovantes obrigatórios (KanbanCobrancaPage)**
- Botão "Quitar" substituído por "Confirmar Pag." — agora EXIGE upload de comprovante
- Drag de parcela para coluna "pago" agora abre modal de comprovante em vez de quitar automaticamente
- Modal com upload de imagem, preview, e confirmação
- Comprovante salvo no Storage + URL vinculada à parcela
- Todas as parcelas do empréstimo são marcadas como pagas com `pagamento_tipo: 'manual'`

**Migration 033: configuracoes_sistema + comprovantes**
- Tabela `configuracoes_sistema` com campos `chave` (PK), `valor` (JSONB), `descricao`
- Seeds: `mensagens_automaticas_ativas`, `cobv_auto_ativa`, `multa_percentual`, `juros_percentual`
- Novos campos em `parcelas`: `comprovante_url`, `pagamento_tipo` (enum: pix/manual/boleto), `confirmado_por` (FK profiles), `confirmado_em`, `woovi_charge_id`
- RLS: autenticados podem ler configs; admin/gerencia podem atualizar

### Corrigido

- **Supabase types `never`**: queries e updates em `parcelas` com novas colunas usam cast `as any` para contornar tipagem `never` gerada pelo Supabase CLI (colunas adicionadas via migration ainda não refletidas nos types gerados)
- **Limite diário EFI**: identificado que contas Efí Pro têm limite de R$0.30/dia para envio PIX — solicitado aumento à EFI

### Pendente / Atenção

- ⚠️ **Retest approve-credit**: após EFI aumentar limite diário, retestar envio PIX de desembolso
- ⚠️ **Regenerar types Supabase**: executar `npx supabase gen types` para remover casts `as any` após atualizar types

### Arquivos criados/modificados

| Arquivo | Tipo | Alteração |
|---------|------|-----------|
| `supabase/functions/approve-credit/index.ts` | Modificado | PIX key fix, e2eId, status check, comprovante WhatsApp, valorNum |
| `supabase/functions/cron-notificacoes/index.ts` | Reescrito | EFI cobv, QR code, WhatsApp media, config check |
| `supabase/functions/efi/index.ts` | Modificado | extraHeaders, x-skip-mtls-checking, /v2 endpoint |
| `supabase/migrations/033_config_sistema_comprovantes.sql` | Novo | configuracoes_sistema + parcelas columns |
| `src/app/pages/ConfigSistemaPage.tsx` | Novo | Toggles mensagens + cobv, inputs multa/juros |
| `src/app/pages/GestaoParcelasPage.tsx` | Modificado | Coluna Ações com PIX/comprovante buttons + modais |
| `src/app/pages/KanbanCobrancaPage.tsx` | Modificado | Quitar→Confirmar Pag., comprovante obrigatório |
| `src/app/pages/AnaliseDetalhadaModal.tsx` | Modificado | Removido pix_key hardcoded |
| `src/app/pages/AnaliseCreditoPage.tsx` | Modificado | Removido pix_key hardcoded |
| `src/app/hooks/useConfigSistema.ts` | Novo | React Query hooks para configuracoes_sistema |
| `src/app/routes.tsx` | Modificado | Rota /configuracoes/sistema |
| `src/app/components/MainLayout.tsx` | Modificado | Nav entry Sistema (admin/gerencia) |

---

## [8.4.0] — 2026-03-30

### Adicionado — Mapa Interativo + Filtro por Cidade + Dados Reais de Empréstimo

**Mapa do Brasil com zoom e filtro por cidade (BrazilMap + ClientesPage)**
- Componente `BrazilMap` reescrito com zoom in/out/reset (botões + scroll do mouse)
- Pan (arrastar) no mapa com cursor grab, indicador de zoom em %
- Ao selecionar um estado, painel lateral de cidades aparece ao lado do mapa
- Lista de cidades com contagem de clientes por cidade
- Busca/filtro de cidades por texto no painel
- Opção "Todas as cidades" + destaque visual na cidade selecionada
- Barra inferior mostra filtro ativo: `SP → São Paulo` com botão Limpar
- Novo state `mapCityFilter` em ClientesPage com lógica de filtragem `matchesCity`
- Contagens `citiesInState` e `clientCountByCity` derivadas dos clientes

**Valor e vencimento derivados do empréstimo ativo**
- `clientesService.getClientes()` agora faz nested select incluindo empréstimos:
  `select('*, emprestimos(id, valor, parcelas, parcelas_pagas, proximo_vencimento, status)')`
- Adapter `dbClienteToView` sobrescreve `valor`, `vencimento` com dados do empréstimo
  ativo (status `ativo` ou `inadimplente`), em vez de usar os campos estáticos da tabela
- Novo tipo `ClienteComEmprestimos` em `database.types.ts`
- Novos campos opcionais `parcelasPagas` e `totalParcelas` na interface `Cliente`

**Referência de parcelas na listagem de clientes**
- Coluna "Valor" renomeada para "Empréstimo" (valor do empréstimo ativo)
- Coluna "Vencimento" renomeada para "Próx. Vencimento" (próxima data de vencimento)
- Nova coluna "Parcelas" mostrando `pagas/total` (ex: `2/6`)
- Clientes sem empréstimo ativo mostram "—" nas três colunas
- Mesma informação refletida na visualização em cards

### Arquivos modificados

| Arquivo | Alteração |
|---------|-----------|
| `src/app/components/BrazilMap.tsx` | Reescrito: zoom/pan, painel de cidades, props `selectedCity`/`onSelectCity`/`citiesInState`/`clientCountByCity` |
| `src/app/pages/ClientesPage.tsx` | `mapCityFilter`, `citiesInState`, `clientCountByCity`, `matchesCity`, colunas Empréstimo/Próx.Vencimento/Parcelas |
| `src/app/services/clientesService.ts` | Nested select com empréstimos em `getClientes()` |
| `src/app/lib/adapters.ts` | `dbClienteToView` enriquece valor/vencimento/parcelas do empréstimo ativo |
| `src/app/lib/view-types.ts` | `parcelasPagas?`, `totalParcelas?` adicionados à interface `Cliente` |
| `src/app/lib/database.types.ts` | Novo tipo `ClienteComEmprestimos` |

---

## [8.3.0] — 2026-03-30

### Adicionado — Pendências + Notificações Realtime + Endereço Detalhado

**Sistema de alerta de pendências (migration 031)**
- RPCs `verificar_pendencias_cliente` e `verificar_pendencias_cliente_id` para verificar
  pendências (empréstimos em atraso, parcelas vencidas) — alerta visual, não bloqueante
- Realtime: `ALTER PUBLICATION supabase_realtime ADD TABLE analises_credito`
- Notificações em tempo real no `MainLayout.tsx` para admin/gerência em novas análises
- Som `alarme.mp3` + toast com dados da análise
- Toggle de modo silencioso (ícone Volume2/VolumeX) com persistência `localStorage`
  (`fd-silencioso`) e `silenciosoRef` (useRef) para evitar stale closure

**Exclusão de parcelas restrita a admin (GestaoParcelasPage)**
- Botão de deletar parcela visível apenas para role `admin`

**Endereço detalhado de clientes (migration 032)**
- Novos campos: `rua`, `numero`, `bairro`, `estado` (CHAR 2), `cidade`, `cep`
- Formulário de criação/edição com IBGE API para carga de cidades por UF
- Estado via Select, cidade via Combobox (Command + Popover) com busca
- CEP com auto-formatação `#####-###`
- Flag `estadoUserChanged` para preservar cidade no modo edição
- Campos `vencimento` e `limiteCredito` removidos do formulário (pertencem à Análise de Crédito)

**Mapa do Brasil (BrazilMap + ClientesPage)**
- Componente `BrazilMap.tsx` com SVG `br.svg` inline
- Mapeamento `SVG_ID_TO_UF` (BRAC→AC, etc.) com click/hover handlers
- Paleta roxa: selecionado `#6366f1`, com clientes `#818cf8`, vazio `#c4b5fd`, hover `#a855f7`
- Tooltip com UF e contagem de clientes
- Integrado ao ClientesPage com toggle (botão MapPin), `mapStateFilter` e `clientCountByState`
- Filtro por estado na listagem: `matchesState`

### Arquivos criados/modificados

| Arquivo | Tipo |
|---------|------|
| `supabase/migrations/031_bloquear_cliente_pendente.sql` | Migration |
| `supabase/migrations/032_endereco_detalhado_clientes.sql` | Migration |
| `src/app/assets/sounds/alarme.mp3` | Asset |
| `src/app/assets/br.svg` | Asset |
| `src/app/components/BrazilMap.tsx` | Novo componente |
| `src/app/components/MainLayout.tsx` | Realtime + silent mode |
| `src/app/pages/GestaoParcelasPage.tsx` | Admin-only delete |
| `src/app/pages/ClientesPage.tsx` | Endereço + mapa |
| `src/app/lib/view-types.ts` | Campos de endereço |
| `src/app/lib/database.types.ts` | Campos de endereço |
| `src/app/lib/adapters.ts` | Mapeamento de endereço |

---

## [8.2.0] — 2026-03-26

### Adicionado — Profissão + Pagamento Configurável

**Campo Profissão no cadastro de clientes**
- Novo campo `profissao` na tabela `clientes` (migration 027)
- Campo adicionado ao formulário de criação/edição em ClientesPage
- Placeholder com exemplos: "Engenheiro, Médico, Autônomo..."

**Verificação de profissão no link de identidade**
- VerifyIdentityPage agora coleta profissão no passo `address_refs`
- Novo campo `profissao_informada` na tabela `identity_verifications`
- Valor salvo no audit log junto com os demais dados

**Auto-rejeição por divergência de profissão**
- AnaliseDetalhadaModal compara profissão do cadastro vs. verificação (case-insensitive)
- Se divergir: auto-rejeita a verificação E a análise de crédito automaticamente
- Visual: grid comparativo com alerta vermelho na aba Verificação
- Log com action `profession_mismatch_auto_rejected`
- Ref `autoRejectedRef` previne execução duplicada

**Modal "Efetuar Pagamento" (EmprestimosAtivosPage)**
- Substituídos botões inline (Quitar/Parcial) por botão único "Pagar" que abre dialog
- Abas: **Pagamento Completo** e **Pagamento Parcial**
- Campos: Vencimento (readonly), Data de pagamento, Dias de atraso (auto-calculado)
- Valores: Valor Parcela, Valor Corrigido (original + juros + multa), Desconto, Total a pagar
- Aba parcial: campo "Valor a Pagar" + "Restante" calculado
- Observação (textarea) e Conta Bancária (dropdown)
- Aviso "Última parcela deste empréstimo" quando `pendentesCount <= 1`
- Novos campos `observacao`, `conta_bancaria` na tabela `parcelas` (migration 027)

### Corrigido — Segurança IP

- Removida exibição de IPs permitidos nas mensagens de bloqueio (AuthContext)
- Mensagem agora mostra apenas "Contate o administrador" em vez de listar os IPs autorizados
- Impede que usuários não-autorizados descubram quais IPs têm acesso

---

## [8.1.0] — 2026-03-23

### Corrigido — Estabilidade de Autenticação + Electron

**Login com verificação de IP (AuthContext)**
- **Race condition SIGNED_IN vs IP check**: `signInWithPassword()` disparava `onAuthStateChange(SIGNED_IN)` que setava o user e carregava o dashboard ANTES da verificação de IP terminar. Se o IP falhava, o `signOut()` derrubava tudo — o usuário via o dashboard flash e depois era expulso
- **Fix**: `loginInProgressRef` bloqueia o handler `onAuthStateChange(SIGNED_IN)` enquanto `login()` está em andamento. O handler aguarda 200ms antes de agir para evitar race com `login()` prestes a iniciar. O user agora é setado manualmente por `login()` após validação de IP
- **Comparação INET corrigida**: coluna `ip_address` é tipo `INET` (PostgreSQL) que pode retornar `"138.118.29.138/32"`. Agora usa RPC `check_ip_allowed()` para comparação INET nativa no banco em vez de comparação string em JS
- **`signOut({ scope: 'local' })`**: as chamadas de signOut por IP bloqueado usavam `scope: global` (padrão) que invalidava TODAS as sessões no servidor. Agora usa `scope: 'local'` (limpa apenas o client)
- **Detecção de IP falha não bloqueia**: se `api.ipify.org` e `ifconfig.me` estiverem offline, o login é permitido com aviso no console
- **Mensagem de erro detalhada**: mostra o IP detectado E os IPs permitidos na mensagem de bloqueio
- **Dupla camada de IP**: sistema global (`allowed_ips` table) + restrição por usuário (`profiles.allowed_ips` column)

**Sessão restaurada com JWT expirado (AuthContext)**
- `INITIAL_SESSION` com JWT expirado causava: user setado → ActivityTracker disparava → 401 → SIGNED_OUT → logout
- Fix: valida `session.expires_at` antes de confiar na sessão restaurada. Se expirado, aguarda 3s para auto-refresh e re-verifica

**fetchProfile com timeout (AuthContext)**
- No Electron, `fetchProfile` podia travar indefinidamente por conflito de sessão
- Fix: timeout de 8s com `Promise.race` + logs detalhados em cada etapa

**ActivityTracker resiliente (useActivityTracker)**
- Aguarda 1.5s antes de iniciar (permite auto-refresh do JWT completar)
- Verifica sessão válida via `getSession()` antes de chamar DB
- Todas as chamadas (`iniciarSessao`, `updateFuncionarioStatus`, `heartbeatFull`, `atualizarSessao`) envolvidas em `.catch()` — nunca crasham

**Electron — IP check no login pulado**
- No Electron, o IP já é validado pelo `ip-guard.cjs` no startup do app (antes da janela abrir)
- A verificação de IP no `login()` é desabilitada quando `window.electronAPI` existe, evitando travamento por conflito de requisições no custom protocol `app://`

**Electron — Zoom CSS corrigido**
- `html { zoom: 0.9 }` causava espaço vazio na parte inferior da janela Electron (conteúdo renderizava a 90% mas o viewport era 100%)
- Fix: classe `html.electron-app { zoom: 1 }` desativa zoom CSS. Em vez disso, `webFrame.setZoomFactor(0.9)` no preload aplica zoom correto a nível do Chromium (sem espaço vazio)
- No browser/Vercel, `zoom: 0.9` via CSS continua funcionando normalmente

**Migration 022 — UPDATE policy para sessoes_atividade**
- `iniciarSessao()` precisa fechar sessões órfãs (UPDATE `fim` e `duracao`)
- `atualizarSessao()` precisa atualizar `acoes` e `paginas_visitadas`
- Policy `sessoes_update` permite UPDATE apenas em registros do próprio funcionário

---

## [8.0.0] — 2025-07-09

### Removido — Chat Geral

- Removida aba "Chat Geral" do menu lateral (`MainLayout.tsx`)
- Removida rota `/chat` e importação de `ChatPage` (`routes.tsx`)
- Deletado arquivo `ChatPage.tsx`
- Links `/chat?phone=` redirecionados para `/whatsapp?telefone=` em `EmprestimosAtivosPage`, `ClienteAreaPage`, `RedeIndicacoesPage`
- Shortcut do PWA alterado de "Chat" para "WhatsApp" (`manifest.json`)
- `FloatingChat` (chat interno da equipe) mantido — é componente separado

---

### Adicionado — Sistema de IP Whitelist + App Desktop (Electron)

Controle de acesso baseado em IP para restringir uso do sistema a redes autorizadas, com aplicativo desktop empacotado via Electron.

#### Arquitetura Geral

```
Funcionário → verificador-digital.vercel.app/download
  → Vercel Edge Middleware extrai IP do request
  → Chama Supabase Edge Function check-ip
  → check_ip_allowed(INET) verifica tabela allowed_ips
  → IP autorizado? → Serve página de download
  → IP bloqueado? → Retorna 404 (página não existe)

Funcionário baixa .exe/.dmg → Abre app Electron
  → Main process verifica IP via check-ip (startup)
  → IP autorizado → Abre janela principal + inicia sessão de uso
  → IP bloqueado → dialog.showErrorBox() + app.quit()
  → Sessão ativa → ping a cada 60s para rastrear tempo de uso
```

#### Supabase — Migrations 019-021

**Tabelas criadas:**

| Tabela | Campos principais | Descrição |
|--------|------------------|-----------|
| `allowed_ips` | `ip_address` (INET), `label`, `added_by`, `active` | IPs autorizados |
| `emergency_tokens` | `token` (text), `created_by`, `used_by_ip`, `expires_at` | Tokens de emergência (15 min) |
| `app_usage_sessions` | `user_id`, `ip_address`, `machine_id`, `started_at`, `ended_at`, `last_ping_at`, `duration_sec` (GENERATED) | Sessões de uso do desktop |

**Funções SQL:**

- `check_ip_allowed(INET)` → retorna `boolean` — verifica se IP está ativo na whitelist
- `redeem_emergency_token(token, ip, label)` → marca token como usado, insere IP na whitelist automaticamente

**RLS:** Admins podem gerenciar tudo; usuários autenticados podem ler IPs ativos; `service_role` bypassa RLS

**Notas de deploy:**
- Migration 019 falhou parcialmente (tabela `allowed_ips` criada, resto falhou por `gen_random_bytes` sem schema)
- Corrigido com `extensions.gen_random_bytes(32)` (pgcrypto no schema `extensions` no Supabase hosted)
- Migrations 020 e 021 são reparos idempotentes (`CREATE TABLE IF NOT EXISTS`, `DROP POLICY IF EXISTS`)

#### Supabase Edge Function — `check-ip`

Arquivo: `supabase/functions/check-ip/index.ts`
Deploy: `supabase functions deploy check-ip --no-verify-jwt`

| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/check-ip` | GET/POST | Valida IP (extrai de headers ou body) |
| `/check-ip/redeem` | POST | Resgata token de emergência + adiciona IP |

Headers de IP suportados: `x-real-ip`, `cf-connecting-ip`, `x-forwarded-for`

#### Vercel Edge Middleware

Arquivo: `middleware.ts` (raiz do projeto)

- Intercepta rotas `/download` e `/download/*`
- Extrai IP real do request (x-real-ip → cf-connecting-ip → x-forwarded-for)
- Chama `check_ip_allowed()` via Supabase RPC com `SUPABASE_SERVICE_ROLE_KEY`
- IP permitido → passa request (return undefined)
- IP bloqueado → retorna `Response(null, { status: 404 })`
- Sem dependência de `@vercel/edge` (usa Web APIs puras — compatível com Vite)

**Variáveis de ambiente necessárias no Vercel:**
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

#### Páginas do Frontend

| Página | Rota | Acesso | Descrição |
|--------|------|--------|-----------|
| `IpWhitelistPage` | `/configuracoes/ip-whitelist` | Admin | 3 abas: IPs (CRUD), Tokens (gerar/copiar), Sessões (tabela) |
| `DownloadPage` | `/download` | Público (filtrado por middleware) | Botões de download para Windows, macOS, Linux |
| `EmergencyTokenPage` | `/emergency?token=...` | Público | Resgate de token de emergência, auto-submit se token na URL |

#### Service + Hooks

- `ipWhitelistService.ts` — CRUD completo para `allowed_ips`, `emergency_tokens`, `app_usage_sessions`
- `useIpWhitelist.ts` — React Query hooks (`useAllowedIps`, `useAddAllowedIp`, `useToggleAllowedIp`, `useDeleteAllowedIp`, `useEmergencyTokens`, `useCreateEmergencyToken`, `useAppUsageSessions`)
- `useTauriIpGuard.ts` → renomeado para `useDesktopIpGuard` — detecta `window.electronAPI`, fallback para fetch no browser

#### Electron — App Desktop

Substituiu Tauri (requeria Rust/Cargo). Electron roda em Node.js.

**Estrutura:**
```
electron/
  main.cjs          — Main process: janela, IPC handlers, IP check no startup
  preload.cjs       — contextBridge: expõe electronAPI ao renderer
  ip-guard.cjs      — get IP via ipify + check contra Supabase edge function
  encrypted-storage.cjs — AES-256-GCM com chave derivada de fingerprint da máquina
  usage-tracker.cjs  — Machine ID determinístico (SHA-256 de hostname+platform+arch+cpu+ram)
```

**Configuração (electron-builder.json):**
- Windows: NSIS installer (`.exe`)
- macOS: DMG (`.dmg`)
- Linux: AppImage (`.AppImage`)
- `appId`: `com.fintechdigital.app`

**IP Guard (main process):**
1. `app.whenReady()` → chama `checkIpWhitelist()` antes de criar janela
2. IP bloqueado → `dialog.showErrorBox()` + `app.quit()`
3. IP permitido → `createWindow()` com BrowserWindow (1400×900, sem barra de endereço)

**Encrypted Storage:**
- Algoritmo: AES-256-GCM (Node.js `crypto`)
- Chave: SHA-256 de `hostname|platform|arch|cpuModel` + salt `fintech-digital-v1`
- Formato do arquivo: `[12-byte nonce][16-byte auth tag][encrypted data]`
- Diretório: `app.getPath('userData')/encrypted/`

**Scripts (package.json):**
- `npm run electron:dev` — Abre Electron apontando para `localhost:5173`
- `npm run electron:build` — Build Vite + empacota com electron-builder

**Preload (contextBridge):**
```
window.electronAPI.checkIpWhitelist(url, key)
window.electronAPI.getCurrentIp()
window.electronAPI.getMachineId()
window.electronAPI.encryptAndSave(name, base64data)
window.electronAPI.loadAndDecrypt(name)
window.electronAPI.deleteEncrypted(name)
```

#### Sidebar

- Adicionado item "IP Whitelist" no menu CONFIGURAÇÕES (ícone `Shield`, apenas admin)

---

## [7.6.0] — 2026-03-19

### Corrigido — Safari iOS: Upload de Verificação de Identidade

**Problema: WebKitBlobResource error 1 + "new row violates RLS"**
O Safari iOS faz garbage collection agressivo de Blob backing-data quando o dispositivo está sob pressão de memória.
Com 2 vídeos + 3 imagens mantidos em estado React ao longo de 7 etapas do wizard, os blobs eram purgados antes do upload final — causando `StorageUnknownError: Load failed`.

**Upload Progressivo** (`VerifyIdentityPage.tsx`)
- Cada arquivo agora é enviado ao Supabase Storage **imediatamente após captura** — não espera o passo de revisão
- `uploadToStorage()`: lê o Blob inteiro para `ArrayBuffer` antes de chamar `.upload()` — `ArrayBuffer` vive no heap JS e é imune ao WebKit blob GC
- Removidas variáveis de estado `videoBlob`, `docFront`, `docBack`, `proofOfAddress`, `residenceVideoBlob`
- Novo estado `uploadedPaths: { video?, docFront?, docBack?, proofOfAddress?, residenceVideo? }` rastreia paths no storage
- Novo estado `uploadingFile` para indicadores de loading por etapa
- `handleSubmit` reduzido a apenas `.update()` no banco + audit log (sem uploads)
- **Retry automático** com backoff exponencial (3 tentativas, 2s/4s) para redes móveis instáveis
- Tolerância a "resource already exists" — trata como sucesso e continua
- `chunksRef.current = []` após criar Blob — libera memória dos chunks imediatamente

**Botões de navegação atualizados**
- "Próximo" desabilitado até upload concluir (`!uploadedPaths.X || uploadingFile === 'X'`)
- Spinner "Enviando..." durante upload progressivo em cada etapa
- "Regravar" desabilitado durante upload

**Storage RLS (Migrations 016-018)**
- Migration 016: política UPDATE para `anon` em `storage.objects` (bucket `identity-verification`)
- Migration 017: política DELETE para `anon` em `storage.objects` (necessário para regravar)
- Migration 018: corrigido conflito entre policy `identity_verif_upload` (migration 012, requeria `authenticated`) e `identity_verif_anon_upload` (migration 014). Dropada policy restritiva e recriada sem filtro de role

**Cache Headers** (`vercel.json`)
- `index.html` → `no-cache, no-store, must-revalidate` (nunca serve JS velho)
- `/assets/*` → `public, max-age=31536000, immutable` (hashed assets com cache longo)

### Adicionado — Tutorial Intro com Animações Lottie

**Multi-step tutorial** (`VerifyIdentityPage.tsx`)
- Intro reescrita como carrossel de 4 slides com animações Lottie:
  1. **Boas-vindas** (`flow-loader.json`) — Apresentação do processo
  2. **Selfie e Documentos** (`selfie.json`) — Gravação de vídeo + upload de CNH/RG
  3. **Endereço e Referências** (`data.json`) — Comprovante + dados + 3 contatos
  4. **Revisão e Envio** (`sent.json`) — Vídeo fachada + revisão final
- Indicadores de progresso com dots animados (clicáveis)
- Navegação Voltar/Próximo com transição entre slides
- Último slide mostra botão "Começar Verificação"

---

## [7.5.0] — 2026-03-19

### Adicionado — Deploy Vercel + Correções Verificação de Identidade

**Deploy na Vercel**
- Projeto hospedado em `https://fintechdigital.vercel.app` com HTTPS nativo
- Criado `vercel.json` com rewrite `/*` → `/index.html` para SPA routing
- SITE_URL fallback atualizado na edge function `send-verification-link` para o novo domínio

**Verificação de Identidade — Fluxo de Câmera Reescrito**

Edge Function `send-verification-link/index.ts`:
- Reescrita completa: email OTP → envio de link via WhatsApp (Evolution API)
- Todas as respostas HTTP agora retornam 200 com `{ success: true/false }` (compatibilidade com `supabase.functions.invoke`)
- Fallback CPF: se `cliente_id` for NULL, busca cliente pelo CPF e vincula automaticamente
- Busca de instância WhatsApp: `select("*")` + `.find()` em memória (evita falha do PostgREST com enums)
- Payload Evolution API v1/v2: `{ number, textMessage: { text }, text }`
- Normalização DDI 55 para números de 10-11 dígitos
- Timeout/abort handling com mensagens de erro detalhadas

`AnaliseCreditoPage.tsx` & `KanbanAnalisePage.tsx`:
- `handleSendMagicLink` reescrito para chamar edge function via `supabase.functions.invoke`
- Formulário de criação envia `cliente_id` corretamente
- Removidos hooks de verificação não utilizados

`VerifyIdentityPage.tsx` — Gravação de Vídeo (reescrita completa):
- **getUserMedia no gesto do usuário**: câmera abre imediatamente no tap (exigência do Safari iOS)
- **Countdown anti-fraude** (3-5s aleatório): câmera mostra preview, frase só aparece ao iniciar gravação
- **Frase oculta**: exibida somente durante gravação (`isRecording`); antes mostra "🔒 A frase será exibida quando iniciar a gravação"
- **Diagnóstico de câmera detalhado**: `NotAllowedError`, `NotFoundError`, `NotReadableError`, `OverconstrainedError` — cada um com mensagem específica
- **Detecção de HTTPS**: verifica `window.location.protocol` e `navigator.mediaDevices` antes de chamar getUserMedia
- **Detecção de navegador in-app**: regex para WhatsApp/Instagram/Facebook/etc com botão "Copiar Link" ou "Abrir no Chrome" (Android intent scheme)
- **Instruções visuais por plataforma**: passo-a-passo para liberar câmera no iPhone (Ajustes → Safari → Câmera) e Android (cadeado → Permissões)
- **Botão "Tentar Novamente"**: não desabilita mais após falha, permite retry após liberar permissão
- Removido: fallback de upload de vídeo por arquivo (vulnerável a deepfake/manipulação por IA)

Migration `014_anon_verification_access.sql`:
- Políticas RLS para acesso anônimo na página de verificação (analise_id como fator de autenticação)
- `verif_anon_select` (status pending/retry_needed), `verif_anon_update` (status pending)
- `verif_logs_anon_insert`, `identity_verif_anon_upload`, `identity_verif_anon_select`
- Sessão Supabase removida da VerifyIdentityPage (cliente acessa sem auth)

Edge Function `approve-credit/index.ts`:
- Sem alterações nesta versão (deploy mantido)

### Alterado

**UI — Zoom Padrão 0.90**
- `html { zoom: 0.9 }` adicionado em `theme.css` — reduz escala visual da aplicação inteira

**Migrations 009-014 consolidadas e deployadas**
- Todas as 14 migrations idempotentes e sincronizadas com Supabase remoto
- Correção de trigger function name, enums RLS, referências a auth.users

---

## [7.4.0] — 2026-03-19

### Adicionado — Verificação de Identidade para Análise de Crédito

**Migration 012** (`supabase/migrations/012_identity_verification.sql`)
- Enum `verification_status` (`pending`, `approved`, `rejected`, `retry_needed`)
- Tabela `identity_verifications` (vídeo-selfie, documentos frente/verso, frase de verificação, status, análise por, motivo de recusa, contagem de retentativas, magic link)
- Tabela `verification_logs` (auditoria completa de todas as ações: envio de link, upload, aprovação, rejeição, retentativa)
- Bucket de Storage `identity-verification` (30 MB, `video/*` + `image/*`)
- Políticas RLS para ambas as tabelas + Storage
- Colunas adicionadas em `analises_credito`: `verification_required BOOLEAN`, `verification_id UUID`

**Edge Functions**
- `send-verification-link/index.ts` — Envia magic link por e-mail via `auth.signInWithOtp()`. Cria registro de verificação com frase aleatória. Valida role (admin/gerência), verifica contagem de retentativas (máx 3). Expira em 48h
- `approve-credit/index.ts` — Aprova crédito, cria empréstimo e dispara pagamento Pix via Woovi. Valida verificação aprovada, impede auto-análise. Pagamento Pix é não-bloqueante (falha permite retry)

**identityVerificationService.ts** (novo service)
- `getVerificationById()`, `getVerificationsByAnalise()`, `getVerificationsByStatus()`, `getPendingVerifications()`
- `createVerification()`, `updateVerification()`
- `getVerificationLogs()`, `createVerificationLog()`
- `uploadVerificationFile()`, `getSignedUrl()` (Storage signed URLs)

**useIdentityVerification.ts** (novo hook — 9 hooks)
- `useVerification(id)`, `useVerificationsByAnalise(analiseId)`, `useVerificationsByStatus(status)`, `usePendingVerifications()`
- `useCreateVerification()`, `useUpdateVerification()`
- `useVerificationLogs(verificationId)`, `useCreateVerificationLog()`
- `useUploadVerificationFile()`

**VerifyIdentityPage.tsx** (nova página pública — `/verify-identity`)
- Wizard multi-etapa: loading → intro → vídeo → documentos → revisão → enviado → erro → expirado
- Gravação de vídeo-selfie via MediaRecorder API (mín 5s, máx 30s)
- Upload de documentos (frente e verso, máx 5MB, JPG/PNG/WebP)
- Frase de verificação exibida durante gravação
- Verificação de expiração de magic link (48h)
- Acessada via magic link — sem autenticação de sidebar

**AnaliseDetalhadaModal.tsx** (novo componente)
- Modal com 3 abas: Dados da Análise / Verificação / Histórico
- Player de vídeo com signed URLs do Storage
- Visualização lado a lado dos documentos (frente/verso)
- Botões de aprovar/rejeitar/solicitar retentativa
- Formulário de motivo de rejeição e nova frase de retentativa
- Timeline de auditoria completa
- Regras de negócio: impede auto-análise, máx 3 retentativas, auto-recusa após 3 rejeições

### Alterado

**AnaliseCreditoPage.tsx**
- Modal de detalhes substituído por `AnaliseDetalhadaModal` com abas de verificação
- Botão Shield (Verificação) adicionado nas ações da tabela
- Função `handleSendMagicLink` para enviar link de verificação via Edge Function

**KanbanAnalisePage.tsx**
- Dialog de detalhes substituído por `AnaliseDetalhadaModal`
- Botão de envio de magic link integrado nos cards do Kanban

**database.types.ts**
- Tipo `VerificationStatus` adicionado
- Tabelas `identity_verifications` e `verification_logs` na interface Database
- Campos `verification_required` e `verification_id` na tabela `analises_credito`

**view-types.ts**
- Interfaces `IdentityVerification` e `VerificationLog` adicionadas

**adapters.ts**
- Funções `dbIdentityVerificationToView()` e `dbVerificationLogToView()` adicionadas

**routes.tsx**
- Rota pública `/verify-identity` adicionada (standalone, fora do MainLayout)

---

## [7.3.1] — 2026-03-18

### Alterado — FloatingChat: Combobox Pesquisável (CPF + Nome)

**FloatingChat.tsx**
- Seletores de cliente e empréstimo no modo "atenção" substituídos por `SearchableCombobox`
- Busca em tempo real por nome, CPF e telefone (clientes) ou nome, CPF e valor (empréstimos)
- Implementado com `cmdk` (`Command`, `CommandInput`, `CommandList`, `CommandItem`) dentro de Radix UI `Popover`
- `PopoverContent` com `side="top"` para abrir para cima sem sobrepor borda inferior do widget
- Valor de cada `CommandItem` definido como `"${label} ${sub}"` para match unificado por nome + CPF no mesmo campo

---

## [7.3.0] — 2026-03-18

### Adicionado — Chat Interno + FloatingChat Widget

**Migration 011** (`supabase/migrations/011_chat_interno_audio_atencao.sql`)
- Adiciona colunas `tipo TEXT DEFAULT 'texto'` e `metadata JSONB DEFAULT '{}'` à tabela `chat_interno`
- Tipos de mensagem: `texto`, `audio`, `atencao_cliente`, `atencao_emprestimo`
- Cria bucket de Storage `chat-audio` para arquivos `audio/webm;codecs=opus`

**FloatingChat.tsx** (novo componente — `src/app/components/FloatingChat.tsx`)
- Widget flutuante `fixed bottom-6 right-6 z-50`, tamanho `w-96 h-[580px]`
- Views: `contacts` (lista de conversas), `chat` (mensagens 1-a-1), `atencao` (admin — criar card de atenção)
- `AudioPlayerInline`: player inline com waveform de 20 barras (`WAVE_BARS`), animação play/pause
- `MsgBubble`: renderização de 4 tipos de mensagem com estilos distintos por tipo
- Mensagens enviadas: gradiente indigo → violeta; recebidas: glass (bg-white/10 + backdrop-blur)
- Cards `atencao_cliente`: âmbar (amber-100/amber-800)
- Cards `atencao_emprestimo`: laranja-vermelho (orange-100/red-800)
- Deep links em cards: `atencao_cliente` → `/clientes?clienteId=`, `atencao_emprestimo` → `/clientes/emprestimos?emprestimoId=`
- View de criação de cartão de atenção (admin only) — seleção de tipo, cliente/empréstimo, envio
- Supabase Realtime (INSERT subscription em `chat_interno`) para mensagens em tempo real

**useAudioRecorder.ts** (novo hook — `src/app/hooks/`)
- `startRecording()` / `stopRecording()` via MediaRecorder API
- Formato de gravação: `audio/webm;codecs=opus`
- Upload do blob para Supabase Storage bucket `chat-audio`

**chatInternoService.ts** (novo service — `src/app/services/`)
- CRUD completo + Realtime subscription para tabela `chat_interno`

**useChatInterno.ts** (novo hook — `src/app/hooks/`)
- React Query hooks: conversas, mensagens, enviar mensagem, marcar como lida

**ClientesPage.tsx**
- Leitura de `?clienteId=` via `useSearchParams` + `useEffect`
- Auto-abre dialog do cliente ao navegar via deep link do FloatingChat

**EmprestimosAtivosPage.tsx**
- Leitura de `?emprestimoId=` via `useSearchParams` + `useEffect`
- Auto-abre modal do empréstimo ao navegar via deep link do FloatingChat

**ChatPage.tsx** (atualizado)
- Modo equipe com `AudioPlayerInline` e `MsgBubble` idênticos ao FloatingChat
- Gradientes enviado/recebido e cards de atenção compatíveis

### Corrigido

- **FloatingChat.tsx:** Overflow de mensagens corrigido com wrapper `flex flex-col flex-1 min-h-0` na área de mensagens

---

## [7.2.0] — 2026-03-18

### Adicionado — Página de Pagamentos Woovi

**PagamentosWooviPage.tsx** (nova página)
- Rota: `/pagamentos/woovi` · Acesso: admin, gerência
- Tab **Cobranças**: lista com filtro por status (ACTIVE/COMPLETED/EXPIRED), busca, QR Code modal, cancelar
- Tab **Transações**: recebimentos, pagamentos, splits, saques com ícones e cores diferenciadas
- Tab **Subcontas**: subcontas de indicadores com saldo e total recebido
- Modal Nova Cobrança: selecionar cliente, valor, descrição
- Modal Nova Subconta: selecionar cliente indicador, nome, CPF, chave Pix
- Modal Visualizar QR Code: exibe `PixQRCode` da cobrança ativa
- Hooks utilizados: `useCobrancasWoovi`, `useTransacoesWoovi`, `useSubcontasWoovi`, `useSaldoWoovi`, `useCriarCobrancaWoovi`, `useCriarSubcontaWoovi`, `useCancelarCobrancaWoovi`, `useSacarSubcontaWoovi`

**routes.tsx**
- Nova rota `/pagamentos/woovi → PagamentosWooviPage`

**MainLayout.tsx / Sidebar**
- Nova seção **PAGAMENTOS** com item "Pagamentos Pix" → `/pagamentos/woovi` (acesso: admin, gerência)

---

## [7.1.0] — 2026-03-17

### Adicionado — Kanban Cobrança: Negociação Pix + Normalização Telefone

**KanbanCobrancaPage.tsx**
- Geração de cobrança Pix (Woovi, 24h) diretamente no modal de negociação
- Fluxo: valor acordado → "Gerar Pix (24h)" → QR Code + link copiável + BRCode exibidos no modal
- Substituição automática de `{link_pix}` em templates de mensagem ao gerar cobrança
- Função `normalizePhoneBR()`: adiciona DDI `55` a números com 10–11 dígitos sem prefixo internacional
- Normalização aplicada em: envio WhatsApp Business, abertura `wa.me`, navegação `/whatsapp?telefone=`
- Hook adicionado: `useCriarCobrancaWoovi` de `../hooks/useWoovi`

**send-whatsapp/index.ts (Edge Function)**
- Normalização automática de DDI 55 no backend: números com 10–11 dígitos sem `55` recebem prefixo `"55"`
- Regras: fixo (10 dígitos) e celular com 9º dígito (11 dígitos) → `55` prefixado; 12–13 dígitos mantidos intactos
- Números `@lid` (WhatsApp internal): bypass, enviados como estão

---

## [7.0.0] — 2026-03-16

### Adicionado — Integração Woovi (OpenPix) — Pagamentos Pix

**Migration 008** (`supabase/migrations/008_woovi_integration.sql`)
- Enums: `woovi_charge_status`, `woovi_transaction_status`, `woovi_transaction_type`
- Tabelas: `woovi_charges`, `woovi_transactions`, `woovi_subaccounts`, `woovi_webhooks_log`
- Colunas adicionadas em `clientes`: `pix_key`, `pix_key_type`
- Coluna adicionada em `parcelas`: `woovi_charge_id`
- Função RPC: `get_woovi_dashboard_stats()`

**Edge Functions**
- `woovi/index.ts`: API Gateway Woovi com 11 actions — `create_charge`, `get_charge`, `list_charges`, `delete_charge`, `create_payment`, `get_balance`, `create_subaccount`, `get_subaccount`, `withdraw_subaccount`, `get_transactions`, `get_stats`
- `webhook-woovi/index.ts`: receptor de webhooks Woovi. Valida `x-webhook-secret`. Eventos: `CHARGE_COMPLETED` (marca parcela paga, split indicador), `CHARGE_EXPIRED`, `TRANSACTION_RECEIVED`, `TRANSACTION_REFUND_RECEIVED`

**wooviService.ts** (novo service)
- Cobranças: `criarCobranca`, `consultarCobranca`, `cancelarCobranca`, `getCobrancas`, `getCobrancaById`, `getCobrancasByParcela`, `getCobrancasByCliente`
- Pagamentos/Saldo: `liberarEmprestimoPix`, `getSaldo`, `getWooviStats`
- Subcontas: `criarSubconta`, `consultarSubconta`, `sacarSubconta`, `getSubcontas`
- Transações: `getTransacoes`, `getTransacoesByEmprestimo`
- Realtime: `subscribeToCharges`, `subscribeToTransactions`

**useWoovi.ts** (novo hook — React Query)
- 12 queries + 6 mutations
- Polling: cobranças (30s), saldo/stats (60s), transações (30s)
- Realtime via `subscribeToCharges` e `subscribeToTransactions`

**Componentes UI**
- `WooviSaldoCard`: card dashboard — saldo, cobranças ativas/pagas, total recebido, subcontas
- `PixQRCode`: QR Code Pix, BRCode copiável, link de pagamento, status, expiração

**Ambientes**
- Sandbox (padrão): `https://api.woovi-sandbox.com/api/v1`
- Produção: `https://api.openpix.com.br/api/v1` (via secret `WOOVI_API_URL`)
- Secrets requeridos em Edge Functions: `WOOVI_APP_ID`, `WOOVI_WEBHOOK_SECRET`, `WOOVI_API_URL`

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
