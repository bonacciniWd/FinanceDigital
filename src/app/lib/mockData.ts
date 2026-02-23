export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'gerencia' | 'cobranca' | 'comercial' | 'cliente';
  avatar?: string;
}

export interface Cliente {
  id: string;
  nome: string;
  email: string;
  telefone: string;
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

export interface Emprestimo {
  id: string;
  clienteId: string;
  valor: number;
  parcelas: number;
  valorParcela: number;
  dataContrato: string;
  proximoVencimento: string;
  status: 'ativo' | 'quitado' | 'inadimplente';
}

export interface Mensagem {
  id: string;
  clienteId: string;
  remetente: 'cliente' | 'sistema';
  conteudo: string;
  timestamp: string;
  lida: boolean;
  tipo: 'texto' | 'arquivo' | 'boleto';
}

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
];

// Mock Clientes
export const mockClientes: Cliente[] = [
  {
    id: '1',
    nome: 'João Silva',
    email: 'joao@email.com',
    telefone: '(11) 99999-9999',
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
    status: 'a_vencer',
    valor: 3200,
    vencimento: '2026-06-25',
    limiteCredito: 8000,
    creditoUtilizado: 3200,
    scoreInterno: 690,
    bonusAcumulado: 120,
  },
];

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

// Dados para gráficos
export const mockEvoluacaoFinanceira = [
  { mes: 'Jan', receita: 800000, inadimplencia: 4.2 },
  { mes: 'Fev', receita: 950000, inadimplencia: 4.5 },
  { mes: 'Mar', receita: 1100000, inadimplencia: 4.8 },
  { mes: 'Abr', receita: 1200000, inadimplencia: 5.0 },
  { mes: 'Mai', receita: 1300000, inadimplencia: 5.2 },
  { mes: 'Jun', receita: 1245890, inadimplencia: 5.2 },
];

export const mockComposicaoCarteira = [
  { status: 'Em dia', clientes: 845, porcentagem: 68 },
  { status: 'À vencer', clientes: 312, porcentagem: 25 },
  { status: 'Vencidos', clientes: 88, porcentagem: 7 },
];
