/**
 * @module mockData
 * @description Camada de dados mock para desenvolvimento frontend-first.
 *
 * Contém todas as interfaces TypeScript do domínio e arrays de dados
 * fictícios que simulam respostas de API. Serve como contrato de dados
 * para o futuro backend (Supabase / API REST).
 *
 * **Interfaces:** User, Funcionario, SessaoAtividade, Cliente, Emprestimo,
 * Parcela, Mensagem, TemplateWhatsApp
 *
 * **Mock Arrays:** mockUsers, mockFuncionarios, mockClientes, mockMensagens,
 * mockEmprestimos, mockParcelas, mockTemplatesWhatsApp, mockEvoluacaoFinanceira,
 * mockComposicaoCarteira, mockProdutividadePorHora, mockProdutividadeSemanal
 *
 * @see PLATAFORMA.md para documentação completa do modelo de dados
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
  dataNascimento?: string;
  endereco?: string;
  status: 'em_dia' | 'a_vencer' | 'vencido';
  valor: number;
  vencimento: string;
  diasAtraso?: number;
  ultimoContato?: string;
  indicadoPor?: string;
  indicou?: string[];
  limiteCredito: number;
  creditoUtilizado: number;
  scoreInterno: number;
  bonusAcumulado: number;
  grupo?: string;
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
  dataContrato: string;
  proximoVencimento: string;
  status: 'ativo' | 'quitado' | 'inadimplente';
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
}

/** Usuários mock do sistema: 1 admin, 1 gerente, 1 cobrador, 1 comercial. */
// Mock Users
export const mockUsers: User[] = [
  {
    id: '1',
    name: 'João Admin',
    email: 'admin@financeira.com',
    role: 'admin',
  },
  {
    id: '2',
    name: 'Maria Gerente',
    email: 'gerente@financeira.com',
    role: 'gerencia',
  },
  {
    id: '3',
    name: 'Carlos Cobrador',
    email: 'cobranca@financeira.com',
    role: 'cobranca',
  },
  {
    id: '4',
    name: 'Fernanda Comercial',
    email: 'comercial@financeira.com',
    role: 'comercial',
  },
];

/** Funcionários mock com dados de monitoramento de atividade e sessões. */
// Mock Funcionarios (Monitoramento de atividade)
export const mockFuncionarios: Funcionario[] = [
  {
    id: '1',
    userId: '1',
    nome: 'João Admin',
    email: 'admin@financeira.com',
    role: 'admin',
    status: 'online',
    ultimoLogin: '2026-02-23T08:02:00',
    ultimaAtividade: '2026-02-23T14:45:00',
    horasHoje: 6.7,
    horasSemana: 38.5,
    horasMes: 162,
    atividadesHoje: 87,
    metaDiaria: 80,
    sessoes: [
      { id: 's1', funcionarioId: '1', inicio: '2026-02-23T08:02:00', duracao: 402, acoes: 87, paginas: ['Dashboard', 'Clientes', 'Configurações'] },
    ],
  },
  {
    id: '2',
    userId: '2',
    nome: 'Maria Gerente',
    email: 'gerente@financeira.com',
    role: 'gerencia',
    status: 'online',
    ultimoLogin: '2026-02-23T07:55:00',
    ultimaAtividade: '2026-02-23T14:30:00',
    horasHoje: 6.5,
    horasSemana: 40.2,
    horasMes: 168,
    atividadesHoje: 65,
    metaDiaria: 60,
    sessoes: [
      { id: 's2', funcionarioId: '2', inicio: '2026-02-23T07:55:00', duracao: 395, acoes: 65, paginas: ['Dashboard', 'Relatórios', 'Rede'] },
    ],
  },
  {
    id: '3',
    userId: '3',
    nome: 'Carlos Cobrador',
    email: 'cobranca@financeira.com',
    role: 'cobranca',
    status: 'ausente',
    ultimoLogin: '2026-02-23T08:30:00',
    ultimaAtividade: '2026-02-23T11:20:00',
    horasHoje: 2.8,
    horasSemana: 28.1,
    horasMes: 120,
    atividadesHoje: 23,
    metaDiaria: 80,
    sessoes: [
      { id: 's3', funcionarioId: '3', inicio: '2026-02-23T08:30:00', fim: '2026-02-23T11:20:00', duracao: 170, acoes: 23, paginas: ['Kanban', 'Chat'] },
    ],
  },
  {
    id: '4',
    userId: '4',
    nome: 'Fernanda Comercial',
    email: 'comercial@financeira.com',
    role: 'comercial',
    status: 'offline',
    ultimoLogin: '2026-02-22T09:00:00',
    ultimaAtividade: '2026-02-22T17:45:00',
    horasHoje: 0,
    horasSemana: 32.5,
    horasMes: 145,
    atividadesHoje: 0,
    metaDiaria: 60,
    sessoes: [],
  },
];

/** 10 clientes mock com dados completos (CPF, sexo, score, limite, rede de indicações). */
// Mock Clientes
export const mockClientes: Cliente[] = [
  {
    id: '1',
    nome: 'João Silva',
    email: 'joao@email.com',
    telefone: '(11) 99999-9999',
    cpf: '123.456.789-00',
    sexo: 'masculino',
    status: 'em_dia',
    valor: 5000,
    vencimento: '2026-07-15',
    indicadoPor: '2',
    indicou: ['3', '4', '5'],
    limiteCredito: 10000,
    creditoUtilizado: 5000,
    scoreInterno: 750,
    bonusAcumulado: 150,
  },
  {
    id: '2',
    nome: 'Maria Santos',
    email: 'maria@email.com',
    telefone: '(11) 98888-8888',
    cpf: '987.654.321-00',
    sexo: 'feminino',
    status: 'vencido',
    valor: 3200,
    vencimento: '2026-05-01',
    diasAtraso: 45,
    ultimoContato: '2026-06-10 (Chat)',
    indicou: ['1', '3'],
    limiteCredito: 8000,
    creditoUtilizado: 3200,
    scoreInterno: 420,
    bonusAcumulado: 100,
  },
  {
    id: '3',
    nome: 'Pedro Oliveira',
    email: 'pedro@email.com',
    telefone: '(11) 97777-7777',
    cpf: '111.222.333-44',
    sexo: 'masculino',
    status: 'a_vencer',
    valor: 8000,
    vencimento: '2026-06-20',
    indicadoPor: '1',
    limiteCredito: 15000,
    creditoUtilizado: 8000,
    scoreInterno: 680,
    bonusAcumulado: 75,
  },
  {
    id: '4',
    nome: 'Ana Costa',
    email: 'ana@email.com',
    telefone: '(11) 96666-6666',
    cpf: '444.555.666-77',
    sexo: 'feminino',
    status: 'vencido',
    valor: 2500,
    vencimento: '2026-04-05',
    diasAtraso: 76,
    ultimoContato: '2026-05-05 (Tel)',
    indicadoPor: '1',
    limiteCredito: 5000,
    creditoUtilizado: 2500,
    scoreInterno: 380,
    bonusAcumulado: 50,
  },
  {
    id: '5',
    nome: 'Carlos Souza',
    email: 'carlos@email.com',
    telefone: '(11) 95555-5555',
    cpf: '555.666.777-88',
    sexo: 'masculino',
    status: 'vencido',
    valor: 12000,
    vencimento: '2026-04-05',
    diasAtraso: 76,
    ultimoContato: '2026-05-05 (Tel)',
    indicadoPor: '1',
    limiteCredito: 20000,
    creditoUtilizado: 12000,
    scoreInterno: 350,
    bonusAcumulado: 0,
  },
  {
    id: '6',
    nome: 'Fernanda Lima',
    email: 'fernanda@email.com',
    telefone: '(11) 94444-4444',
    cpf: '666.777.888-99',
    sexo: 'feminino',
    status: 'a_vencer',
    valor: 4500,
    vencimento: '2026-06-25',
    limiteCredito: 10000,
    creditoUtilizado: 4500,
    scoreInterno: 720,
    bonusAcumulado: 200,
  },
  {
    id: '7',
    nome: 'Roberto Alves',
    email: 'roberto@email.com',
    telefone: '(11) 93333-3333',
    cpf: '777.888.999-00',
    sexo: 'masculino',
    status: 'vencido',
    valor: 1800,
    vencimento: '2026-05-25',
    diasAtraso: 23,
    ultimoContato: '2026-06-15 (Whats)',
    limiteCredito: 6000,
    creditoUtilizado: 1800,
    scoreInterno: 450,
    bonusAcumulado: 25,
  },
  {
    id: '8',
    nome: 'Patricia Gomes',
    email: 'patricia@email.com',
    telefone: '(11) 92222-2222',
    cpf: '888.999.000-11',
    sexo: 'feminino',
    status: 'vencido',
    valor: 5500,
    vencimento: '2026-02-24',
    diasAtraso: 120,
    ultimoContato: '2026-04-01 (Email)',
    limiteCredito: 12000,
    creditoUtilizado: 5500,
    scoreInterno: 280,
    bonusAcumulado: 0,
  },
  {
    id: '9',
    nome: 'Lucas Mendes',
    email: 'lucas@email.com',
    telefone: '(11) 91111-1111',
    cpf: '999.000.111-22',
    sexo: 'masculino',
    status: 'vencido',
    valor: 2200,
    vencimento: '2026-06-07',
    diasAtraso: 15,
    ultimoContato: '2026-06-16 (Chat)',
    limiteCredito: 7000,
    creditoUtilizado: 2200,
    scoreInterno: 520,
    bonusAcumulado: 80,
  },
  {
    id: '10',
    nome: 'Paulo Mendes',
    email: 'paulo@email.com',
    telefone: '(11) 90000-0000',
    cpf: '000.111.222-33',
    sexo: 'masculino',
    status: 'a_vencer',
    valor: 3200,
    vencimento: '2026-06-25',
    limiteCredito: 8000,
    creditoUtilizado: 3200,
    scoreInterno: 690,
    bonusAcumulado: 120,
  },
];

/** Mensagens mock simulando conversa de chat (texto + boleto). */
// Mock Mensagens
export const mockMensagens: Mensagem[] = [
  {
    id: '1',
    clienteId: '1',
    remetente: 'cliente',
    conteudo: 'Olá, gostaria de antecipar minha parcela',
    timestamp: '2026-06-23T10:23:00',
    lida: false,
    tipo: 'texto',
  },
  {
    id: '2',
    clienteId: '1',
    remetente: 'sistema',
    conteudo: 'Claro, João! Vou gerar o boleto com desconto. Aguarde um momento.',
    timestamp: '2026-06-23T10:24:00',
    lida: true,
    tipo: 'texto',
  },
  {
    id: '3',
    clienteId: '1',
    remetente: 'sistema',
    conteudo: 'Boleto gerado com sucesso',
    timestamp: '2026-06-23T10:25:00',
    lida: true,
    tipo: 'boleto',
  },
  {
    id: '4',
    clienteId: '2',
    remetente: 'sistema',
    conteudo: 'Olá Maria, lembramos que seu boleto venceu há 45 dias...',
    timestamp: '2026-06-23T09:15:00',
    lida: true,
    tipo: 'texto',
  },
];

/** Evolução financeira mensal (Jan–Jun): receita e taxa de inadimplência. Usado em DashboardPage e DashboardFinanceiroPage. */
// Dados para gráficos
export const mockEvoluacaoFinanceira = [
  { mes: 'Jan', receita: 800000, inadimplencia: 4.2 },
  { mes: 'Fev', receita: 950000, inadimplencia: 4.5 },
  { mes: 'Mar', receita: 1100000, inadimplencia: 4.8 },
  { mes: 'Abr', receita: 1200000, inadimplencia: 5.0 },
  { mes: 'Mai', receita: 1300000, inadimplencia: 5.2 },
  { mes: 'Jun', receita: 1245890, inadimplencia: 5.2 },
];

/** Composição da carteira de clientes por status (PieChart no Dashboard). */
export const mockComposicaoCarteira = [
  { status: 'Em dia', clientes: 845, porcentagem: 68 },
  { status: 'À vencer', clientes: 312, porcentagem: 25 },
  { status: 'Vencidos', clientes: 88, porcentagem: 7 },
];

/** 8 empréstimos mock vinculados aos clientes (ativo + inadimplente). */
// Mock Empréstimos
export const mockEmprestimos: Emprestimo[] = [
  { id: 'e1', clienteId: '1', clienteNome: 'João Silva', valor: 5000, parcelas: 12, parcelasPagas: 5, valorParcela: 500, taxaJuros: 2.5, dataContrato: '2025-09-15', proximoVencimento: '2026-03-15', status: 'ativo' },
  { id: 'e2', clienteId: '2', clienteNome: 'Maria Santos', valor: 3200, parcelas: 10, parcelasPagas: 3, valorParcela: 380, taxaJuros: 3.0, dataContrato: '2025-11-01', proximoVencimento: '2026-02-01', status: 'inadimplente' },
  { id: 'e3', clienteId: '3', clienteNome: 'Pedro Oliveira', valor: 8000, parcelas: 24, parcelasPagas: 6, valorParcela: 420, taxaJuros: 2.8, dataContrato: '2025-08-20', proximoVencimento: '2026-03-20', status: 'ativo' },
  { id: 'e4', clienteId: '4', clienteNome: 'Ana Costa', valor: 2500, parcelas: 6, parcelasPagas: 1, valorParcela: 480, taxaJuros: 3.2, dataContrato: '2025-12-05', proximoVencimento: '2026-01-05', status: 'inadimplente' },
  { id: 'e5', clienteId: '5', clienteNome: 'Carlos Souza', valor: 12000, parcelas: 36, parcelasPagas: 8, valorParcela: 450, taxaJuros: 2.2, dataContrato: '2025-06-05', proximoVencimento: '2026-03-05', status: 'inadimplente' },
  { id: 'e6', clienteId: '6', clienteNome: 'Fernanda Lima', valor: 4500, parcelas: 12, parcelasPagas: 4, valorParcela: 440, taxaJuros: 2.6, dataContrato: '2025-10-25', proximoVencimento: '2026-03-25', status: 'ativo' },
  { id: 'e7', clienteId: '7', clienteNome: 'Roberto Alves', valor: 1800, parcelas: 6, parcelasPagas: 2, valorParcela: 340, taxaJuros: 3.5, dataContrato: '2025-12-25', proximoVencimento: '2026-02-25', status: 'inadimplente' },
  { id: 'e8', clienteId: '8', clienteNome: 'Patricia Gomes', valor: 5500, parcelas: 18, parcelasPagas: 2, valorParcela: 380, taxaJuros: 3.0, dataContrato: '2025-12-24', proximoVencimento: '2026-02-24', status: 'inadimplente' },
];

/** 12 parcelas mock com juros, multa e desconto calculados. Usado em Gestão de Parcelas. */
// Mock Parcelas
export const mockParcelas: Parcela[] = [
  { id: 'p1', emprestimoId: 'e1', clienteId: '1', clienteNome: 'João Silva', numero: 6, valor: 500, valorOriginal: 500, dataVencimento: '2026-03-15', status: 'pendente', juros: 0, multa: 0, desconto: 0 },
  { id: 'p2', emprestimoId: 'e1', clienteId: '1', clienteNome: 'João Silva', numero: 7, valor: 500, valorOriginal: 500, dataVencimento: '2026-04-15', status: 'pendente', juros: 0, multa: 0, desconto: 0 },
  { id: 'p3', emprestimoId: 'e2', clienteId: '2', clienteNome: 'Maria Santos', numero: 4, valor: 418, valorOriginal: 380, dataVencimento: '2026-02-01', status: 'vencida', juros: 28, multa: 10, desconto: 0 },
  { id: 'p4', emprestimoId: 'e2', clienteId: '2', clienteNome: 'Maria Santos', numero: 5, valor: 380, valorOriginal: 380, dataVencimento: '2026-03-01', status: 'pendente', juros: 0, multa: 0, desconto: 0 },
  { id: 'p5', emprestimoId: 'e3', clienteId: '3', clienteNome: 'Pedro Oliveira', numero: 7, valor: 420, valorOriginal: 420, dataVencimento: '2026-03-20', status: 'pendente', juros: 0, multa: 0, desconto: 0 },
  { id: 'p6', emprestimoId: 'e4', clienteId: '4', clienteNome: 'Ana Costa', numero: 2, valor: 540, valorOriginal: 480, dataVencimento: '2026-01-05', status: 'vencida', juros: 40, multa: 20, desconto: 0 },
  { id: 'p7', emprestimoId: 'e4', clienteId: '4', clienteNome: 'Ana Costa', numero: 3, valor: 510, valorOriginal: 480, dataVencimento: '2026-02-05', status: 'vencida', juros: 20, multa: 10, desconto: 0 },
  { id: 'p8', emprestimoId: 'e5', clienteId: '5', clienteNome: 'Carlos Souza', numero: 9, valor: 520, valorOriginal: 450, dataVencimento: '2026-03-05', status: 'vencida', juros: 50, multa: 20, desconto: 0 },
  { id: 'p9', emprestimoId: 'e6', clienteId: '6', clienteNome: 'Fernanda Lima', numero: 5, valor: 440, valorOriginal: 440, dataVencimento: '2026-03-25', status: 'pendente', juros: 0, multa: 0, desconto: 0 },
  { id: 'p10', emprestimoId: 'e7', clienteId: '7', clienteNome: 'Roberto Alves', numero: 3, valor: 370, valorOriginal: 340, dataVencimento: '2026-02-25', status: 'vencida', juros: 20, multa: 10, desconto: 0 },
  { id: 'p11', emprestimoId: 'e8', clienteId: '8', clienteNome: 'Patricia Gomes', numero: 3, valor: 430, valorOriginal: 380, dataVencimento: '2026-02-24', status: 'vencida', juros: 35, multa: 15, desconto: 0 },
  { id: 'p12', emprestimoId: 'e8', clienteId: '8', clienteNome: 'Patricia Gomes', numero: 4, valor: 380, valorOriginal: 380, dataVencimento: '2026-03-24', status: 'pendente', juros: 0, multa: 0, desconto: 0 },
];

/** 4 templates WhatsApp com versões masculino/feminino e variáveis dinâmicas. */
// Mock Templates WhatsApp
export const mockTemplatesWhatsApp: TemplateWhatsApp[] = [
  {
    id: 't1',
    nome: 'Lembrete de Vencimento',
    categoria: 'lembrete',
    mensagemMasculino: 'Olá Sr. {nome}, lembramos que sua parcela de {valor} vence em {data}. Mantenha seu crédito em dia!',
    mensagemFeminino: 'Olá Sra. {nome}, lembramos que sua parcela de {valor} vence em {data}. Mantenha seu crédito em dia!',
    variaveis: ['nome', 'valor', 'data'],
    ativo: true,
  },
  {
    id: 't2',
    nome: 'Cobrança Amigável',
    categoria: 'cobranca',
    mensagemMasculino: 'Prezado Sr. {nome}, identificamos que sua parcela está em atraso. Vamos regularizar? Entre em contato conosco.',
    mensagemFeminino: 'Prezada Sra. {nome}, identificamos que sua parcela está em atraso. Vamos regularizar? Entre em contato conosco.',
    variaveis: ['nome', 'valor', 'diasAtraso'],
    ativo: true,
  },
  {
    id: 't3',
    nome: 'Boas-vindas',
    categoria: 'boas_vindas',
    mensagemMasculino: 'Bem-vindo ao FintechFlow, Sr. {nome}! Seu crédito de {valor} foi aprovado. Qualquer dúvida, estamos aqui.',
    mensagemFeminino: 'Bem-vinda ao FintechFlow, Sra. {nome}! Seu crédito de {valor} foi aprovado. Qualquer dúvida, estamos aqui.',
    variaveis: ['nome', 'valor'],
    ativo: true,
  },
  {
    id: 't4',
    nome: 'Proposta de Negociação',
    categoria: 'negociacao',
    mensagemMasculino: 'Sr. {nome}, temos uma proposta especial para regularizar seu débito de {valor}. Desconto de até {desconto}%. Vamos conversar?',
    mensagemFeminino: 'Sra. {nome}, temos uma proposta especial para regularizar seu débito de {valor}. Desconto de até {desconto}%. Vamos conversar?',
    variaveis: ['nome', 'valor', 'desconto'],
    ativo: true,
  },
];

/** Ações realizadas por hora (08h–17h) — BarChart na ProdutividadePage. */
// Mock dados de produtividade por hora
export const mockProdutividadePorHora = [
  { hora: '08:00', acoes: 12 },
  { hora: '09:00', acoes: 25 },
  { hora: '10:00', acoes: 32 },
  { hora: '11:00', acoes: 28 },
  { hora: '12:00', acoes: 8 },
  { hora: '13:00', acoes: 15 },
  { hora: '14:00', acoes: 30 },
  { hora: '15:00', acoes: 27 },
  { hora: '16:00', acoes: 22 },
  { hora: '17:00', acoes: 18 },
];

/** Produtividade semanal (Seg–Sex): horas, ações e meta — usado na ProdutividadePage. */
// Mock dados de produtividade semanal
export const mockProdutividadeSemanal = [
  { dia: 'Seg', horasTrabalhadas: 8.2, acoes: 95, meta: 80 },
  { dia: 'Ter', horasTrabalhadas: 7.8, acoes: 82, meta: 80 },
  { dia: 'Qua', horasTrabalhadas: 8.5, acoes: 105, meta: 80 },
  { dia: 'Qui', horasTrabalhadas: 7.2, acoes: 72, meta: 80 },
  { dia: 'Sex', horasTrabalhadas: 6.8, acoes: 65, meta: 80 },
];
