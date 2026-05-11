/**
 * Cliente compartilhado para a API Extratos da EFI Bank (CNAB 240).
 *
 * Reusa credenciais (client_id, client_secret, cert_pem, key_pem) de
 * gateways_pagamento.config (nome='efi'). mTLS obrigatório.
 *
 * Use nas edge functions:
 *   - efi-extratos (proxy autenticado para o frontend)
 *   - cron-extrato-semanal (orquestrador semanal)
 *
 * Importante: a API Extratos só existe em PRODUÇÃO (não há sandbox).
 * Cada arquivo gerado custa R$ 6,00 — só baixar quando necessário.
 */
// @ts-ignore — imports remotos
import type { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EFI_EXTRATOS_BASE = "https://extratos.api.efipay.com.br";

export interface EfiExtratosCreds {
  clientId: string;
  clientSecret: string;
  certPem: string;
  keyPem: string;
}

export interface EfiExtratosResponse {
  status: number;
  data: unknown;
  bytes?: Uint8Array;
  contentType?: string;
}

let cachedToken: { token: string; expiresAt: number } | null = null;
let cachedClient: Deno.HttpClient | null = null;

function getMtlsClient(creds: EfiExtratosCreds): Deno.HttpClient {
  if (cachedClient) return cachedClient;
  if (!creds.certPem || !creds.keyPem) {
    throw new Error("Certificado PEM e Chave Privada são obrigatórios.");
  }
  cachedClient = Deno.createHttpClient({ cert: creds.certPem, key: creds.keyPem });
  return cachedClient;
}

async function getAccessToken(creds: EfiExtratosCreds): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.token;
  if (!creds.clientId || !creds.clientSecret) {
    throw new Error("Client ID e Client Secret são obrigatórios.");
  }
  const basic = btoa(`${creds.clientId}:${creds.clientSecret}`);
  const client = getMtlsClient(creds);
  const resp = await fetch(`${EFI_EXTRATOS_BASE}/v1/oauth/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/json" },
    body: JSON.stringify({ grant_type: "client_credentials" }),
    // @ts-ignore Deno mTLS client
    client,
  });
  if (!resp.ok) {
    const txt = await resp.text();
    cachedToken = null;
    throw new Error(
      `EFI Extratos auth ${resp.status}: ${txt}. ` +
      "Verifique se a aplicação tem os escopos da API Extratos habilitados.",
    );
  }
  const data = await resp.json();
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };
  return cachedToken.token;
}

async function efiExtratosRequest(
  creds: EfiExtratosCreds,
  method: string,
  path: string,
  body?: unknown,
  expectBinary = false,
): Promise<EfiExtratosResponse> {
  const token = await getAccessToken(creds);
  const client = getMtlsClient(creds);
  const resp = await fetch(`${EFI_EXTRATOS_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    // @ts-ignore Deno mTLS client
    client,
  });

  const contentType = resp.headers.get("content-type") || "";

  if (expectBinary && resp.ok) {
    const bytes = new Uint8Array(await resp.arrayBuffer());
    return { status: resp.status, data: null, bytes, contentType };
  }

  let data: unknown = null;
  const text = await resp.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!resp.ok) {
    throw new Error(
      `EFI Extratos ${method} ${path} → ${resp.status}: ${
        typeof data === "string" ? data : JSON.stringify(data)
      }`,
    );
  }
  return { status: resp.status, data, contentType };
}

export async function loadEfiExtratosCreds(
  adminClient: ReturnType<typeof createClient>,
): Promise<EfiExtratosCreds> {
  const { data: gateway, error } = await adminClient
    .from("gateways_pagamento")
    .select("ativo, config")
    .eq("nome", "efi")
    .single();
  if (error || !gateway) {
    throw new Error("Gateway EFI não encontrado em gateways_pagamento.");
  }
  if (!gateway.ativo) {
    throw new Error("Gateway EFI está inativo.");
  }
  const cfg = (gateway.config ?? {}) as Record<string, unknown>;
  return {
    clientId: (cfg.client_id as string) || Deno.env.get("EFI_CLIENT_ID") || "",
    clientSecret: (cfg.client_secret as string) || Deno.env.get("EFI_CLIENT_SECRET") || "",
    certPem: (cfg.cert_pem as string) || Deno.env.get("EFI_CERT_PEM") || "",
    keyPem: (cfg.key_pem as string) || Deno.env.get("EFI_KEY_PEM") || "",
  };
}

export async function callEfiExtratos(
  adminClient: ReturnType<typeof createClient>,
  action: string,
  params: Record<string, unknown> = {},
): Promise<EfiExtratosResponse> {
  const creds = await loadEfiExtratosCreds(adminClient);
  cachedToken = null;
  cachedClient = null;

  switch (action) {
    case "list_files": {
      const qs = new URLSearchParams();
      if (params.data_inicio) qs.set("data_inicio", String(params.data_inicio));
      if (params.data_fim) qs.set("data_fim", String(params.data_fim));
      const path = `/v1/extrato-cnab/arquivos${qs.toString() ? `?${qs}` : ""}`;
      return await efiExtratosRequest(creds, "GET", path);
    }
    case "download_file": {
      const nome = params.nome_arquivo as string;
      if (!nome) throw new Error("nome_arquivo é obrigatório");
      return await efiExtratosRequest(
        creds,
        "GET",
        `/v1/extrato-cnab/download/${encodeURIComponent(nome)}`,
        undefined,
        true,
      );
    }
    case "list_schedules":
      return await efiExtratosRequest(creds, "GET", "/v1/extrato-cnab/agendamentos");
    case "create_schedule":
      return await efiExtratosRequest(creds, "POST", "/v1/extrato-cnab/agendar", params);
    case "update_schedule": {
      const id = params.identificador as string;
      if (!id) throw new Error("identificador é obrigatório");
      return await efiExtratosRequest(
        creds,
        "PATCH",
        `/v1/extrato-cnab/agendar/${encodeURIComponent(id)}`,
        params,
      );
    }
    default:
      throw new Error(`Ação desconhecida: ${action}`);
  }
}
