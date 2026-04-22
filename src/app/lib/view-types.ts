/**
 * @module view-types
 * @description Interfaces TypeScript do domínio — tipos camelCase usados pelas
 * páginas e hooks. Os serviços retornam dados do Supabase em snake_case;
 * adapters.ts faz a conversão para estes tipos.
 *
 * @see database.types para tipos DB (snake_case)
 * @see adapters.ts para funções de conversão
 */

/**
 * Usuário autenticado do sistema.
 * @property role - Papel no RBAC: admin, gerencia, cobranca, comercial ou cliente
 */
export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'gerencia' | 'cobranca' | 'comercial' | 'cliente';
  avatar?: string;
}

/**
 * Funcionário da empresa com métricas de atividade.
 * Usado no módulo de Monitoramento e Produtividade da equipe.
 * @property status - Estado atual: online, offline ou ausente
 * @property horasHoje/horasSemana/horasMes - Horas trabalhadas acumuladas
 * @property sessoes - Array de sessões de atividade registradas
 */
export interface Funcionario {
  id: string;
  userId: string;
  nome: string;
  email: string;
  role: 'admin' | 'gerencia' | 'cobranca' | 'comercial';
  status: 'online' | 'offline' | 'ausente';
  ultimoLogin: string;
  ultimaAtividade: string;
  horasHoje: number;
  horasSemana: number;
  horasMes: number;
  atividadesHoje: number;
  metaDiaria: number;
  sessoes: SessaoAtividade[];
}

/**
 * Sessão de atividade de um funcionário.
 * Cada sessão registra início, fim (opcional se ainda ativa),
 * duração em minutos, número de ações e páginas visitadas.
 */
export interface SessaoAtividade {
  id: string;
  funcionarioId: string;
  inicio: string;
  fim?: string;
  duracao: number; // minutos
  acoes: number;
  paginas: string[];
}

/**
 * Cliente da financeira com dados completos.
 * @property sexo - Gênero para personalização de mensagens WhatsApp (Sr./Sra.)
 * @property scoreInterno - Score de crédito interno (0-1000)
 * @property limiteCredito - Limite de crédito aprovado em R$
 * @property indicadoPor - ID do cliente que indicou (rede de indicações)
 * @property indicou - IDs dos clientes que este cliente indicou
 * @property bonusAcumulado - Bônus acumulado em R$ por indicações
 */
export interface Cliente {
  id: string;
  nome: string;
  email: string;
  telefone: string;
  cpf?: string;
  sexo: 'masculino' | 'feminino';
  profissao?: string;
  dataNascimento?: string;
  endereco?: string;
  rua?: string;
  numero?: string;
  bairro?: string;
  estado?: string;
  cidade?: string;
  cep?: string;
  status: 'em_dia' | 'a_vencer' | 'vencido';
  valor: number;
  vencimento: string;
  parcelasPagas?: number;
  totalParcelas?: number;
  diasAtraso?: number;
  ultimoContato?: string;
  indicadoPor?: string;
  indicou?: string[];
  limiteCredito: number;
  creditoUtilizado: number;
  scoreInterno: number;
  bonusAcumulado: number;
  grupo?: string;
  pix_key?: string;
  pix_key_type?: string;
  documentoFrenteUrl?: string;
  documentoVersoUrl?: string;
  comprovanteEnderecoUrl?: string;
  contatosReferencia?: Array<{nome: string; telefone: string; parentesco: string}>;
  rendaMensal?: number;
}

/**
 * Empréstimo concedido a um cliente.
 * @property parcelasPagas - Número de parcelas já quitadas
 * @property taxaJuros - Taxa de juros mensal em %
 * @property status - ativo (em dia), quitado (pago) ou inadimplente
 */
export interface Emprestimo {
  id: string;
  clienteId: string;
  clienteNome?: string;
  valor: number;
  parcelas: number;
  parcelasPagas: number;
  valorParcela: number;
  taxaJuros: number;
  tipoJuros: 'mensal' | 'semanal' | 'diario';
  dataContrato: string;
  proximoVencimento: string;
  status: 'ativo' | 'quitado' | 'inadimplente';
  vendedorId?: string | null;
  cobradorId?: string | null;
  aprovadoPor?: string | null;
  aprovadoEm?: string | null;
  analiseId?: string | null;
  gateway?: string | null;
  desembolsado?: boolean;
  desembolsadoEm?: string | null;
  skipVerification?: boolean;
}

/**
 * Parcela individual de um empréstimo.
 * @property valorOriginal - Valor da parcela sem juros/multa
 * @property valor - Valor atual (original + juros + multa - desconto)
 * @property juros - Juros por atraso em R$
 * @property multa - Multa por atraso em R$
 * @property desconto - Desconto aplicado em R$ (negociação)
 * @property status - pendente, paga, vencida ou cancelada
 */
export interface Parcela {
  id: string;
  emprestimoId: string;
  clienteId: string;
  clienteNome: string;
  numero: number;
  valor: number;
  valorOriginal: number;
  dataVencimento: string;
  dataPagamento?: string;
  status: 'pendente' | 'paga' | 'vencida' | 'cancelada';
  juros: number;
  multa: number;
  desconto: number;
  observacao?: string;
  contaBancaria?: string;
  comprovanteUrl?: string;
  pagamentoTipo?: 'pix' | 'manual' | 'automatico';
  confirmadoPor?: string;
  confirmadoEm?: string;
  wooviChargeId?: string;
}

/**
 * Mensagem de chat entre cliente e sistema/atendente.
 * @property tipo - texto, arquivo ou boleto
 * @property remetente - origem: cliente ou sistema
 */
export interface Mensagem {
  id: string;
  clienteId: string;
  remetente: 'cliente' | 'sistema';
  conteudo: string;
  timestamp: string;
  lida: boolean;
  tipo: 'texto' | 'arquivo' | 'boleto';
}

/**
 * Template de mensagem WhatsApp com versões por gênero.
 * @property mensagemMasculino - Texto para clientes do sexo masculino (Sr.)
 * @property mensagemFeminino - Texto para clientes do sexo feminino (Sra.)
 * @property variaveis - Lista de variáveis dinâmicas ({nome}, {valor}, etc.)
 * @property categoria - cobranca, boas_vindas, lembrete ou negociacao
 */
export interface TemplateWhatsApp {
  id: string;
  nome: string;
  categoria: 'cobranca' | 'boas_vindas' | 'lembrete' | 'negociacao';
  mensagemMasculino: string;
  mensagemFeminino: string;
  variaveis: string[];
  ativo: boolean;
  tipoNotificacao: string | null;
}

/**
 * @interface AnaliseCredito
 * @description Solicitação de crédito (view camelCase).
 */
export interface AnaliseCredito {
  id: string;
  clienteId?: string;
  clienteNome: string;
  cpf: string;
  valorSolicitado: number;
  valorTotalReceber?: number | null;
  valorParcela?: number | null;
  valoresParcelas?: number[] | null;
  skipVerification?: boolean;
  skipVerificationReason?: string | null;
  rendaMensal: number;
  scoreSerasa: number;
  scoreInterno: number;
  status: 'pendente' | 'em_analise' | 'aprovado' | 'recusado';
  dataSolicitacao: string;
  motivo?: string;
  analistaId?: string;
  numeroParcelas?: number | null;
  periodicidade?: string | null;
  diaPagamento?: number | null;
  intervaloDias?: number | null;
  diaUtil?: boolean;
  datasPersonalizadas?: string | null;
  dataResultado?: string | null;
}

/**
 * Verificação de identidade (view camelCase).
 * @property analiseId - FK para a análise de crédito correspondente
 * @property verificationPhrase - Frase que o solicitante deve dizer no vídeo
 * @property retryCount - Número de tentativas já realizadas (máx. 3)
 */
export interface ReferenceContact {
  name: string;
  phone: string;
  relationship: string;
}

export interface IdentityVerification {
  id: string;
  analiseId: string;
  userId?: string;
  videoUrl?: string;
  documentFrontUrl?: string;
  documentBackUrl?: string;
  proofOfAddressUrl?: string;
  residenceVideoUrl?: string;
  clientAddress?: string;
  profissaoInformada?: string;
  referenceContacts: ReferenceContact[];
  verificationPhrase: string;
  status: 'pending' | 'approved' | 'rejected' | 'retry_needed';
  analyzedBy?: string;
  analyzedAt?: string;
  rejectionReason?: string;
  requiresRetry: boolean;
  retryCount: number;
  retryPhrase?: string;
  magicLinkSentAt?: string;
  magicLinkExpiresAt?: string;
  createdAt: string;
  updatedAt: string;
  // Dados da análise (JOIN)
  clienteNome?: string;
  cpf?: string;
  valorSolicitado?: number;
  rendaMensal?: number;
  scoreSerasa?: number;
  analiseStatus?: string;
}

/**
 * Log de ação em verificação de identidade (view camelCase).
 */
export interface VerificationLog {
  id: string;
  verificationId: string;
  analiseId: string;
  action: string;
  performedBy?: string;
  details: Record<string, unknown>;
  createdAt: string;
}

/**
 * Membro da rede de indicações (view camelCase).
 * @property clienteId - ID do cliente na tabela clientes
 * @property indicadoPor - ID do cliente que indicou (null = raiz da rede)
 * @property nivel - Nível na hierarquia (1 = raiz, 2 = indicado direto, etc)
 * @property redeId - Identificador único da rede principal
 * @property status - ativo, bloqueado ou inativo
 */
export interface MembroRede {
  id: string;
  clienteId: string;
  clienteNome: string;
  clienteEmail: string;
  clienteTelefone: string;
  clienteStatus: 'em_dia' | 'a_vencer' | 'vencido';
  clienteValor: number;
  clienteBonusAcumulado: number;
  clienteScoreInterno: number;
  indicadoPor: string | null;
  nivel: number;
  redeId: string;
  status: 'ativo' | 'bloqueado' | 'inativo';
  createdAt: string;
}

/**
 * Bloqueio de rede (view camelCase).
 */
export interface BloqueioRedeView {
  id: string;
  redeId: string;
  causadoPor: string | null;
  causadorNome: string;
  motivo: 'inadimplencia' | 'fraude' | 'manual' | 'auto_bloqueio';
  descricao: string | null;
  bloqueadoEm: string;
  desbloqueadoEm: string | null;
  ativo: boolean;
}

/**
 * Estatísticas resumidas de uma rede de indicações.
 */
export interface RedeStats {
  totalMembros: number;
  emDia: number;
  aVencer: number;
  vencidos: number;
  bloqueados: number;
  niveis: number;
  totalBonus: number;
  totalCarteira: number;
  redeBloqueada: boolean;
}

/**
 * Ticket de atendimento ao cliente (view camelCase).
 * @property atendenteNome - Nome do funcionário atendente (JOIN)
 * @property canal - Canal de origem: whatsapp, chat, telefone, email, presencial
 * @property prioridade - baixa, media, alta, urgente
 */
export interface TicketAtendimentoView {
  id: string;
  clienteId: string;
  clienteNome: string;
  clienteTelefone: string;
  clienteEmail: string;
  atendenteId: string | null;
  atendenteNome: string;
  assunto: string;
  descricao: string | null;
  status: 'aberto' | 'em_atendimento' | 'aguardando_cliente' | 'resolvido' | 'cancelado';
  canal: 'whatsapp' | 'chat' | 'telefone' | 'email' | 'presencial';
  prioridade: 'baixa' | 'media' | 'alta' | 'urgente';
  createdAt: string;
  updatedAt: string;
  resolvidoEm: string | null;
}

/**
 * Card do Kanban de cobrança (view camelCase).
 * @property etapa - Posição no pipeline: a_vencer, vencido, contatado, negociacao, acordo, pago, perdido, arquivado
 * @property responsavelNome - Nome do funcionário responsável (JOIN)
 */
export interface KanbanCobrancaView {
  id: string;
  clienteId: string;
  clienteNome: string;
  clienteTelefone: string;
  clienteEmail: string;
  clienteStatus: 'em_dia' | 'a_vencer' | 'vencido';
  parcelaId: string | null;
  responsavelId: string | null;
  responsavelNome: string;
  etapa: 'a_vencer' | 'vencido' | 'contatado' | 'negociacao' | 'acordo' | 'pago' | 'perdido' | 'arquivado';
  valorDivida: number;
  diasAtraso: number;
  tentativasContato: number;
  ultimoContato: string | null;
  observacao: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Estatísticas do Kanban Gerencial (view camelCase).
 */
export interface KanbanStats {
  totalAnalises: number;
  analisesPendentes: number;
  analisesEmAnalise: number;
  analisesAprovadas: number;
  analisesRecusadas: number;
  totalTickets: number;
  ticketsAbertos: number;
  ticketsEmAtendimento: number;
  ticketsResolvidos: number;
  totalCobranca: number;
  cobrancaEmNegociacao: number;
  cobrancaAcordos: number;
  cobrancaPagos: number;
  valorEmCobranca: number;
  valorRecuperado: number;
  taxaAprovacaoCredito: number;
}

// ── Woovi (Gateway de Pagamentos) ──────────────────────────

/**
 * Cobrança Woovi (view camelCase).
 * @property brCode - Pix copia-e-cola
 * @property qrCodeImage - URL da imagem do QR Code
 * @property paymentLink - Link de pagamento
 */
export interface WooviChargeView {
  id: string;
  parcelaId: string | null;
  emprestimoId: string | null;
  clienteId: string | null;
  clienteNome: string;
  clienteTelefone: string;
  wooviChargeId: string;
  wooviTxid: string | null;
  valor: number;
  status: 'ACTIVE' | 'COMPLETED' | 'EXPIRED' | 'ERROR';
  brCode: string | null;
  qrCodeImage: string | null;
  paymentLink: string | null;
  expirationDate: string | null;
  splitIndicadorId: string | null;
  splitValor: number | null;
  paidAt: string | null;
  criadoPor: string | null;
  gateway: string | null;
  createdAt: string;
}

/**
 * Transação Woovi (view camelCase).
 * @property pixKey - Chave Pix do destinatário
 * @property endToEndId - ID da transação Pix no BACEN
 */
export interface WooviTransactionView {
  id: string;
  emprestimoId: string | null;
  clienteId: string | null;
  chargeId: string | null;
  wooviTransactionId: string | null;
  tipo: 'CHARGE' | 'PAYMENT' | 'SPLIT' | 'WITHDRAWAL';
  valor: number;
  status: 'PENDING' | 'CONFIRMED' | 'FAILED' | 'REFUNDED';
  pixKey: string | null;
  pixKeyType: string | null;
  destinatarioNome: string | null;
  endToEndId: string | null;
  descricao: string | null;
  autorizadoPor: string | null;
  autorizadoEm: string | null;
  gateway: string | null;
  confirmedAt: string | null;
  createdAt: string;
}

/**
 * Subconta Woovi de indicador (view camelCase).
 */
export interface WooviSubaccountView {
  id: string;
  clienteId: string;
  clienteNome: string;
  clienteTelefone: string;
  clienteEmail: string;
  userId: string | null;
  wooviAccountId: string;
  wooviPixKey: string | null;
  nome: string;
  documento: string | null;
  saldo: number;
  totalRecebido: number;
  totalSacado: number;
  ativo: boolean;
  createdAt: string;
}

/**
 * Estatísticas Woovi do dashboard (view camelCase).
 */
export interface WooviDashboardStats {
  totalCharges: number;
  chargesActive: number;
  chargesCompleted: number;
  chargesExpired: number;
  totalRecebido: number;
  totalTransferido: number;
  totalSplit: number;
  totalSubcontas: number;
  totalWebhooks: number;
  webhooksComErro: number;
  saldoConta: number; // vem da API Woovi diretamente
}

// ── Comissões & Gateways ──────────────────────────────────────

/**
 * Configuração de comissão de um agente (view camelCase).
 */
export interface AgenteComissaoView {
  id: string;
  agenteId: string;
  agenteNome?: string;
  agenteEmail?: string;
  agenteRole?: string;
  percentualVenda: number;
  percentualCobranca: number;
  percentualGerencia: number;
  ativo: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Comissão calculada por liquidação de parcela (view camelCase).
 */
export interface ComissaoLiquidacaoView {
  id: string;
  parcelaId: string;
  emprestimoId: string;
  agenteId: string;
  agenteNome?: string;
  tipo: 'venda' | 'cobranca' | 'gerencia';
  valorBase: number;
  percentual: number;
  valorComissao: number;
  mesReferencia: string;
  status: 'pendente' | 'aprovado' | 'pago';
  createdAt: string;
}

/**
 * Gateway de pagamento configurado (view camelCase).
 */
export interface GatewayPagamentoView {
  id: string;
  nome: string;
  label: string;
  ativo: boolean;
  config: Record<string, unknown>;
  prioridade: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Conta bancária configurável para registro de pagamentos.
 * Pode ser manual (CONTA PRINCIPAL, CAIXA) ou vinculada a um gateway (Woovi, EFI).
 */
export interface ContaBancaria {
  id: string;
  nome: string;
  tipo: 'manual' | 'gateway';
  gatewayId?: string | null;
  ativo: boolean;
  padrao: boolean;
  ordem: number;
}
