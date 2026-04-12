/**
 * Edge Function: efi
 *
 * Centraliza chamadas à API da EFI Bank (Gerencianet) para PIX.
 * Gateway oficial — ativação via tabela gateways_pagamento.
 *
 * Ações suportadas:
 *   ── Cobranças imediatas (cob) ──
 *   - create_charge        → PUT  /v2/cob/:txid
 *   - get_charge           → GET  /v2/cob/:txid
 *   - list_charges         → GET  /v2/cob
 *   ── Cobranças com vencimento (cobv) ──
 *   - create_cobv          → PUT  /v2/cobv/:txid
 *   - get_cobv             → GET  /v2/cobv/:txid
 *   - list_cobv            → GET  /v2/cobv
 *   ── Envio de Pix ──
 *   - create_payment       → PUT  /v3/gn/pix/:idEnvio
 *   - get_sent_pix         → GET  /v2/gn/pix/enviados/id-envio/:idEnvio
 *   - list_sent_pix        → GET  /v2/gn/pix/enviados
 *   ── Gestão de Pix ──
 *   - get_pix              → GET  /v2/pix/:e2eId
 *   - list_pix             → GET  /v2/pix
 *   - request_refund       → PUT  /v2/pix/:e2eId/devolucao/:id
 *   - get_refund           → GET  /v2/pix/:e2eId/devolucao/:id
 *   ── Webhooks ──
 *   - configure_webhook    → PUT  /v2/webhook/:chave
 *   - list_webhooks        → GET  /v2/webhook
 *   - delete_webhook       → DELETE /v2/webhook/:chave
 *   ── Saldo ──
 *   - get_balance          → GET  /v2/gn/saldo
 *
 * Credenciais lidas de gateways_pagamento.config (DB) com fallback para env vars.
 * mTLS obrigatório — cert/key PEM via Deno.createHttpClient({ cert, key }).
 *
 * Deploy: supabase functions deploy efi --no-verify-jwt
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

interface EfiCredentials {
  clientId: string;
  clientSecret: string;
  pixKey: string;
  certPem: string;
  keyPem: string;
  sandbox: boolean;
  baseUrl: string;
}

let cachedToken: { token: string; expiresAt: number } | null = null;
let cachedHttpClient: Deno.HttpClient | null = null;

/**
 * Cria um Deno.HttpClient com mTLS usando cert + key PEM.
 * A API PIX da EFI exige mTLS em TODAS as requisições (sandbox e produção).
 */
function getMtlsClient(creds: EfiCredentials): Deno.HttpClient {
  if (cachedHttpClient) return cachedHttpClient;

  if (!creds.certPem || !creds.keyPem) {
    throw new Error(
      "Certificado PEM e/ou Chave Privada não configurados. " +
      "Vá em Configurações → Comissões → Gateways → Configurar Credenciais. " +
      "Converta seu .p12 usando openssl (veja instruções no painel)."
    );
  }

  cachedHttpClient = Deno.createHttpClient({
    cert: creds.certPem,
    key: creds.keyPem,
  });

  return cachedHttpClient;
}

async function getAccessToken(creds: EfiCredentials): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  if (!creds.clientId || !creds.clientSecret) {
    throw new Error(
      "EFI_CLIENT_ID e EFI_CLIENT_SECRET não configurados. " +
      "Vá em Configurações → Comissões → Gateways → Configurar Credenciais."
    );
  }

  const credentials = btoa(`${creds.clientId}:${creds.clientSecret}`);
  const client = getMtlsClient(creds);

  const response = await fetch(`${creds.baseUrl}/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ grant_type: "client_credentials" }),
    // @ts-ignore — Deno-specific mTLS client
    client,
  });

  if (!response.ok) {
    const errBody = await response.text();
    cachedToken = null;
    throw new Error(
      `EFI Auth error ${response.status}: ${errBody}. ` +
      "Verifique Client ID, Client Secret e Certificado PEM."
    );
  }

  const data = await response.json();
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };

  return cachedToken.token;
}

async function efiRequest(creds: EfiCredentials, method: string, path: string, body?: Record<string, unknown>, extraHeaders?: Record<string, string>) {
  const token = await getAccessToken(creds);
  const client = getMtlsClient(creds);

  const response = await fetch(`${creds.baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...extraHeaders,
    },
    body: body ? JSON.stringify(body) : undefined,
    // @ts-ignore — Deno-specific mTLS client
    client,
  });

  // DELETE e alguns endpoints podem retornar 204 No Content
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};

  if (!response.ok) {
    const msg = data?.mensagem || data?.message || `EFI API error: ${response.status}`;
    throw new Error(msg);
  }

  return data;
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorResponse(message: string, status = 400) {
  return jsonResponse({ error: message }, status);
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

    // ── Auth ──────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return errorResponse("Token não fornecido", 401);

    const jwt = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await adminClient.auth.getUser(jwt);
    if (authError || !user) return errorResponse("Token inválido", 401);

    const { data: profile } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || !["admin", "gerencia"].includes(profile.role)) {
      return errorResponse("Permissão negada — requer admin ou gerência", 403);
    }

    const body = await req.json();
    const { action } = body;
    if (!action) return errorResponse("Campo 'action' é obrigatório");

    // Per-action role check: pagamentos PIX e webhooks → somente admin
    const adminOnlyActions = ["create_payment", "configure_webhook", "delete_webhook", "request_refund"];
    if (adminOnlyActions.includes(action) && profile.role !== "admin") {
      return errorResponse(
        "Apenas admin pode executar pagamentos PIX — separação de funções",
        403
      );
    }

    // ── Verificar se gateway EFI está ativo e carregar credenciais ──
    const { data: gateway } = await adminClient
      .from("gateways_pagamento")
      .select("ativo, config")
      .eq("nome", "efi")
      .single();

    if (!gateway?.ativo) {
      return errorResponse("Gateway EFI Bank não está ativo", 400);
    }

    // Ler credenciais do config JSONB (DB) com fallback para env vars
    const dbConfig = (gateway.config ?? {}) as Record<string, unknown>;
    const creds: EfiCredentials = {
      clientId: (dbConfig.client_id as string) || Deno.env.get("EFI_CLIENT_ID") || "",
      clientSecret: (dbConfig.client_secret as string) || Deno.env.get("EFI_CLIENT_SECRET") || "",
      pixKey: (dbConfig.pix_key as string) || Deno.env.get("EFI_PIX_KEY") || "",
      certPem: (dbConfig.cert_pem as string) || Deno.env.get("EFI_CERT_PEM") || "",
      keyPem: (dbConfig.key_pem as string) || Deno.env.get("EFI_KEY_PEM") || "",
      sandbox: dbConfig.sandbox !== undefined ? dbConfig.sandbox === true : Deno.env.get("EFI_SANDBOX") === "true",
      baseUrl: "",
    };
    creds.baseUrl = creds.sandbox
      ? "https://pix-h.api.efipay.com.br"
      : "https://pix.api.efipay.com.br";

    // Invalidar cache de token e cliente mTLS a cada request (credenciais podem mudar)
    cachedToken = null;
    cachedHttpClient = null;

    switch (action) {
      // ════════════════════════════════════════════════════
      // CRIAR COBRANÇA PIX (cob)
      // ════════════════════════════════════════════════════
      case "create_charge": {
        const {
          parcela_id,
          emprestimo_id,
          cliente_id,
          valor,
          descricao,
          cliente_nome,
          cliente_cpf,
          expiration_seconds = 86400, // 24h
        } = body;

        if (!valor || !cliente_id) {
          return errorResponse("Campos obrigatórios: valor, cliente_id");
        }

        const txid = crypto.randomUUID().replace(/-/g, "").substring(0, 35);
        if (!creds.pixKey) throw new Error("Chave PIX não configurada. Vá em Configurações → Comissões → Gateways → Configurar Credenciais.");

        const cobPayload: Record<string, unknown> = {
          calendario: { expiracao: expiration_seconds },
          valor: { original: valor.toFixed(2) },
          chave: creds.pixKey,
          infoAdicionais: [
            { nome: "Parcela", valor: parcela_id || "avulso" },
          ],
        };

        if (cliente_cpf) {
          cobPayload.devedor = {
            cpf: cliente_cpf.replace(/\D/g, ""),
            nome: cliente_nome || "Cliente",
          };
        }

        if (descricao) {
          cobPayload.solicitacaoPagador = descricao.substring(0, 140);
        }

        const cobResponse = await efiRequest(creds, "PUT", `/v2/cob/${txid}`, cobPayload);

        // Gerar QR Code
        let qrCodeImage = null;
        let brCode = null;
        try {
          const qrResp = await efiRequest(creds, "GET", `/v2/loc/${cobResponse.loc.id}/qrcode`);
          qrCodeImage = qrResp.imagemQrcode;
          brCode = qrResp.qrcode;
        } catch {
          // QR code generation can fail; charge is still valid
        }

        const { data: savedCharge, error: saveError } = await adminClient
          .from("woovi_charges")
          .insert({
            parcela_id: parcela_id || null,
            emprestimo_id: emprestimo_id || null,
            cliente_id,
            woovi_charge_id: txid,
            woovi_txid: txid,
            valor,
            status: "ACTIVE",
            br_code: brCode,
            qr_code_image: qrCodeImage,
            payment_link: cobResponse.location || null,
            expiration_date: cobResponse.calendario?.criacao
              ? new Date(
                  new Date(cobResponse.calendario.criacao).getTime() +
                    expiration_seconds * 1000
                ).toISOString()
              : null,
            criado_por: user.id,
            gateway: "efi",
          })
          .select()
          .single();

        if (saveError) {
          console.error("Erro ao salvar cobrança EFI:", saveError);
          return jsonResponse({
            success: false,
            error: `Cobrança criada na EFI (txid=${txid}), mas falhou ao salvar no banco: ${saveError.message}`,
            efi: { txid, brCode, qrCodeImage },
          });
        }

        if (parcela_id) {
          await adminClient
            .from("parcelas")
            .update({ woovi_charge_id: txid })
            .eq("id", parcela_id);
        }

        return jsonResponse({
          success: true,
          charge: savedCharge,
          efi: { txid, brCode, qrCodeImage, location: cobResponse.location },
        });
      }

      // ════════════════════════════════════════════════════
      // CONSULTAR COBRANÇA
      // ════════════════════════════════════════════════════
      case "get_charge": {
        const { charge_id } = body;
        if (!charge_id) return errorResponse("Campo obrigatório: charge_id");

        const cobResp = await efiRequest(creds, "GET", `/v2/cob/${charge_id}`);

        // Mapear status EFI → nosso enum
        const statusMap: Record<string, string> = {
          ATIVA: "ACTIVE",
          CONCLUIDA: "COMPLETED",
          REMOVIDA_PELO_USUARIO_RECEBEDOR: "EXPIRED",
          REMOVIDA_PELO_PSP: "EXPIRED",
        };
        const mappedStatus = statusMap[cobResp.status] || "ACTIVE";

        // Atualizar no banco se mudou
        await adminClient
          .from("woovi_charges")
          .update({ status: mappedStatus })
          .eq("woovi_charge_id", charge_id)
          .eq("gateway", "efi");

        return jsonResponse({ success: true, charge: cobResp, mappedStatus });
      }

      // ════════════════════════════════════════════════════
      // CRIAR PAGAMENTO PIX (envio) — somente admin
      // PUT /v3/gn/pix/:idEnvio (idempotente)
      // ════════════════════════════════════════════════════
      case "create_payment": {
        const {
          emprestimo_id: payEmprestimoId,
          cliente_id: payClienteId,
          valor: payValor,
          pix_key,
          pix_key_type,
          destinatario_nome,
          descricao: payDescricao,
        } = body;

        if (!payValor || !pix_key || !payClienteId) {
          return errorResponse("Campos obrigatórios: valor, pix_key, cliente_id");
        }

        if (!creds.pixKey) throw new Error("Chave PIX do pagador não configurada.");

        const idEnvio = crypto.randomUUID().replace(/-/g, "").substring(0, 35);

        const payPayload: Record<string, unknown> = {
          valor: payValor.toFixed(2),
          pagador: { chave: creds.pixKey, infoPagador: payDescricao?.substring(0, 140) || "" },
          favorecido: { chave: pix_key },
        };

        const payResp = await efiRequest(creds, "PUT", `/v2/gn/pix/${idEnvio}`, payPayload);

        const { data: savedTx, error: txError } = await adminClient
          .from("woovi_transactions")
          .insert({
            emprestimo_id: payEmprestimoId || null,
            cliente_id: payClienteId,
            woovi_transaction_id: idEnvio,
            tipo: "PAYMENT",
            valor: payValor,
            status: "PENDING",
            pix_key,
            pix_key_type: pix_key_type || null,
            destinatario_nome: destinatario_nome || null,
            descricao: payDescricao || `Liberação via EFI - ${destinatario_nome || ""}`,
            end_to_end_id: payResp?.endToEndId || null,
            autorizado_por: user.id,
            autorizado_em: new Date().toISOString(),
            gateway: "efi",
          })
          .select()
          .single();

        if (txError) console.error("Erro ao salvar transação EFI:", txError);

        return jsonResponse({
          success: true,
          transaction: savedTx,
          efi: payResp,
        });
      }

      // ════════════════════════════════════════════════════
      // CONSULTAR SALDO
      // ════════════════════════════════════════════════════
      case "get_balance": {
        const balResp = await efiRequest(creds, "GET", "/v2/gn/saldo");
        return jsonResponse({ success: true, balance: balResp });
      }

      // ════════════════════════════════════════════════════
      // LISTAR COBRANÇAS IMEDIATAS
      // GET /v2/cob?inicio=...&fim=...&status=...
      // ════════════════════════════════════════════════════
      case "list_charges": {
        const { inicio, fim, status: cobStatus, paginacao_pagina_atual } = body;
        if (!inicio || !fim) return errorResponse("Campos obrigatórios: inicio, fim (ISO 8601)");
        let qs = `?inicio=${encodeURIComponent(inicio)}&fim=${encodeURIComponent(fim)}`;
        if (cobStatus) qs += `&status=${cobStatus}`;
        if (paginacao_pagina_atual) qs += `&paginacao.paginaAtual=${paginacao_pagina_atual}`;
        const listResp = await efiRequest(creds, "GET", `/v2/cob${qs}`);
        return jsonResponse({ success: true, ...listResp });
      }

      // ════════════════════════════════════════════════════
      // CRIAR COBRANÇA COM VENCIMENTO (cobv)
      // PUT /v2/cobv/:txid
      // ════════════════════════════════════════════════════
      case "create_cobv": {
        const {
          parcela_id: cobvParcelaId,
          emprestimo_id: cobvEmprestimoId,
          cliente_id: cobvClienteId,
          valor: cobvValor,
          descricao: cobvDescricao,
          cliente_nome: cobvNome,
          cliente_cpf: cobvCpf,
          data_vencimento,
          multa,
          juros,
          desconto,
        } = body;

        if (!cobvValor || !cobvClienteId || !data_vencimento) {
          return errorResponse("Campos obrigatórios: valor, cliente_id, data_vencimento");
        }
        if (!creds.pixKey) throw new Error("Chave PIX não configurada.");

        const cobvTxid = crypto.randomUUID().replace(/-/g, "").substring(0, 35);
        const cobvPayload: Record<string, unknown> = {
          calendario: { dataDeVencimento: data_vencimento, validadeAposVencimento: 30 },
          valor: { original: cobvValor.toFixed(2) },
          chave: creds.pixKey,
        };
        if (cobvCpf) {
          cobvPayload.devedor = { cpf: cobvCpf.replace(/\D/g, ""), nome: cobvNome || "Cliente" };
        }
        if (cobvDescricao) cobvPayload.solicitacaoPagador = cobvDescricao.substring(0, 140);
        if (multa) cobvPayload.valor = { ...(cobvPayload.valor as Record<string, unknown>), multa };
        if (juros) cobvPayload.valor = { ...(cobvPayload.valor as Record<string, unknown>), juros };
        if (desconto) cobvPayload.valor = { ...(cobvPayload.valor as Record<string, unknown>), desconto };

        const cobvResp = await efiRequest(creds, "PUT", `/v2/cobv/${cobvTxid}`, cobvPayload);

        let cobvQr = null, cobvBrCode = null;
        try {
          let locId = cobvResp.loc?.id;
          // cobv nem sempre retorna loc no PUT — consultar via GET se necessário
          if (!locId) {
            const cobvGet = await efiRequest(creds, "GET", `/v2/cobv/${cobvTxid}`);
            locId = cobvGet.loc?.id;
          }
          if (locId) {
            const qr = await efiRequest(creds, "GET", `/v2/loc/${locId}/qrcode`);
            cobvQr = qr.imagemQrcode;
            cobvBrCode = qr.qrcode;
          }
        } catch { /* QR code optional */ }

        const { data: savedCobv } = await adminClient
          .from("woovi_charges")
          .insert({
            parcela_id: cobvParcelaId || null,
            emprestimo_id: cobvEmprestimoId || null,
            cliente_id: cobvClienteId,
            woovi_charge_id: cobvTxid,
            woovi_txid: cobvTxid,
            valor: cobvValor,
            status: "ACTIVE",
            br_code: cobvBrCode,
            qr_code_image: cobvQr,
            payment_link: cobvResp.location || null,
            expiration_date: data_vencimento,
            criado_por: user.id,
            gateway: "efi",
          })
          .select()
          .single();

        if (cobvParcelaId) {
          await adminClient.from("parcelas").update({ woovi_charge_id: cobvTxid }).eq("id", cobvParcelaId);
        }

        return jsonResponse({ success: true, charge: savedCobv, efi: cobvResp });
      }

      // ════════════════════════════════════════════════════
      // CONSULTAR COBRANÇA COM VENCIMENTO
      // GET /v2/cobv/:txid
      // ════════════════════════════════════════════════════
      case "get_cobv": {
        const { txid: cobvTxid2 } = body;
        if (!cobvTxid2) return errorResponse("Campo obrigatório: txid");
        const cobvR = await efiRequest(creds, "GET", `/v2/cobv/${cobvTxid2}`);
        const statusMap2: Record<string, string> = {
          ATIVA: "ACTIVE", CONCLUIDA: "COMPLETED",
          REMOVIDA_PELO_USUARIO_RECEBEDOR: "EXPIRED", REMOVIDA_PELO_PSP: "EXPIRED",
        };
        const mapped2 = statusMap2[cobvR.status] || "ACTIVE";
        await adminClient.from("woovi_charges").update({ status: mapped2 }).eq("woovi_charge_id", cobvTxid2).eq("gateway", "efi");
        return jsonResponse({ success: true, charge: cobvR, mappedStatus: mapped2 });
      }

      // ════════════════════════════════════════════════════
      // LISTAR COBRANÇAS COM VENCIMENTO
      // GET /v2/cobv?inicio=...&fim=...
      // ════════════════════════════════════════════════════
      case "list_cobv": {
        const { inicio: cobvInicio, fim: cobvFim, status: cobvStatus2 } = body;
        if (!cobvInicio || !cobvFim) return errorResponse("Campos obrigatórios: inicio, fim");
        let cobvQs = `?inicio=${encodeURIComponent(cobvInicio)}&fim=${encodeURIComponent(cobvFim)}`;
        if (cobvStatus2) cobvQs += `&status=${cobvStatus2}`;
        const cobvList = await efiRequest(creds, "GET", `/v2/cobv${cobvQs}`);
        return jsonResponse({ success: true, ...cobvList });
      }

      // ════════════════════════════════════════════════════
      // CONSULTAR PIX ENVIADO POR idEnvio
      // GET /v2/gn/pix/enviados/id-envio/:idEnvio
      // ════════════════════════════════════════════════════
      case "get_sent_pix": {
        const { id_envio } = body;
        if (!id_envio) return errorResponse("Campo obrigatório: id_envio");
        const sentResp = await efiRequest(creds, "GET", `/v2/gn/pix/enviados/id-envio/${id_envio}`);
        return jsonResponse({ success: true, pix: sentResp });
      }

      // ════════════════════════════════════════════════════
      // LISTAR PIX ENVIADOS
      // GET /v2/gn/pix/enviados?inicio=...&fim=...
      // ════════════════════════════════════════════════════
      case "list_sent_pix": {
        const { inicio: sentInicio, fim: sentFim, status: sentStatus } = body;
        if (!sentInicio || !sentFim) return errorResponse("Campos obrigatórios: inicio, fim");
        let sentQs = `?inicio=${encodeURIComponent(sentInicio)}&fim=${encodeURIComponent(sentFim)}`;
        if (sentStatus) sentQs += `&status=${sentStatus}`;
        const sentList = await efiRequest(creds, "GET", `/v2/gn/pix/enviados${sentQs}`);
        return jsonResponse({ success: true, ...sentList });
      }

      // ════════════════════════════════════════════════════
      // CONSULTAR PIX RECEBIDO
      // GET /v2/pix/:e2eId
      // ════════════════════════════════════════════════════
      case "get_pix": {
        const { e2e_id } = body;
        if (!e2e_id) return errorResponse("Campo obrigatório: e2e_id");
        const pixResp = await efiRequest(creds, "GET", `/v2/pix/${e2e_id}`);
        return jsonResponse({ success: true, pix: pixResp });
      }

      // ════════════════════════════════════════════════════
      // LISTAR PIX RECEBIDOS
      // GET /v2/pix?inicio=...&fim=...
      // ════════════════════════════════════════════════════
      case "list_pix": {
        const { inicio: pixInicio, fim: pixFim } = body;
        if (!pixInicio || !pixFim) return errorResponse("Campos obrigatórios: inicio, fim");
        const pixQs = `?inicio=${encodeURIComponent(pixInicio)}&fim=${encodeURIComponent(pixFim)}`;
        const pixList = await efiRequest(creds, "GET", `/v2/pix${pixQs}`);
        return jsonResponse({ success: true, ...pixList });
      }

      // ════════════════════════════════════════════════════
      // SOLICITAR DEVOLUÇÃO
      // PUT /v2/pix/:e2eId/devolucao/:id
      // ════════════════════════════════════════════════════
      case "request_refund": {
        const { e2e_id: refE2e, refund_id, valor: refValor } = body;
        if (!refE2e || !refValor) return errorResponse("Campos obrigatórios: e2e_id, valor");
        const devId = refund_id || crypto.randomUUID().replace(/-/g, "").substring(0, 35);
        const devResp = await efiRequest(creds, "PUT", `/v2/pix/${refE2e}/devolucao/${devId}`, {
          valor: refValor.toFixed(2),
        });
        return jsonResponse({ success: true, refund: devResp });
      }

      // ════════════════════════════════════════════════════
      // CONSULTAR DEVOLUÇÃO
      // GET /v2/pix/:e2eId/devolucao/:id
      // ════════════════════════════════════════════════════
      case "get_refund": {
        const { e2e_id: refE2e2, refund_id: refId2 } = body;
        if (!refE2e2 || !refId2) return errorResponse("Campos obrigatórios: e2e_id, refund_id");
        const refResp = await efiRequest(creds, "GET", `/v2/pix/${refE2e2}/devolucao/${refId2}`);
        return jsonResponse({ success: true, refund: refResp });
      }

      // ════════════════════════════════════════════════════
      // CONFIGURAR WEBHOOK PIX
      // PUT /v2/webhook/:chave
      // ════════════════════════════════════════════════════
      case "configure_webhook": {
        const { webhook_url } = body;
        if (!webhook_url) return errorResponse("Campo obrigatório: webhook_url");
        if (!creds.pixKey) throw new Error("Chave PIX não configurada.");
        const whResp = await efiRequest(creds, "PUT", `/v2/webhook/${encodeURIComponent(creds.pixKey)}`, {
          webhookUrl: webhook_url,
        }, { "x-skip-mtls-checking": "true" });
        return jsonResponse({ success: true, webhook: whResp });
      }

      // ════════════════════════════════════════════════════
      // LISTAR WEBHOOKS
      // GET /v2/webhook?inicio=...&fim=...
      // ════════════════════════════════════════════════════
      case "list_webhooks": {
        const { inicio: whInicio, fim: whFim } = body;
        if (!whInicio || !whFim) return errorResponse("Campos obrigatórios: inicio, fim");
        const whQs = `?inicio=${encodeURIComponent(whInicio)}&fim=${encodeURIComponent(whFim)}`;
        const whList = await efiRequest(creds, "GET", `/v2/webhook${whQs}`);
        return jsonResponse({ success: true, ...whList });
      }

      // ════════════════════════════════════════════════════
      // DELETAR WEBHOOK
      // DELETE /v2/webhook/:chave
      // ════════════════════════════════════════════════════
      case "delete_webhook": {
        if (!creds.pixKey) throw new Error("Chave PIX não configurada.");
        const delResp = await efiRequest(creds, "DELETE", `/v2/webhook/${encodeURIComponent(creds.pixKey)}`);
        return jsonResponse({ success: true, webhook: delResp });
      }

      default:
        return errorResponse(`Ação desconhecida: ${action}`);
    }
  } catch (err) {
    console.error("Erro na Edge Function efi:", err);
    return jsonResponse({
      error: err instanceof Error ? err.message : "Erro interno",
      success: false,
    });
  }
});
