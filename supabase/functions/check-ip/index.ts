import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { corsHeaders } from '../_shared/cors.ts';

/**
 * Edge Function: check-ip
 *
 * Validates if the caller's IP is in the allowed_ips whitelist.
 * Used by the desktop app on startup.
 *
 * GET  /check-ip           → checks caller's real IP
 * POST /check-ip           → { ip: "x.x.x.x" } checks specific IP
 * POST /check-ip/redeem    → { token: "...", label?: "..." } redeems emergency token
 */

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function getClientIp(req: Request): string {
  const headers = [
    'x-real-ip',
    'cf-connecting-ip',
    'x-forwarded-for',
    'x-envoy-external-address',
  ];
  for (const h of headers) {
    const val = req.headers.get(h);
    if (val) return val.split(',')[0].trim();
  }
  return '0.0.0.0';
}

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const url = new URL(req.url);
  const clientIp = getClientIp(req);

  try {
    // ── Redeem emergency token ───────────────────────────
    if (url.pathname.endsWith('/redeem') && req.method === 'POST') {
      const { token, label } = await req.json();
      if (!token) {
        return new Response(
          JSON.stringify({ error: 'Token obrigatório' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data, error } = await supabase.rpc('redeem_emergency_token', {
        p_token: token,
        p_ip: clientIp,
        p_label: label || null,
      });

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: data === true, ip: clientIp }),
        { status: data ? 200 : 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Check IP ─────────────────────────────────────────
    let ipToCheck = clientIp;

    if (req.method === 'POST') {
      const body = await req.json();
      if (body.ip) ipToCheck = body.ip;
    }

    const { data, error } = await supabase.rpc('check_ip_allowed', {
      check_ip: ipToCheck,
    });

    if (error) throw error;

    return new Response(
      JSON.stringify({
        allowed: data === true,
        ip: ipToCheck,
        checked_at: new Date().toISOString(),
      }),
      {
        status: data ? 200 : 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
