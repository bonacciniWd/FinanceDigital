/**
 * Vercel Edge Middleware — IP whitelist para rotas protegidas.
 *
 * Fluxo:
 * 1. Requisição chega em /download ou /api/download/*
 * 2. Extrai IP real do visitante via headers
 * 3. Consulta Supabase (check_ip_allowed) via REST
 * 4. Se não autorizado → 404
 * 5. Se autorizado → continua normalmente
 */

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

function getClientIp(request: Request): string {
  const headers = [
    'x-real-ip',
    'cf-connecting-ip',
    'x-forwarded-for',
    'x-vercel-forwarded-for',
  ];

  for (const header of headers) {
    const value = request.headers.get(header);
    if (value) {
      const ip = value.split(',')[0].trim();
      if (ip && ip !== '127.0.0.1' && ip !== '::1') {
        return ip;
      }
    }
  }

  return '0.0.0.0';
}

async function isIpAllowed(ip: string): Promise<boolean> {
  const key = SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY;
  if (!SUPABASE_URL || !key) {
    console.warn('[middleware] Supabase not configured, allowing request');
    return true;
  }

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/rpc/check_ip_allowed`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: key,
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({ check_ip: ip }),
      }
    );

    if (!res.ok) {
      console.error('[middleware] Supabase check failed:', res.status);
      return false;
    }

    const result = await res.json();
    return result === true;
  } catch (err) {
    console.error('[middleware] IP check error:', err);
    return false;
  }
}

export default async function middleware(request: Request) {
  const url = new URL(request.url);

  // Only protect /download routes — let everything else pass
  if (!url.pathname.startsWith('/download')) {
    return;
  }

  const clientIp = getClientIp(request);
  const allowed = await isIpAllowed(clientIp);

  if (!allowed) {
    return new Response(
      '<!DOCTYPE html><html><head><title>404</title></head><body><h1>404 - Not Found</h1></body></html>',
      {
        status: 404,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      }
    );
  }

  // Return undefined to continue to the next handler (pass-through)
  return;
}

export const config = {
  matcher: ['/download', '/download/:path*'],
};
