/**
 * Edge Function: cron-post-status
 *
 * Varre `status_schedule` a cada execução (recomendado: 15 em 15 min via
 * pg_cron) e publica os agendamentos elegíveis no status do WhatsApp via
 * Evolution API endpoint `/message/sendStatus/{instance}`.
 *
 * Critério de elegibilidade:
 *   - schedule.ativo = true
 *   - schedule.dia_semana == hoje (em America/Sao_Paulo)
 *   - schedule.hora == hora atual
 *   - schedule.minuto >= minuto_inicio_janela e <= minuto atual
 *   - ainda NÃO postou hoje (ultimo_post_em < startOfDay)
 *
 * Cada execução loga em `status_post_log` e atualiza `status_schedule`.
 *
 * Deploy: supabase functions deploy cron-post-status --no-verify-jwt
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const TZ = "America/Sao_Paulo";

function nowInTz(): { dow: number; hora: number; minuto: number; date: Date } {
  const d = new Date();
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hour12: false,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  const parts = fmt.formatToParts(d).reduce<Record<string, string>>((acc, p) => {
    acc[p.type] = p.value;
    return acc;
  }, {});
  const dowMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  return {
    dow: dowMap[parts.weekday] ?? d.getUTCDay(),
    hora: parseInt(parts.hour, 10),
    minuto: parseInt(parts.minute, 10),
    date: d,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE);

  const summary = { total: 0, sucesso: 0, erro: 0, pulado: 0, detalhes: [] as unknown[] };

  try {
    const { dow, hora, minuto } = nowInTz();
    // Janela de 15 min: pega slots cujo minuto está entre [minuto-15, minuto]
    const minutoInicio = Math.max(0, minuto - 15);

    const { data: slots, error } = await adminClient
      .from("status_schedule")
      .select(`
        id, midia_asset_id, instancia_id, hora, minuto, ultimo_post_em, ativo,
        auto_generate, prompt_ia, provedor_ia, regenerar_a_cada_post, caption_override,
        midia:midia_assets!midia_asset_id(id, secure_url, caption, formato, ativo),
        instancia:whatsapp_instancias(id, instance_name, instance_token, evolution_url, status)
      `)
      .eq("ativo", true)
      .eq("dia_semana", dow)
      .eq("hora", hora)
      .gte("minuto", minutoInicio)
      .lte("minuto", minuto);

    if (error) throw error;
    summary.total = slots?.length ?? 0;

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    for (const slot of slots ?? []) {
      // Já postou hoje?
      if (slot.ultimo_post_em && new Date(slot.ultimo_post_em) >= startOfDay) {
        summary.pulado++;
        await adminClient.from("status_post_log").insert({
          schedule_id: slot.id,
          midia_asset_id: slot.midia_asset_id,
          instancia_id: slot.instancia_id,
          status: "pulado",
          erro_msg: "Já postado hoje",
        });
        continue;
      }

      const midia = slot.midia as any;
      const inst = slot.instancia as any;

      // ── Auto-gen via Gemini, se solicitado ─────────────────
      let runtimeMidia: { secure_url: string; formato: string; caption: string | null } | null =
        midia && midia.ativo ? midia : null;

      if ((slot as any).auto_generate && (slot as any).prompt_ia) {
        const precisaGerar =
          !runtimeMidia ||
          (slot as any).regenerar_a_cada_post === true;

        if (precisaGerar) {
          try {
            const genUrl = `${SUPABASE_URL}/functions/v1/generate-image-gemini`;
            const genRes = await fetch(genUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${SERVICE_ROLE}`,
              },
              body: JSON.stringify({
                prompt: (slot as any).prompt_ia,
                tipo: "status_template",
                titulo: `Auto-gen ${new Date().toISOString().slice(0, 10)}`,
                save: true,
                scheduleId: slot.id,
                replaceAssetId: slot.midia_asset_id ?? undefined,
              }),
            });
            const genJson = await genRes.json();
            if (!genRes.ok || !genJson?.asset?.secure_url) {
              throw new Error(genJson?.error ?? `gemini HTTP ${genRes.status}`);
            }
            runtimeMidia = {
              secure_url: genJson.asset.secure_url,
              formato: "image",
              caption: genJson.asset.caption ?? null,
            };
            // Se não havia midia_asset_id, vincular ao slot
            if (!slot.midia_asset_id) {
              await adminClient
                .from("status_schedule")
                .update({ midia_asset_id: genJson.asset.id })
                .eq("id", slot.id);
            }
          } catch (e) {
            summary.erro++;
            await adminClient.from("status_post_log").insert({
              schedule_id: slot.id,
              midia_asset_id: slot.midia_asset_id,
              instancia_id: slot.instancia_id,
              status: "erro",
              erro_msg: `Geração Gemini falhou: ${(e as Error).message ?? e}`,
            });
            continue;
          }
        }
      }

      if (!runtimeMidia?.secure_url) {
        summary.erro++;
        summary.detalhes.push({ slot: slot.id, erro: "Mídia inativa ou sem URL" });
        await adminClient.from("status_post_log").insert({
          schedule_id: slot.id,
          midia_asset_id: slot.midia_asset_id,
          instancia_id: slot.instancia_id,
          status: "erro",
          erro_msg: "Mídia inativa ou sem URL",
        });
        continue;
      }

      if (!inst || inst.status !== "connected" || !inst.instance_token) {
        summary.erro++;
        await adminClient.from("status_post_log").insert({
          schedule_id: slot.id,
          midia_asset_id: slot.midia_asset_id,
          instancia_id: slot.instancia_id,
          status: "erro",
          erro_msg: `Instância indisponível (status=${inst?.status ?? "null"})`,
        });
        continue;
      }

      const envUrl = Deno.env.get("EVOLUTION_API_URL");
      const baseUrl = (envUrl || inst.evolution_url || "").replace(/\/$/, "");
      const evoUrl = `${baseUrl}/message/sendStatus/${encodeURIComponent(inst.instance_name)}`;

      const payload = {
        type: runtimeMidia.formato === "video" ? "video" : "image",
        content: runtimeMidia.secure_url,
        caption: (slot as any).caption_override ?? runtimeMidia.caption ?? "",
        allContacts: true,
      };

      try {
        const res = await fetch(evoUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: inst.instance_token },
          body: JSON.stringify(payload),
        });
        const text = await res.text();

        if (res.ok) {
          summary.sucesso++;
          await adminClient
            .from("status_schedule")
            .update({
              ultimo_post_em: new Date().toISOString(),
              ultimo_post_status: "sucesso",
              ultimo_post_erro: null,
              total_posts: ((slot as any).total_posts ?? 0) + 1,
            })
            .eq("id", slot.id);
          await adminClient.from("status_post_log").insert({
            schedule_id: slot.id,
            midia_asset_id: slot.midia_asset_id,
            instancia_id: slot.instancia_id,
            status: "sucesso",
            evolution_response: text.slice(0, 1000),
          });
        } else {
          summary.erro++;
          await adminClient
            .from("status_schedule")
            .update({
              ultimo_post_status: "erro",
              ultimo_post_erro: text.slice(0, 500),
            })
            .eq("id", slot.id);
          await adminClient.from("status_post_log").insert({
            schedule_id: slot.id,
            midia_asset_id: slot.midia_asset_id,
            instancia_id: slot.instancia_id,
            status: "erro",
            erro_msg: `HTTP ${res.status}`,
            evolution_response: text.slice(0, 1000),
          });
        }
      } catch (e) {
        summary.erro++;
        await adminClient.from("status_post_log").insert({
          schedule_id: slot.id,
          midia_asset_id: slot.midia_asset_id,
          instancia_id: slot.instancia_id,
          status: "erro",
          erro_msg: String((e as Error).message ?? e),
        });
      }
    }

    return new Response(JSON.stringify(summary), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String((err as Error).message ?? err), summary }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
