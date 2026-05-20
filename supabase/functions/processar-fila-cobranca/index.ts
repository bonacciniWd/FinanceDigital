/**
 * Edge Function: processar-fila-cobranca
 *
 * Consome itens pendentes de `cobranca_fila` respeitando:
 *  - janela de horário + dias da semana do agendamento associado
 *  - intervalo mínimo entre envios para o mesmo cliente
 *  - limites globais (por hora / por dia)
 *
 * Despacha cada item via send-whatsapp (chamada interna) e
 * atualiza o status na fila + grava log em whatsapp_mensagens_log
 * (que por trigger alimenta `timeline_interacoes`).
 *
 * Invocação sugerida via pg_cron a cada 5 minutos:
 *   SELECT cron.schedule(
 *     'processar-fila-cobranca',
 *     '*\/5 * * * *',
 *     $$ SELECT net.http_post(
 *          url := 'https://<ref>.supabase.co/functions/v1/processar-fila-cobranca',
 *          headers := '{"Authorization": "Bearer <service_role>"}'::jsonb
 *        ); $$
 *   );
 *
 * Deploy: supabase functions deploy processar-fila-cobranca --no-verify-jwt
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

interface FilaItem {
  id: string;
  agendamento_id: string | null;
  cliente_id: string;
  emprestimo_id: string | null;
  template_id: string | null;
  instancia_id: string | null;
  telefone: string;
  mensagem: string;
  agendado_para: string;
  tentativas: number;
}

interface Agendamento {
  id: string;
  ativo: boolean;
  horario_inicio: string;
  horario_fim: string;
  timezone: string;
  dias_semana: number[];
  intervalo_min_horas: number;
  intervalo_entre_envios_seg: number;
  max_disparos_por_dia_cli: number;
  max_disparos_por_hora: number;
  max_disparos_por_dia: number;
}

function localParts(tz: string, now = new Date()) {
  // Retorna {dow ISO 1..7, time HH:mm:ss} no fuso solicitado
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const wkMap: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  const wk = fmt.find((p) => p.type === "weekday")?.value ?? "Mon";
  const h = fmt.find((p) => p.type === "hour")?.value ?? "00";
  const m = fmt.find((p) => p.type === "minute")?.value ?? "00";
  const s = fmt.find((p) => p.type === "second")?.value ?? "00";
  return { dow: wkMap[wk] ?? 1, time: `${h}:${m}:${s}` };
}

function inWindow(ag: Agendamento): boolean {
  if (!ag.ativo) return false;
  const { dow, time } = localParts(ag.timezone);
  if (!ag.dias_semana.includes(dow)) return false;
  return time >= ag.horario_inicio && time <= ag.horario_fim;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const result = {
    processados: 0,
    enviados: 0,
    fora_horario: 0,
    bloqueados_intervalo: 0,
    falhas: 0,
    pulados: 0,
  };

  try {
    // 1. Buscar lote de itens pendentes (até 50 por execução)
    const { data: itens, error: itensErr } = await admin
      .from("cobranca_fila")
      .select("*")
      .in("status", ["pendente", "fora_horario"])
      .lte("agendado_para", new Date().toISOString())
      .order("agendado_para", { ascending: true })
      .limit(50);

    if (itensErr) throw itensErr;
    if (!itens || itens.length === 0) {
      return new Response(JSON.stringify({ ok: true, result, msg: "fila vazia" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Pré-carregar agendamentos em uso
    const agIds = [...new Set(itens.map((i) => i.agendamento_id).filter(Boolean))] as string[];
    const { data: ags } = await admin
      .from("cobranca_agendamentos")
      .select("*")
      .in("id", agIds.length ? agIds : ["00000000-0000-0000-0000-000000000000"]);
    const agMap = new Map<string, Agendamento>((ags ?? []).map((a: Agendamento) => [a.id, a]));

    // 3. Limites globais (contagem por hora/dia)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { count: enviadosHora = 0 } = await admin
      .from("cobranca_fila")
      .select("*", { count: "exact", head: true })
      .eq("status", "enviado")
      .gte("enviado_em", oneHourAgo);
    const { count: enviadosDia = 0 } = await admin
      .from("cobranca_fila")
      .select("*", { count: "exact", head: true })
      .eq("status", "enviado")
      .gte("enviado_em", oneDayAgo);

    let contadorHora = enviadosHora ?? 0;
    let contadorDia = enviadosDia ?? 0;

    // 4. Processar cada item
    for (const item of itens as FilaItem[]) {
      result.processados++;

      const ag = item.agendamento_id ? agMap.get(item.agendamento_id) : null;

      // 4a. Fora da janela?
      if (ag && !inWindow(ag)) {
        await admin
          .from("cobranca_fila")
          .update({ status: "fora_horario", ultimo_erro: "Fora da janela de horário/dia" })
          .eq("id", item.id);
        result.fora_horario++;
        continue;
      }

      // 4b. Limites globais
      if (ag && (contadorHora >= ag.max_disparos_por_hora || contadorDia >= ag.max_disparos_por_dia)) {
        result.pulados++;
        continue;
      }

      // 4c. Intervalo mínimo entre envios para o mesmo cliente
      if (ag && ag.intervalo_min_horas > 0) {
        const since = new Date(Date.now() - ag.intervalo_min_horas * 60 * 60 * 1000).toISOString();
        const { count: recentes = 0 } = await admin
          .from("cobranca_fila")
          .select("*", { count: "exact", head: true })
          .eq("cliente_id", item.cliente_id)
          .eq("status", "enviado")
          .gte("enviado_em", since);
        if ((recentes ?? 0) >= ag.max_disparos_por_dia_cli) {
          await admin
            .from("cobranca_fila")
            .update({
              status: "cancelado",
              ultimo_erro: `Intervalo mínimo (${ag.intervalo_min_horas}h) ainda não atingido`,
            })
            .eq("id", item.id);
          result.bloqueados_intervalo++;
          continue;
        }
      }

      // 4d. Marcar como enviando
      await admin
        .from("cobranca_fila")
        .update({ status: "enviando", tentativas: item.tentativas + 1 })
        .eq("id", item.id);

      // 4e. Resolver instância (do item ou default da regra)
      const instId = item.instancia_id;
      if (!instId) {
        await admin
          .from("cobranca_fila")
          .update({ status: "falha", ultimo_erro: "Instância WhatsApp não definida" })
          .eq("id", item.id);
        result.falhas++;
        continue;
      }

      // 4f. Chamar send-whatsapp internamente
      try {
        const resp = await fetch(`${supabaseUrl}/functions/v1/send-whatsapp`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            instancia_id: instId,
            telefone: item.telefone,
            conteudo: item.mensagem,
            tipo: "text",
            cliente_id: item.cliente_id,
          }),
        });
        const respJson = await resp.json();

        if (!resp.ok) {
          await admin
            .from("cobranca_fila")
            .update({
              status: "falha",
              ultimo_erro: respJson?.error ?? `HTTP ${resp.status}`,
            })
            .eq("id", item.id);
          result.falhas++;
          continue;
        }

        await admin
          .from("cobranca_fila")
          .update({
            status: "enviado",
            enviado_em: new Date().toISOString(),
            log_id: respJson?.log_id ?? null,
            ultimo_erro: null,
          })
          .eq("id", item.id);

        // Incrementa stats do agendamento
        if (ag) {
          await admin
            .from("cobranca_agendamentos")
            .update({ total_disparos: ((ag as any).total_disparos ?? 0) + 1 })
            .eq("id", ag.id);
        }

        result.enviados++;
        contadorHora++;
        contadorDia++;

        // 4g. Delay anti-ban entre disparos consecutivos
        const delaySeg = ag?.intervalo_entre_envios_seg ?? 0;
        if (delaySeg > 0) {
          await new Promise((r) => setTimeout(r, delaySeg * 1000));
        }
      } catch (err) {
        await admin
          .from("cobranca_fila")
          .update({ status: "falha", ultimo_erro: String(err) })
          .eq("id", item.id);
        result.falhas++;
      }
    }

    return new Response(JSON.stringify({ ok: true, result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[processar-fila-cobranca] erro:", err);
    return new Response(JSON.stringify({ ok: false, error: String(err), result }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
