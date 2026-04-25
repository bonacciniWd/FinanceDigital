/**
 * Conciliação automática de pagamentos PIX
 *
 * Usado por webhook-efi e webhook-woovi quando o PIX recebido não tem
 * vínculo direto com uma parcela (parcela_id ausente ou charge não existe).
 *
 * Regra:
 *   1. Carrega configuracoes_sistema.conciliacao_automatica
 *   2. Se enabled=false → grava em pagamentos_orfaos como nao_conciliado
 *   3. Se enabled=true:
 *      a. Localiza cliente_id (por charge.cliente_id ou por CPF do pagador)
 *      b. Lista parcelas pendentes/vencidas (não pagas, não congeladas)
 *      c. Filtra por |valorPago − valorParcela| / valorParcela ≤ tolerancia_pct/100
 *      d. Se exatamente 1 → marca paga, retorna { matched: true, parcelaId }
 *      e. Caso contrário → grava órfão com lista de candidatas
 *
 * NÃO retorna throw; falha silenciosa apenas loga.
 */

// deno-lint-ignore-file no-explicit-any
type Admin = any;

interface ConciliacaoInput {
  adminClient: Admin;
  valor: number;
  cpfPagador?: string | null;
  nomePagador?: string | null;
  e2eId?: string | null;
  txid?: string | null;
  gateway: "efi" | "woovi" | "manual";
  clienteIdHint?: string | null;
  rawPayload?: unknown;
}

export interface ConciliacaoResultado {
  matched: boolean;
  parcelaId?: string;
  orfaoId?: string;
  motivo: string;
}

interface ConfigConciliacao {
  enabled: boolean;
  tolerancia_pct: number;
  match_por_cpf: boolean;
}

async function carregarConfig(adminClient: Admin): Promise<ConfigConciliacao> {
  const { data } = await adminClient
    .from("configuracoes_sistema")
    .select("valor")
    .eq("chave", "conciliacao_automatica")
    .maybeSingle();
  const v = (data?.valor ?? {}) as Record<string, unknown>;
  return {
    enabled: v.enabled !== false,
    tolerancia_pct: typeof v.tolerancia_pct === "number" ? (v.tolerancia_pct as number) : 10,
    match_por_cpf: v.match_por_cpf !== false,
  };
}

async function inserirOrfao(
  adminClient: Admin,
  input: ConciliacaoInput,
  candidatas: string[],
  clienteId: string | null,
): Promise<string | null> {
  const { data, error } = await adminClient
    .from("pagamentos_orfaos")
    .insert({
      valor: input.valor,
      e2e_id: input.e2eId || null,
      txid: input.txid || null,
      cpf_pagador: input.cpfPagador || null,
      nome_pagador: input.nomePagador || null,
      gateway: input.gateway,
      cliente_id: clienteId,
      candidatas: candidatas.length > 0 ? candidatas : null,
      raw_payload: input.rawPayload ?? null,
      status: "nao_conciliado",
    })
    .select("id")
    .single();
  if (error) {
    // Se conflito por e2e_id já existe, ignora silenciosamente
    if (!String(error.message).includes("duplicate")) {
      console.error("[conciliacao] erro inserir órfão:", error.message);
    }
    return null;
  }
  return data?.id ?? null;
}

export async function tentarConciliarPagamento(input: ConciliacaoInput): Promise<ConciliacaoResultado> {
  const { adminClient, valor, gateway } = input;
  const cpfLimpo = (input.cpfPagador || "").replace(/\D/g, "");

  let cfg: ConfigConciliacao;
  try {
    cfg = await carregarConfig(adminClient);
  } catch {
    cfg = { enabled: true, tolerancia_pct: 10, match_por_cpf: true };
  }

  if (!cfg.enabled) {
    const orfaoId = await inserirOrfao(adminClient, input, [], input.clienteIdHint || null);
    return { matched: false, orfaoId: orfaoId || undefined, motivo: "config_off" };
  }

  // 1. Localizar cliente
  let clienteId = input.clienteIdHint || null;
  if (!clienteId && cfg.match_por_cpf && cpfLimpo.length >= 11) {
    const { data: cli } = await adminClient
      .from("clientes")
      .select("id")
      .eq("cpf", cpfLimpo)
      .maybeSingle();
    if (cli?.id) clienteId = cli.id;
  }

  if (!clienteId) {
    const orfaoId = await inserirOrfao(adminClient, input, [], null);
    return { matched: false, orfaoId: orfaoId || undefined, motivo: "cliente_nao_encontrado" };
  }

  // 2. Listar parcelas elegíveis
  const { data: parcelas } = await adminClient
    .from("parcelas")
    .select("id, valor, juros, multa, desconto, data_vencimento, status, congelada")
    .eq("cliente_id", clienteId)
    .in("status", ["pendente", "vencida"])
    .neq("congelada", true);

  if (!parcelas || parcelas.length === 0) {
    const orfaoId = await inserirOrfao(adminClient, input, [], clienteId);
    return { matched: false, orfaoId: orfaoId || undefined, motivo: "sem_parcelas_elegiveis" };
  }

  const tolerancia = cfg.tolerancia_pct / 100;

  // 3. Calcular candidatas (valor corrigido com juros/multa/desconto)
  const candidatas = parcelas
    .map((p: any) => {
      const valorCorrigido = Number(p.valor || 0) + Number(p.juros || 0) + Number(p.multa || 0) - Number(p.desconto || 0);
      const diff = Math.abs(valor - valorCorrigido);
      const pct = valorCorrigido > 0 ? diff / valorCorrigido : 1;
      return { id: p.id as string, pct, valorCorrigido };
    })
    .filter((c: { pct: number }) => c.pct <= tolerancia)
    .sort((a: { pct: number }, b: { pct: number }) => a.pct - b.pct);

  if (candidatas.length === 0) {
    const orfaoId = await inserirOrfao(adminClient, input, [], clienteId);
    return { matched: false, orfaoId: orfaoId || undefined, motivo: "sem_candidatas_no_threshold" };
  }

  if (candidatas.length > 1) {
    const orfaoId = await inserirOrfao(adminClient, input, candidatas.map((c: any) => c.id), clienteId);
    return { matched: false, orfaoId: orfaoId || undefined, motivo: "multiplas_candidatas" };
  }

  // 4. Match único → conciliar
  const parcelaId = candidatas[0].id;
  const hoje = new Date().toISOString().slice(0, 10);
  const { error: updErr } = await adminClient
    .from("parcelas")
    .update({
      status: "paga",
      data_pagamento: hoje,
      pagamento_tipo: "pix_match_auto",
    })
    .eq("id", parcelaId)
    .neq("status", "paga");

  if (updErr) {
    console.error("[conciliacao] erro update parcela:", updErr.message);
    const orfaoId = await inserirOrfao(adminClient, input, [parcelaId], clienteId);
    return { matched: false, orfaoId: orfaoId || undefined, motivo: "erro_update" };
  }

  // 5. Registrar órfão como auto-conciliado para auditoria
  await adminClient.from("pagamentos_orfaos").insert({
    valor: input.valor,
    e2e_id: input.e2eId || null,
    txid: input.txid || null,
    cpf_pagador: input.cpfPagador || null,
    nome_pagador: input.nomePagador || null,
    gateway: input.gateway,
    cliente_id: clienteId,
    parcela_id_match: parcelaId,
    raw_payload: input.rawPayload ?? null,
    status: "conciliado_auto",
    conciliado_em: new Date().toISOString(),
    observacao: `Match automático (gateway=${gateway}, diferença=${(candidatas[0].pct * 100).toFixed(2)}%)`,
  });

  return { matched: true, parcelaId, motivo: "match_unico" };
}
