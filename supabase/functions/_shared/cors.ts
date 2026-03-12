/**
 * CORS headers compartilhados entre Edge Functions.
 * Ajuste 'Access-Control-Allow-Origin' em produção.
 */
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-dev-bypass-key",
};
