/**
 * @module adapters
 * @description Funções de conversão entre tipos DB (snake_case) e tipos View (camelCase).
 *
 * As páginas usam tipos camelCase definidos em view-types.ts.
 * Os serviços retornam tipos snake_case (padrão Supabase/PostgreSQL).
 * Este módulo faz a ponte para que os hooks retornem dados
 * no formato que as páginas já esperam.
 *
 * @see database.types para tipos DB
 * @see view-types para interfaces das páginas
 */
import type {
  Cliente as DbCliente,
  Emprestimo as DbEmprestimo,
  Parcela as DbParcela,
  Mensagem as DbMensagem,
  TemplateWhatsApp as DbTemplate,
  Funcionario as DbFuncionario,
  SessaoAtividade as DbSessao,
  AnaliseCredito as DbAnaliseCredito,
  EmprestimoComCliente,
  ParcelaComCliente,
  ClienteComIndicados,
  RedeIndicacaoComCliente,
  BloqueioRedeComCausador,
  TicketComCliente,
  KanbanCobrancaComCliente,
  WooviChargeComCliente,
  WooviTransaction as DbWooviTransaction,
  WooviSubaccountComCliente,
  IdentityVerificationComAnalise,
  VerificationLogRow,
  AgenteComissao as DbAgenteComissao,
  ComissaoLiquidacao as DbComissaoLiquidacao,
  ComissaoComAgente,
  GatewayPagamento as DbGatewayPagamento,
} from './database.types';

import type {
  Cliente,
  Emprestimo,
  Parcela,
  Mensagem,
  TemplateWhatsApp,
  Funcionario,
  SessaoAtividade,
  AnaliseCredito,
  MembroRede,
  BloqueioRedeView,
  TicketAtendimentoView,
  KanbanCobrancaView,
  WooviChargeView,
  WooviTransactionView,
  WooviSubaccountView,
  IdentityVerification,
  VerificationLog,
  AgenteComissaoView,
  ComissaoLiquidacaoView,
  GatewayPagamentoView,
} from './view-types';

// ── Cliente ────────────────────────────────────────────────

/** Converte cliente do banco (snake_case) para formato de view (camelCase).
 *  Se o registro vier com empréstimos embutidos, sobrescreve valor/vencimento/parcelas. */
export function dbClienteToView(
  c: DbCliente & { emprestimos?: { id: string; valor: number; parcelas: number; parcelas_pagas: number; proximo_vencimento: string; status: string }[] },
  indicou?: string[],
): Cliente {
  // Pega o empréstimo ativo mais recente (se houver)
  const ativo = c.emprestimos?.find(e => e.status === 'ativo') ?? c.emprestimos?.find(e => e.status === 'inadimplente');

  return {
    id: c.id,
    nome: c.nome,
    email: c.email,
    telefone: c.telefone,
    cpf: c.cpf ?? undefined,
    sexo: c.sexo,
    profissao: c.profissao ?? undefined,
    dataNascimento: c.data_nascimento ?? undefined,
    endereco: c.endereco ?? undefined,
    rua: c.rua ?? undefined,
    numero: c.numero ?? undefined,
    bairro: c.bairro ?? undefined,
    estado: c.estado ?? undefined,
    cidade: c.cidade ?? undefined,
    cep: c.cep ?? undefined,
    status: c.status,
    valor: ativo ? ativo.valor : c.valor,
    vencimento: ativo ? ativo.proximo_vencimento : c.vencimento,
    parcelasPagas: ativo ? ativo.parcelas_pagas : undefined,
    totalParcelas: ativo ? ativo.parcelas : undefined,
    diasAtraso: c.dias_atraso,
    ultimoContato: c.ultimo_contato ?? undefined,
    limiteCredito: c.limite_credito,
    creditoUtilizado: c.credito_utilizado,
    scoreInterno: c.score_interno,
    bonusAcumulado: c.bonus_acumulado,
    grupo: c.grupo ?? undefined,
    pix_key: c.pix_key ?? undefined,
    pix_key_type: c.pix_key_type ?? undefined,
    documentoFrenteUrl: c.documento_frente_url ?? undefined,
    documentoVersoUrl: c.documento_verso_url ?? undefined,
    comprovanteEnderecoUrl: c.comprovante_endereco_url ?? undefined,
    contatosReferencia: (c.contatos_referencia as any[]) ?? undefined,
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
    tipoJuros: e.tipo_juros ?? 'mensal',
    dataContrato: e.data_contrato,
    proximoVencimento: e.proximo_vencimento,
    status: e.status,
    vendedorId: e.vendedor_id,
    cobradorId: e.cobrador_id,
    aprovadoPor: e.aprovado_por,
    aprovadoEm: e.aprovado_em,
    analiseId: e.analise_id,
    gateway: e.gateway,
  };
}

// ── Parcela ────────────────────────────────────────────────

/** Converte parcela do banco para formato de view */
export function dbParcelaToView(p: ParcelaComCliente): Parcela {
  // Derivar status: se o DB diz "pendente" mas a data de vencimento já passou → "vencida"
  let status = p.status;
  if (status === 'pendente') {
    const venc = new Date(p.data_vencimento + 'T00:00:00');
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    if (venc < hoje) status = 'vencida';
  }

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
    status,
    juros: p.juros,
    multa: p.multa,
    desconto: p.desconto,
    observacao: p.observacao ?? undefined,
    contaBancaria: p.conta_bancaria ?? undefined,
    comprovanteUrl: (p as any).comprovante_url ?? undefined,
    pagamentoTipo: (p as any).pagamento_tipo ?? undefined,
    confirmadoPor: (p as any).confirmado_por ?? undefined,
    confirmadoEm: (p as any).confirmado_em ?? undefined,
    wooviChargeId: (p as any).woovi_charge_id ?? undefined,
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
    tipoNotificacao: t.tipo_notificacao ?? null,
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
    rua: c.rua ?? null,
    numero: c.numero ?? null,
    bairro: c.bairro ?? null,
    estado: c.estado ?? null,
    cidade: c.cidade ?? null,
    cep: c.cep ?? null,
    status: c.status ?? ('em_dia' as const),
    valor: c.valor ?? 0,
    vencimento: c.vencimento,
    limite_credito: c.limiteCredito ?? 0,
    credito_utilizado: c.creditoUtilizado ?? 0,
    score_interno: c.scoreInterno ?? 500,
    bonus_acumulado: c.bonusAcumulado ?? 0,
    grupo: c.grupo ?? null,
    indicado_por: c.indicadoPor ?? null,
    pix_key: c.pix_key ?? null,
    pix_key_type: c.pix_key_type ?? null,
  };
}

// ── Análise de Crédito ─────────────────────────────────────

/** Converte análise de crédito do banco (snake_case) para formato de view (camelCase) */
export function dbAnaliseCreditoToView(a: DbAnaliseCredito): AnaliseCredito {
  return {
    id: a.id,
    clienteId: a.cliente_id ?? undefined,
    clienteNome: a.cliente_nome,
    cpf: a.cpf,
    valorSolicitado: a.valor_solicitado,
    rendaMensal: a.renda_mensal,
    scoreSerasa: a.score_serasa,
    scoreInterno: a.score_interno,
    status: a.status,
    dataSolicitacao: a.data_solicitacao,
    motivo: a.motivo ?? undefined,
    analistaId: a.analista_id ?? undefined,
    numeroParcelas: a.numero_parcelas ?? null,
    periodicidade: a.periodicidade ?? null,
    diaPagamento: a.dia_pagamento ?? null,
    intervaloDias: a.intervalo_dias ?? null,
    diaUtil: a.dia_util ?? false,
    datasPersonalizadas: a.datas_personalizadas ?? null,
    dataResultado: a.data_resultado ?? null,
  };
}

/** Converte dados de form (camelCase) para insert de análise de crédito */
export function viewAnaliseCreditoToInsert(a: Partial<AnaliseCredito>) {
  return {
    cliente_id: a.clienteId ?? null,
    cliente_nome: a.clienteNome,
    cpf: a.cpf,
    valor_solicitado: a.valorSolicitado,
    renda_mensal: a.rendaMensal,
    score_serasa: a.scoreSerasa,
    score_interno: a.scoreInterno ?? 0,
    status: a.status ?? ('pendente' as const),
    data_solicitacao: a.dataSolicitacao,
    motivo: a.motivo ?? null,
    numero_parcelas: a.numeroParcelas ?? null,
    periodicidade: a.periodicidade ?? 'mensal',
    dia_pagamento: a.diaPagamento ?? null,
    intervalo_dias: a.intervaloDias ?? null,
    dia_util: a.diaUtil ?? false,
    datas_personalizadas: a.datasPersonalizadas ?? null,
  };
}

// ── Rede de Indicações ─────────────────────────────────────

/** Converte membro da rede do banco (JOIN com clientes) para formato de view */
export function dbRedeIndicacaoToView(r: RedeIndicacaoComCliente): MembroRede {
  return {
    id: r.id,
    clienteId: r.cliente_id,
    clienteNome: r.clientes?.nome ?? '',
    clienteEmail: r.clientes?.email ?? '',
    clienteTelefone: r.clientes?.telefone ?? '',
    clienteStatus: r.clientes?.status ?? 'em_dia',
    clienteValor: r.clientes?.valor ?? 0,
    clienteBonusAcumulado: r.clientes?.bonus_acumulado ?? 0,
    clienteScoreInterno: r.clientes?.score_interno ?? 0,
    indicadoPor: r.indicado_por,
    nivel: r.nivel,
    redeId: r.rede_id,
    status: r.status,
    createdAt: r.created_at,
  };
}

/** Converte bloqueio de rede do banco (JOIN com clientes) para formato de view */
export function dbBloqueioRedeToView(b: BloqueioRedeComCausador): BloqueioRedeView {
  return {
    id: b.id,
    redeId: b.rede_id,
    causadoPor: b.causado_por,
    causadorNome: b.clientes?.nome ?? 'Desconhecido',
    motivo: b.motivo,
    descricao: b.descricao ?? null,
    bloqueadoEm: b.bloqueado_em,
    desbloqueadoEm: b.desbloqueado_em ?? null,
    ativo: b.ativo,
  };
}

// ── Ticket de Atendimento ──────────────────────────────────

/** Converte ticket do banco (JOIN com clientes e funcionários) para formato de view */
export function dbTicketToView(t: TicketComCliente): TicketAtendimentoView {
  return {
    id: t.id,
    clienteId: t.cliente_id,
    clienteNome: t.clientes?.nome ?? '',
    clienteTelefone: t.clientes?.telefone ?? '',
    clienteEmail: t.clientes?.email ?? '',
    atendenteId: t.atendente_id,
    atendenteNome: t.funcionarios?.nome ?? 'Não atribuído',
    assunto: t.assunto,
    descricao: t.descricao,
    status: t.status,
    canal: t.canal,
    prioridade: t.prioridade,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
    resolvidoEm: t.resolvido_em,
  };
}

// ── Kanban Cobrança ────────────────────────────────────────

/** Converte card de cobrança do banco (JOIN com clientes e funcionários) para formato de view */
export function dbKanbanCobrancaToView(k: KanbanCobrancaComCliente): KanbanCobrancaView {
  return {
    id: k.id,
    clienteId: k.cliente_id,
    clienteNome: k.clientes?.nome ?? '',
    clienteTelefone: k.clientes?.telefone ?? '',
    clienteEmail: k.clientes?.email ?? '',
    clienteStatus: k.clientes?.status ?? 'em_dia',
    parcelaId: k.parcela_id,
    responsavelId: k.responsavel_id,
    responsavelNome: k.funcionarios?.nome ?? 'Não atribuído',
    etapa: k.etapa,
    valorDivida: k.valor_divida,
    diasAtraso: k.dias_atraso,
    tentativasContato: k.tentativas_contato,
    ultimoContato: k.ultimo_contato,
    observacao: k.observacao,
    createdAt: k.created_at,
    updatedAt: k.updated_at,
  };
}

// ── Woovi (Gateway de Pagamentos) ──────────────────────────

/** Converte cobrança Woovi do banco (JOIN com clientes) para formato de view */
export function dbWooviChargeToView(c: WooviChargeComCliente): WooviChargeView {
  return {
    id: c.id,
    parcelaId: c.parcela_id,
    emprestimoId: c.emprestimo_id,
    clienteId: c.cliente_id,
    clienteNome: c.clientes?.nome ?? '',
    clienteTelefone: c.clientes?.telefone ?? '',
    wooviChargeId: c.woovi_charge_id,
    wooviTxid: c.woovi_txid,
    valor: c.valor,
    status: c.status,
    brCode: c.br_code,
    qrCodeImage: c.qr_code_image,
    paymentLink: c.payment_link,
    expirationDate: c.expiration_date,
    splitIndicadorId: c.split_indicador_id,
    splitValor: c.split_valor,
    paidAt: c.paid_at,
    criadoPor: c.criado_por,
    gateway: c.gateway,
    createdAt: c.created_at,
  };
}

/** Converte transação Woovi do banco para formato de view */
export function dbWooviTransactionToView(t: DbWooviTransaction): WooviTransactionView {
  return {
    id: t.id,
    emprestimoId: t.emprestimo_id,
    clienteId: t.cliente_id,
    chargeId: t.charge_id,
    wooviTransactionId: t.woovi_transaction_id,
    tipo: t.tipo,
    valor: t.valor,
    status: t.status,
    pixKey: t.pix_key,
    pixKeyType: t.pix_key_type,
    destinatarioNome: t.destinatario_nome,
    endToEndId: t.end_to_end_id,
    descricao: t.descricao,
    autorizadoPor: t.autorizado_por,
    autorizadoEm: t.autorizado_em,
    gateway: t.gateway,
    confirmedAt: t.confirmed_at,
    createdAt: t.created_at,
  };
}

/** Converte subconta Woovi do banco (JOIN com clientes) para formato de view */
export function dbWooviSubaccountToView(s: WooviSubaccountComCliente): WooviSubaccountView {
  return {
    id: s.id,
    clienteId: s.cliente_id,
    clienteNome: s.clientes?.nome ?? '',
    clienteTelefone: s.clientes?.telefone ?? '',
    clienteEmail: s.clientes?.email ?? '',
    userId: s.user_id,
    wooviAccountId: s.woovi_account_id,
    wooviPixKey: s.woovi_pix_key,
    nome: s.nome,
    documento: s.documento,
    saldo: s.saldo,
    totalRecebido: s.total_recebido,
    totalSacado: s.total_sacado,
    ativo: s.ativo,
    createdAt: s.created_at,
  };
}

// ── Verificação de Identidade ──────────────────────────────

/** Converte verificação de identidade do banco (JOIN com análise) para formato de view */
export function dbIdentityVerificationToView(v: IdentityVerificationComAnalise): IdentityVerification {
  return {
    id: v.id,
    analiseId: v.analise_id,
    userId: v.user_id ?? undefined,
    videoUrl: v.video_url ?? undefined,
    documentFrontUrl: v.document_front_url ?? undefined,
    documentBackUrl: v.document_back_url ?? undefined,
    proofOfAddressUrl: v.proof_of_address_url ?? undefined,
    residenceVideoUrl: v.residence_video_url ?? undefined,
    clientAddress: v.client_address ?? undefined,
    profissaoInformada: v.profissao_informada ?? undefined,
    referenceContacts: v.reference_contacts ?? [],
    verificationPhrase: v.verification_phrase,
    status: v.status,
    analyzedBy: v.analyzed_by ?? undefined,
    analyzedAt: v.analyzed_at ?? undefined,
    rejectionReason: v.rejection_reason ?? undefined,
    requiresRetry: v.requires_retry,
    retryCount: v.retry_count,
    retryPhrase: v.retry_phrase ?? undefined,
    magicLinkSentAt: v.magic_link_sent_at ?? undefined,
    magicLinkExpiresAt: v.magic_link_expires_at ?? undefined,
    createdAt: v.created_at,
    updatedAt: v.updated_at,
    // JOIN fields
    clienteNome: v.analises_credito?.cliente_nome,
    cpf: v.analises_credito?.cpf,
    valorSolicitado: v.analises_credito?.valor_solicitado,
    rendaMensal: v.analises_credito?.renda_mensal,
    scoreSerasa: v.analises_credito?.score_serasa,
    analiseStatus: v.analises_credito?.status,
  };
}

/** Converte log de verificação do banco para formato de view */
export function dbVerificationLogToView(l: VerificationLogRow): VerificationLog {
  return {
    id: l.id,
    verificationId: l.verification_id,
    analiseId: l.analise_id,
    action: l.action,
    performedBy: l.performed_by ?? undefined,
    details: l.details,
    createdAt: l.created_at,
  };
}

// ── Comissões & Gateways ───────────────────────────────────

/** Converte configuração de comissão do agente do banco para formato de view */
export function dbAgenteComissaoToView(
  a: DbAgenteComissao & { profiles?: { name: string; email: string; role: string } | null }
): AgenteComissaoView {
  return {
    id: a.id,
    agenteId: a.agente_id,
    agenteNome: a.profiles?.name,
    agenteEmail: a.profiles?.email,
    agenteRole: a.profiles?.role,
    percentualVenda: Number(a.percentual_venda),
    percentualCobranca: Number(a.percentual_cobranca),
    percentualGerencia: Number(a.percentual_gerencia),
    ativo: a.ativo,
    createdAt: a.created_at,
    updatedAt: a.updated_at,
  };
}

/** Converte comissão de liquidação do banco para formato de view */
export function dbComissaoLiquidacaoToView(c: ComissaoComAgente): ComissaoLiquidacaoView {
  return {
    id: c.id,
    parcelaId: c.parcela_id,
    emprestimoId: c.emprestimo_id,
    agenteId: c.agente_id,
    agenteNome: c.profiles?.name,
    tipo: c.tipo,
    valorBase: Number(c.valor_base),
    percentual: Number(c.percentual),
    valorComissao: Number(c.valor_comissao),
    mesReferencia: c.mes_referencia,
    status: c.status,
    createdAt: c.created_at,
  };
}

/** Converte gateway de pagamento do banco para formato de view */
export function dbGatewayPagamentoToView(g: DbGatewayPagamento): GatewayPagamentoView {
  return {
    id: g.id,
    nome: g.nome,
    label: g.label,
    ativo: g.ativo,
    config: (g.config ?? {}) as Record<string, unknown>,
    prioridade: g.prioridade,
    createdAt: g.created_at,
    updatedAt: g.updated_at,
  };
}
