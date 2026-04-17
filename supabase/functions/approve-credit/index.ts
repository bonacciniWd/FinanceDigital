/**
 * Edge Function: approve-credit
 *
 * Aprova uma análise de crédito verificada, cria empréstimo com parcelas
 * e envia notificação de aprovação ao cliente via WhatsApp.
 *
 * Fluxo:
 * 1. Valida verificação de identidade aprovada
 * 2. Valida que analista não é o próprio solicitante
 * 3. Cria empréstimo com parcelas, valor_parcela e proximo_vencimento
 * 4. Gera N parcelas com datas corretas (semanal/quinzenal/mensal)
 * 5. Dispara pagamento Pix via Woovi (fault-tolerant)
 * 6. Envia WhatsApp de aprovação via instância sistema
 * 7. Atualiza análise para 'aprovado' + data_resultado
 * 8. Registra log de auditoria
 *
 * Body esperado:
 * {
 *   analise_id: string,
 *   pix_key: string,
 *   pix_key_type: "cpf" | "cnpj" | "email" | "phone" | "random",
 * }
 *
 * Deploy: supabase functions deploy approve-credit --no-verify-jwt
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const WOOVI_API_BASE = Deno.env.get("WOOVI_API_URL") || "https://api.woovi-sandbox.com/api/v1";

async function wooviPayment(body: Record<string, unknown>) {
  const appId = Deno.env.get("WOOVI_APP_ID");
  if (!appId) throw new Error("WOOVI_APP_ID não configurado");

  const response = await fetch(`${WOOVI_API_BASE}/payment`, {
    method: "POST",
    headers: { Authorization: appId, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error || `Woovi API error: ${response.status}`);
  return data;
}

/**
 * Detectar gateway ativo com maior prioridade.
 * Retorna "efi" | "woovi" | null
 */
async function detectActiveGateway(
  adminClient: ReturnType<typeof createClient>
): Promise<{ nome: string; config: Record<string, unknown> } | null> {
  const { data: gateways } = await adminClient
    .from("gateways_pagamento")
    .select("nome, config, prioridade")
    .eq("ativo", true)
    .order("prioridade", { ascending: true });

  if (!gateways || gateways.length === 0) return null;
  return { nome: gateways[0].nome, config: (gateways[0].config ?? {}) as Record<string, unknown> };
}

/**
 * Enviar Pix via EFI — chama a Edge Function efi internamente
 */
async function efiPayment(
  adminClient: ReturnType<typeof createClient>,
  dbConfig: Record<string, unknown>,
  params: { valor: number; pixKey: string; clienteId: string; clienteNome: string; emprestimoId: string; callerId: string }
) {
  const sandbox = dbConfig.sandbox === true;
  const baseUrl = sandbox ? "https://pix-h.api.efipay.com.br" : "https://pix.api.efipay.com.br";
  console.log(`[approve-credit] EFI mode: ${sandbox ? "SANDBOX" : "PRODUÇÃO"}, baseUrl: ${baseUrl}`);
  const clientId = (dbConfig.client_id as string) || "";
  const clientSecret = (dbConfig.client_secret as string) || "";
  const certPem = (dbConfig.cert_pem as string) || "";
  const keyPem = (dbConfig.key_pem as string) || "";
  const pixKeyPagador = (dbConfig.pix_key as string) || "";

  if (!clientId || !clientSecret || !certPem || !keyPem) {
    throw new Error("Credenciais EFI incompletas (client_id, client_secret, cert_pem, key_pem)");
  }
  if (!pixKeyPagador) {
    throw new Error("Chave PIX do pagador não configurada no gateway EFI");
  }

  // Obter token OAuth
  const credentials = btoa(`${clientId}:${clientSecret}`);
  const httpClient = Deno.createHttpClient({ cert: certPem, key: keyPem });

  const tokenResp = await fetch(`${baseUrl}/oauth/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/json" },
    body: JSON.stringify({ grant_type: "client_credentials" }),
    // @ts-ignore — Deno mTLS
    client: httpClient,
  });
  if (!tokenResp.ok) {
    const errBody = await tokenResp.text();
    throw new Error(`EFI Auth error: ${errBody}`);
  }
  const tokenData = await tokenResp.json();
  const accessToken = tokenData.access_token;

  // Garantir que o webhook está registrado para a chave do pagador
  // EFI exige webhook cadastrado antes de enviar Pix
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const webhookUrl = `${supabaseUrl}/functions/v1/webhook-efi`;
  try {
    const whCheckResp = await fetch(
      `${baseUrl}/v2/webhook/${encodeURIComponent(pixKeyPagador)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "x-skip-mtls-checking": "true",
        },
        // @ts-ignore — Deno mTLS
        client: httpClient,
      }
    );
    const whCheckText = await whCheckResp.text();
    console.log("[approve-credit] Webhook check response:", whCheckResp.status, whCheckText);
    const whCheckData = whCheckResp.ok && whCheckText ? JSON.parse(whCheckText) : null;
    const currentUrl = whCheckData?.webhookUrl || "";
    if (!currentUrl) {
      console.log("[approve-credit] Webhook não encontrado, registrando:", webhookUrl);
      const whResp = await fetch(
        `${baseUrl}/v2/webhook/${encodeURIComponent(pixKeyPagador)}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            "x-skip-mtls-checking": "true",
          },
          body: JSON.stringify({ webhookUrl }),
          // @ts-ignore — Deno mTLS
          client: httpClient,
        }
      );
      const whRespText = await whResp.text();
      if (!whResp.ok) {
        console.error("[approve-credit] Falha ao registrar webhook:", whResp.status, whRespText);
        // Não bloqueia — tenta enviar Pix mesmo assim
      } else {
        console.log("[approve-credit] Webhook registrado com sucesso:", whRespText);
      }
    } else {
      console.log("[approve-credit] Webhook já registrado:", currentUrl);
    }
  } catch (whErr) {
    console.error("[approve-credit] Erro ao verificar/registrar webhook:", whErr);
  }

  // Enviar Pix
  const idEnvio = crypto.randomUUID().replace(/-/g, "").substring(0, 35);
  const pixBody = {
    valor: params.valor.toFixed(2),
    pagador: {
      chave: pixKeyPagador,
      infoPagador: `Liberação de crédito - ${params.clienteNome}`.substring(0, 140),
    },
    favorecido: { chave: params.pixKey },
  };
  // Usar v3 conforme recomendação da EFI (v2 continua funcionando, mas v3 retorna Bucket-Size)
  const pixEndpoint = `${baseUrl}/v3/gn/pix/${idEnvio}`;
  console.log(`[approve-credit] Enviando Pix: endpoint=${pixEndpoint}, idEnvio=${idEnvio}`);
  console.log(`[approve-credit] Pix body:`, JSON.stringify(pixBody));

  const pixResp = await fetch(pixEndpoint, {
    method: "PUT",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(pixBody),
    // @ts-ignore — Deno mTLS
    client: httpClient,
  });

  const pixText = await pixResp.text();
  console.log(`[approve-credit] Pix response: status=${pixResp.status}, body=${pixText}`);
  // Log headers de rate-limit (bucket) se disponíveis
  const bucketSize = pixResp.headers.get("Bucket-Size") || pixResp.headers.get("bucket-size");
  if (bucketSize) console.log(`[approve-credit] Bucket-Size (fichas restantes): ${bucketSize}`);
  const pixData = pixText ? JSON.parse(pixText) : {};
  if (!pixResp.ok) {
    throw new Error(pixData?.mensagem || pixData?.message || `EFI Pix error: ${pixResp.status}`);
  }
  const e2eId = pixData?.e2eId || pixData?.endToEndId || null;
  console.log(`[approve-credit] Pix enviado com sucesso! idEnvio=${idEnvio}, e2e=${e2eId || "N/A"}, status=${pixData?.status}`);

  // Aguardar 5 segundos e consultar status real do envio
  // A EFI processa assincronamente — EM_PROCESSAMENTO pode virar REALIZADO ou NAO_REALIZADO
  await new Promise(r => setTimeout(r, 5000));
  try {
    const checkUrl = `${baseUrl}/v2/gn/pix/enviados/id-envio/${idEnvio}`;
    console.log(`[approve-credit] Consultando status real do Pix: ${checkUrl}`);
    const checkResp = await fetch(checkUrl, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      // @ts-ignore — Deno mTLS
      client: httpClient,
    });
    const checkText = await checkResp.text();
    console.log(`[approve-credit] Status Pix enviado: status_http=${checkResp.status}, body=${checkText}`);
    if (checkResp.ok && checkText) {
      const checkData = JSON.parse(checkText);
      const statusFinal = checkData?.status || "DESCONHECIDO";
      console.log(`[approve-credit] Status final do Pix: ${statusFinal}`);
      if (statusFinal === "NAO_REALIZADO" || statusFinal === "DEVOLVIDO") {
        const motivo = checkData?.devolucoes?.[0]?.motivo || checkData?.motivo || "motivo não informado";
        console.error(`[approve-credit] ⚠️ PIX REJEITADO! Status: ${statusFinal}, Motivo: ${motivo}`);
        console.error(`[approve-credit] Detalhes completos:`, JSON.stringify(checkData));
      }
    }
  } catch (checkErr) {
    console.error("[approve-credit] Erro ao consultar status do Pix:", checkErr instanceof Error ? checkErr.message : checkErr);
  }

  // Registrar transação
  await adminClient.from("woovi_transactions").insert({
    emprestimo_id: params.emprestimoId,
    cliente_id: params.clienteId,
    woovi_transaction_id: idEnvio,
    tipo: "payment",
    valor: params.valor,
    status: "pending",
    pix_key: params.pixKey,
    destinatario_nome: params.clienteNome,
    descricao: `Liberação de crédito aprovado via EFI`,
    end_to_end_id: e2eId,
    autorizado_por: params.callerId,
    autorizado_em: new Date().toISOString(),
    gateway: "efi",
  });

  return { idEnvio, endToEndId: e2eId, e2eId, gateway: "efi" };
}

// ── Gerar datas de vencimento das parcelas ────────────────
function gerarDatasVencimento(
  numParcelas: number,
  periodicidade: string,
  diaPagamento: number | null,
  dataBase: Date
): string[] {
  const datas: string[] = [];

  for (let i = 1; i <= numParcelas; i++) {
    const d = new Date(dataBase);

    if (periodicidade === "semanal") {
      // diaPagamento = 0(dom)..6(sab). Avança i semanas a partir da próxima ocorrência do dia desejado.
      if (diaPagamento != null && diaPagamento >= 0 && diaPagamento <= 6) {
        const diff = (diaPagamento - d.getDay() + 7) % 7 || 7;
        d.setDate(d.getDate() + diff + (i - 1) * 7);
      } else {
        d.setDate(d.getDate() + i * 7);
      }
    } else if (periodicidade === "quinzenal") {
      d.setDate(d.getDate() + i * 15);
    } else {
      // mensal (default)
      d.setMonth(d.getMonth() + i);
      if (diaPagamento != null && diaPagamento >= 1 && diaPagamento <= 31) {
        const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
        d.setDate(Math.min(diaPagamento, lastDay));
      }
    }

    datas.push(d.toISOString().split("T")[0]);
  }

  return datas;
}

// ── Enviar WhatsApp via instância sistema ─────────────────
async function enviarWhatsAppSistema(
  adminClient: ReturnType<typeof createClient>,
  telefone: string,
  mensagem: string,
  clienteId: string | null,
  tipo: string
) {
  try {
    // Buscar todas as instâncias para encontrar uma conectada
    const { data: allInstancias, error: instErr } = await adminClient
      .from("whatsapp_instancias")
      .select("*");

    if (instErr || !allInstancias || allInstancias.length === 0) {
      console.error("[approve-credit][WA] Nenhuma instância cadastrada:", instErr?.message);
      return null;
    }

    // Tentar sistema primeiro, depois qualquer conectada
    let instancia = allInstancias.find(
      (i: any) => i.is_system && ["conectado", "conectada"].includes(i.status)
    );
    if (!instancia) {
      console.warn("[approve-credit][WA] Instância sistema não encontrada/desconectada, tentando qualquer conectada...");
      instancia = allInstancias.find(
        (i: any) => ["conectado", "conectada"].includes(i.status)
      );
    }

    if (!instancia) {
      const statuses = allInstancias.map((i: any) => `${i.instance_name}: ${i.status}`).join(", ");
      console.error(`[approve-credit][WA] Nenhuma instância conectada. Status: [${statuses}]`);
      return null;
    }

    console.log(`[approve-credit][WA] Usando instância: ${instancia.instance_name} (status: ${instancia.status})`);

    const envUrl = Deno.env.get("EVOLUTION_API_URL");
    const baseUrl = (envUrl || instancia.evolution_url || "").replace(/\/$/, "");
    if (!baseUrl || !instancia.instance_token) {
      console.error(`[approve-credit][WA] Faltando config: baseUrl=${baseUrl ? "OK" : "VAZIO"}, token=${instancia.instance_token ? "OK" : "VAZIO"}`);
      return null;
    }

    // Normalizar telefone (remover @s.whatsapp.net, adicionar 55 DDI)
    let phone = telefone.replace(/@s\.whatsapp\.net/g, "").replace(/\D/g, "");
    if (phone.length <= 11) phone = "55" + phone;

    const evoUrl = `${baseUrl}/message/sendText/${instancia.instance_name}`;
    console.log(`[approve-credit][WA] Enviando para ${phone} via ${evoUrl}`);

    const res = await fetch(evoUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: instancia.instance_token,
      },
      body: JSON.stringify({
        number: phone,
        textMessage: { text: mensagem },
        text: mensagem,
      }),
    });

    const resultText = await res.text();
    console.log(`[approve-credit][WA] Resposta Evolution: status=${res.status}, body=${resultText.substring(0, 300)}`);

    let result: any = {};
    try { result = JSON.parse(resultText); } catch { result = { raw: resultText }; }

    // Log na tabela
    await adminClient.from("notificacoes_log").insert({
      cliente_id: clienteId,
      tipo,
      telefone: phone,
      mensagem,
      status: res.ok ? "enviado" : "erro",
      erro_detalhe: res.ok ? null : JSON.stringify(result).slice(0, 500),
    });

    return result;
  } catch (err) {
    console.error("[approve-credit][WA] Erro envio WhatsApp:", err instanceof Error ? err.message : err);
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // ── Autenticar chamador ─────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Não autorizado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const jwt = authHeader.replace("Bearer ", "");
    const { data: { user: caller }, error: authErr } = await adminClient.auth.getUser(jwt);
    if (authErr || !caller) {
      return new Response(
        JSON.stringify({ error: "Token inválido" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verificar role (admin ou gerencia)
    const { data: profile } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", caller.id)
      .single();

    if (!profile || !["admin", "gerencia"].includes(profile.role)) {
      return new Response(
        JSON.stringify({ error: "Permissão insuficiente" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Body ──────────────────────────────────────────────
    const body = await req.json();
    const analise_id = body.analise_id;
    let pix_key: string = body.pix_key || "";
    let pix_key_type: string = body.pix_key_type || "";

    if (!analise_id) {
      return new Response(
        JSON.stringify({ error: "Campo obrigatório: analise_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Buscar análise ──────────────────────────────────
    const { data: analise, error: analiseErr } = await adminClient
      .from("analises_credito")
      .select("*, identity_verifications:verification_id(*)")
      .eq("id", analise_id)
      .single();

    if (analiseErr || !analise) {
      return new Response(
        JSON.stringify({ error: "Análise não encontrada" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Se pix_key não veio no body, buscar do cadastro do cliente ──
    if (!pix_key && analise.cliente_id) {
      const { data: cliente } = await adminClient
        .from("clientes")
        .select("pix_key, pix_key_type")
        .eq("id", analise.cliente_id)
        .single();
      if (cliente?.pix_key) {
        pix_key = cliente.pix_key;
        pix_key_type = cliente.pix_key_type || "cpf";
        console.log(`[approve-credit] PIX key do cadastro do cliente: ${pix_key} (tipo: ${pix_key_type})`);
      }
    } else if (pix_key) {
      console.log(`[approve-credit] PIX key recebida no body: ${pix_key} (tipo: ${pix_key_type})`);
    }

    if (!pix_key || !pix_key_type) {
      return new Response(
        JSON.stringify({ error: "Chave PIX não encontrada. Informe pix_key e pix_key_type ou cadastre no perfil do cliente." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (analise.status !== "em_analise" && analise.status !== "pendente") {
      return new Response(
        JSON.stringify({ error: `Análise em status inválido: ${analise.status}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Verificar identidade aprovada ───────────────────
    const verification = analise.identity_verifications;
    if (analise.verification_required && (!verification || verification.status !== "approved")) {
      return new Response(
        JSON.stringify({ error: "Verificação de identidade não aprovada" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Regra: analista não pode aprovar própria análise ─
    if (verification?.user_id === caller.id) {
      return new Response(
        JSON.stringify({ error: "Analista não pode aprovar a própria solicitação" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Configuração de parcelas ────────────────────────
    const numParcelas = analise.numero_parcelas || 1;
    const periodicidade = analise.periodicidade || "mensal";
    const diaPagamento = analise.dia_pagamento ?? null;
    const taxaJuros = 0.025; // 2.5% ao mês default

    // Calcular valor da parcela com juros (tabela Price)
    const valorTotal = analise.valor_solicitado;
    let valorParcela: number;
    if (taxaJuros > 0 && numParcelas > 1) {
      const pmt = (valorTotal * taxaJuros * Math.pow(1 + taxaJuros, numParcelas)) /
        (Math.pow(1 + taxaJuros, numParcelas) - 1);
      valorParcela = Math.round(pmt * 100) / 100;
    } else {
      valorParcela = Math.round((valorTotal / numParcelas) * 100) / 100;
    }

    // Gerar datas de vencimento
    const hoje = new Date();
    const datasVencimento = gerarDatasVencimento(numParcelas, periodicidade, diaPagamento, hoje);
    const proximoVencimento = datasVencimento[0];

    // Mapear periodicidade para tipo_juros
    const tipoJurosMap: Record<string, string> = {
      semanal: "semanal",
      quinzenal: "mensal",
      mensal: "mensal",
    };

    // ── Criar empréstimo ────────────────────────────────
    const { data: emprestimo, error: empErr } = await adminClient
      .from("emprestimos")
      .insert({
        cliente_id: analise.cliente_id,
        valor: valorTotal,
        parcelas: numParcelas,
        valor_parcela: valorParcela,
        taxa_juros: taxaJuros * 100, // Armazenar como percentual (2.5)
        tipo_juros: tipoJurosMap[periodicidade] || "mensal",
        data_contrato: hoje.toISOString().split("T")[0],
        proximo_vencimento: proximoVencimento,
        status: "ativo",
        analise_id: analise.id,
        aprovado_por: caller.id,
        aprovado_em: new Date().toISOString(),
        vendedor_id: analise.analista_id ?? null,
        gateway: "auto",
      })
      .select("id")
      .single();

    if (empErr) throw empErr;

    // ── Gerar parcelas ──────────────────────────────────
    const parcelasInsert = datasVencimento.map((dataVenc, idx) => ({
      emprestimo_id: emprestimo!.id,
      cliente_id: analise.cliente_id,
      numero: idx + 1,
      valor: valorParcela,
      valor_original: valorParcela,
      data_vencimento: dataVenc,
      status: "pendente" as const,
    }));

    const { error: parcErr } = await adminClient
      .from("parcelas")
      .insert(parcelasInsert);

    if (parcErr) {
      console.error("Erro ao gerar parcelas:", parcErr);
      // Não bloqueia a aprovação — parcelas podem ser criadas manualmente
    }

    // ── Liberar via Pix (EFI ou Woovi, conforme gateway ativo) ──
    let paymentResult = null;
    let usedGateway = "woovi";
    try {
      const activeGw = await detectActiveGateway(adminClient);

      if (activeGw?.nome === "efi") {
        usedGateway = "efi";
        paymentResult = await efiPayment(adminClient, activeGw.config, {
          valor: valorTotal,
          pixKey: pix_key,
          clienteId: analise.cliente_id,
          clienteNome: analise.cliente_nome,
          emprestimoId: emprestimo!.id,
          callerId: caller.id,
        });
      } else {
        // Fallback Woovi
        usedGateway = "woovi";
        const correlationID = `credit-${analise.id}-${Date.now()}`;
        paymentResult = await wooviPayment({
          value: Math.round(valorTotal * 100),
          destinationAlias: pix_key,
          destinationAliasType: pix_key_type.toUpperCase(),
          correlationID,
          comment: `Liberação de crédito - ${analise.cliente_nome}`,
        });

        await adminClient.from("woovi_transactions").insert({
          emprestimo_id: emprestimo!.id,
          cliente_id: analise.cliente_id,
          woovi_transaction_id: paymentResult?.payment?.transactionID ?? correlationID,
          tipo: "payment",
          valor: valorTotal,
          status: "pending",
          pix_key,
          pix_key_type,
          destinatario_nome: analise.cliente_nome,
          descricao: `Liberação de crédito aprovado - Análise ${analise.id}`,
          autorizado_por: caller.id,
          autorizado_em: new Date().toISOString(),
          gateway: "woovi",
        });
      }

      // Atualizar gateway utilizado no empréstimo + marcar desembolso
      await adminClient.from("emprestimos").update({
        gateway: usedGateway,
        desembolsado: true,
        desembolsado_em: new Date().toISOString(),
        desembolsado_por: caller.id,
      }).eq("id", emprestimo!.id);
      console.log(`[approve-credit] Pagamento ${usedGateway} concluído:`, JSON.stringify(paymentResult));
    } catch (pixErr) {
      console.error(`[approve-credit] ${usedGateway} payment error:`, pixErr instanceof Error ? pixErr.message : pixErr);
      // PIX falhou — empréstimo criado mas NÃO desembolsado (desembolsado=false por padrão)
      console.log(`[approve-credit] Empréstimo ${emprestimo!.id} criado mas aguardando desembolso manual.`);
    }

    // ── Atualizar análise para aprovado ─────────────────
    await adminClient
      .from("analises_credito")
      .update({
        status: "aprovado",
        analista_id: caller.id,
        data_resultado: new Date().toISOString(),
      })
      .eq("id", analise_id);

    // ── Enviar WhatsApp de aprovação + comprovante PIX ─────
    try {
      let telefone: string | null = null;
      let sexoCliente = "masculino";
      if (analise.cliente_id) {
        const { data: cli } = await adminClient
          .from("clientes")
          .select("telefone, sexo")
          .eq("id", analise.cliente_id)
          .single();
        telefone = cli?.telefone ?? null;
        sexoCliente = cli?.sexo || "masculino";
      }

      if (telefone) {
        const freqLabel: Record<string, string> = {
          semanal: "semanais",
          quinzenal: "quinzenais",
          mensal: "mensais",
        };
        const freq = freqLabel[periodicidade] || "mensais";
        // valorFmt COM "R$" para uso direto; valorNum SEM "R$" para templates que já têm "R$"
        const valorFmt = valorTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
        const valorNum = valorTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const parcelaFmt = valorParcela.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
        const parcelaNum = valorParcela.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        // Dados da transação PIX para comprovante
        const pixE2e = paymentResult?.endToEndId || paymentResult?.e2eId || "";
        const pixIdEnvio = paymentResult?.idEnvio || "";
        const pixStatus = paymentResult ? "Enviado" : "Pendente";
        const pixHorario = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

        let msg = "";

        // Tentar buscar template do banco
        const { data: tpl } = await adminClient
          .from("templates_whatsapp")
          .select("*")
          .eq("tipo_notificacao", "aprovacao")
          .eq("ativo", true)
          .limit(1)
          .single();

        if (tpl) {
          const msgBase = sexoCliente === "feminino" ? tpl.mensagem_feminino : tpl.mensagem_masculino;
          const vars: Record<string, string> = {
            nome: analise.cliente_nome,
            valor: valorNum, // SEM "R$" — template já contém "R$"
            parcelas: `${numParcelas}x ${freq} de R$ ${parcelaNum}`,
            data: proximoVencimento.split("-").reverse().join("/"),
            totalParcelas: String(numParcelas),
            pixChave: pix_key,
            pixStatus,
            pixE2e,
            pixIdEnvio,
            pixHorario,
          };
          msg = msgBase.replace(/\{(\w+)\}/g, (_: string, key: string) => vars[key] ?? `{${key}}`);
        } else {
          // Fallback hardcoded
          msg = [
            `✅ *Crédito Aprovado!*`,
            ``,
            `Olá ${analise.cliente_nome}! 🎉`,
            ``,
            `Seu crédito de *${valorFmt}* foi aprovado!`,
            ``,
            `📋 *Detalhes do empréstimo:*`,
            `• Valor: ${valorFmt}`,
            `• Parcelas: ${numParcelas}x ${freq} de *${parcelaFmt}*`,
            `• Primeiro vencimento: ${proximoVencimento.split("-").reverse().join("/")}`,
          ].join("\n");
        }

        // SEMPRE adicionar comprovante PIX após a mensagem (template ou fallback)
        if (paymentResult) {
          msg += `\n\n💸 *Comprovante de envio PIX:*`;
          msg += `\n• Status: ${pixStatus}`;
          msg += `\n• Chave destino: ${pix_key}`;
          msg += `\n• Valor enviado: ${valorFmt}`;
          msg += `\n• Data/Hora: ${pixHorario}`;
          if (pixE2e) msg += `\n• ID E2E: ${pixE2e}`;
          if (pixIdEnvio) msg += `\n• ID Envio: ${pixIdEnvio}`;
        } else {
          msg += `\n\n⏳ O envio do PIX está sendo processado.`;
          msg += `\nVocê receberá o valor em sua chave: ${pix_key}`;
        }

        msg += `\n\nEm caso de dúvidas, entre em contato conosco.`;
        msg += `\n_FinanceDigital_`;

        console.log(`[approve-credit][WA] Mensagem final (primeiros 300 chars): ${msg.substring(0, 300)}`);
        await enviarWhatsAppSistema(adminClient, telefone, msg, analise.cliente_id, "aprovacao");
      }
    } catch (whatsErr) {
      console.error("Erro ao enviar WhatsApp de aprovação:", whatsErr);
    }

    // ── Log de auditoria ────────────────────────────────
    if (verification) {
      await adminClient.from("verification_logs").insert({
        verification_id: verification.id,
        analise_id,
        action: "credit_approved_and_released",
        performed_by: caller.id,
        details: {
          emprestimo_id: emprestimo!.id,
          valor: valorTotal,
          parcelas: numParcelas,
          valor_parcela: valorParcela,
          periodicidade,
          proximo_vencimento: proximoVencimento,
          pix_key,
          pix_payment_success: !!paymentResult,
        },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        emprestimo_id: emprestimo!.id,
        parcelas_geradas: numParcelas,
        valor_parcela: valorParcela,
        proximo_vencimento: proximoVencimento,
        payment_status: paymentResult ? "initiated" : "failed_will_retry",
        message: "Crédito aprovado, empréstimo e parcelas criados com sucesso",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("approve-credit error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
