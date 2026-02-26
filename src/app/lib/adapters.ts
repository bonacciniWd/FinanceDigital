/**
 * @module adapters
 * @description Funções de conversão entre tipos DB (snake_case) e tipos View (camelCase).
 *
 * As páginas usam tipos camelCase (originados em mockData.ts).
 * Os serviços retornam tipos snake_case (padrão Supabase/PostgreSQL).
 * Este módulo faz a ponte para que os hooks retornem dados
 * no formato que as páginas já esperam.
 *
 * @see database.types para tipos DB
 * @see mockData para interfaces das páginas
 */
import type {
  Cliente as DbCliente,
  Emprestimo as DbEmprestimo,
  Parcela as DbParcela,
  Mensagem as DbMensagem,
  TemplateWhatsApp as DbTemplate,
  Funcionario as DbFuncionario,
  SessaoAtividade as DbSessao,
  EmprestimoComCliente,
  ParcelaComCliente,
  ClienteComIndicados,
} from './database.types';

import type {
  Cliente,
  Emprestimo,
  Parcela,
  Mensagem,
  TemplateWhatsApp,
  Funcionario,
  SessaoAtividade,
} from './mockData';

// ── Cliente ────────────────────────────────────────────────

/** Converte cliente do banco (snake_case) para formato de view (camelCase) */
export function dbClienteToView(c: DbCliente, indicou?: string[]): Cliente {
  return {
    id: c.id,
    nome: c.nome,
    email: c.email,
    telefone: c.telefone,
    cpf: c.cpf ?? undefined,
    sexo: c.sexo,
    dataNascimento: c.data_nascimento ?? undefined,
    endereco: c.endereco ?? undefined,
    status: c.status,
    valor: c.valor,
    vencimento: c.vencimento,
    diasAtraso: c.dias_atraso,
    ultimoContato: c.ultimo_contato ?? undefined,
    limiteCredito: c.limite_credito,
    creditoUtilizado: c.credito_utilizado,
    scoreInterno: c.score_interno,
    bonusAcumulado: c.bonus_acumulado,
    grupo: c.grupo ?? undefined,
    indicadoPor: c.indicado_por ?? undefined,
    indicou: indicou ?? [],
  };
}

/** Converte cliente com indicados (usado em Rede de Indicações) */
export function dbClienteComIndicadosToView(c: ClienteComIndicados): Cliente {
  return dbClienteToView(c, c.indicados?.map((i) => i.id) ?? []);
}

// ── Empréstimo ─────────────────────────────────────────────

/** Converte empréstimo do banco para formato de view */
export function dbEmprestimoToView(e: EmprestimoComCliente): Emprestimo {
  return {
    id: e.id,
    clienteId: e.cliente_id,
    clienteNome: e.clientes?.nome ?? '',
    valor: e.valor,
    parcelas: e.parcelas,
    parcelasPagas: e.parcelas_pagas,
    valorParcela: e.valor_parcela,
    taxaJuros: e.taxa_juros,
    dataContrato: e.data_contrato,
    proximoVencimento: e.proximo_vencimento,
    status: e.status,
  };
}

// ── Parcela ────────────────────────────────────────────────

/** Converte parcela do banco para formato de view */
export function dbParcelaToView(p: ParcelaComCliente): Parcela {
  return {
    id: p.id,
    emprestimoId: p.emprestimo_id,
    clienteId: p.cliente_id,
    clienteNome: p.clientes?.nome ?? '',
    numero: p.numero,
    valor: p.valor,
    valorOriginal: p.valor_original,
    dataVencimento: p.data_vencimento,
    dataPagamento: p.data_pagamento ?? undefined,
    status: p.status,
    juros: p.juros,
    multa: p.multa,
    desconto: p.desconto,
  };
}

// ── Mensagem ───────────────────────────────────────────────

/** Converte mensagem do banco para formato de view */
export function dbMensagemToView(m: DbMensagem): Mensagem {
  return {
    id: m.id,
    clienteId: m.cliente_id,
    remetente: m.remetente,
    conteudo: m.conteudo,
    timestamp: m.timestamp,
    lida: m.lida,
    tipo: m.tipo,
  };
}

// ── Template WhatsApp ──────────────────────────────────────

/** Converte template do banco para formato de view */
export function dbTemplateToView(t: DbTemplate): TemplateWhatsApp {
  return {
    id: t.id,
    nome: t.nome,
    categoria: t.categoria,
    mensagemMasculino: t.mensagem_masculino,
    mensagemFeminino: t.mensagem_feminino,
    variaveis: t.variaveis,
    ativo: t.ativo,
  };
}

// ── Funcionário ────────────────────────────────────────────

/** Converte funcionário do banco para formato de view */
export function dbFuncionarioToView(
  f: DbFuncionario,
  sessoes: DbSessao[] = []
): Funcionario {
  return {
    id: f.id,
    userId: f.user_id,
    nome: f.nome,
    email: f.email,
    role: f.role as Funcionario['role'],
    status: f.status,
    ultimoLogin: f.ultimo_login ?? '',
    ultimaAtividade: f.ultima_atividade ?? '',
    horasHoje: f.horas_hoje,
    horasSemana: f.horas_semana,
    horasMes: f.horas_mes,
    atividadesHoje: f.atividades_hoje,
    metaDiaria: f.meta_diaria,
    sessoes: sessoes.map(dbSessaoToView),
  };
}

/** Converte sessão de atividade do banco para formato de view */
export function dbSessaoToView(s: DbSessao): SessaoAtividade {
  return {
    id: s.id,
    funcionarioId: s.funcionario_id,
    inicio: s.inicio,
    fim: s.fim ?? undefined,
    duracao: s.duracao,
    acoes: s.acoes,
    paginas: s.paginas,
  };
}

// ── Utilitários de conversão reversa (View → DB Insert) ───

/** Converte dados de form (camelCase) para insert de cliente no banco */
export function viewClienteToInsert(c: Partial<Cliente>) {
  return {
    nome: c.nome,
    email: c.email,
    telefone: c.telefone,
    cpf: c.cpf ?? null,
    sexo: c.sexo,
    data_nascimento: c.dataNascimento ?? null,
    endereco: c.endereco ?? null,
    status: c.status ?? ('em_dia' as const),
    valor: c.valor ?? 0,
    vencimento: c.vencimento,
    limite_credito: c.limiteCredito ?? 0,
    credito_utilizado: c.creditoUtilizado ?? 0,
    score_interno: c.scoreInterno ?? 500,
    bonus_acumulado: c.bonusAcumulado ?? 0,
    grupo: c.grupo ?? null,
    indicado_por: c.indicadoPor ?? null,
  };
}
