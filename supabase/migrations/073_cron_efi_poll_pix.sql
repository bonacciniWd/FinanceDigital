-- ══════════════════════════════════════════════════════════════════════════
-- Migration 073: Agendar cron-efi-poll-pix (reconciliação de PIX enviados)
--
-- A EFI processa o envio de PIX assincronamente: o endpoint PUT
-- /v3/gn/pix/:idEnvio retorna 201 com status=EM_PROCESSAMENTO e só depois
-- evolui para REALIZADO ou NAO_REALIZADO/DEVOLVIDO. A EFI NÃO envia webhook
-- para PIX enviados (apenas para recebidos), então precisamos pollar.
--
-- Este cron roda a cada 1 minuto e chama a edge function cron-efi-poll-pix
-- que consulta /v2/gn/pix/enviados/id-envio/:idEnvio para cada
-- woovi_transactions onde gateway='efi' tipo='payment' status='pending' e
-- atualiza:
--   - REALIZADO    → status='completed' + emprestimos.desembolsado=true
--   - NAO_REALIZADO/DEVOLVIDO → status='failed' + emprestimos.desembolsado=false
-- ══════════════════════════════════════════════════════════════════════════

-- Garante extensões necessárias (já criadas em migrations anteriores).
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
DECLARE
  v_url TEXT;
  v_token TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron indisponível — agendamento ignorado.';
    RETURN;
  END IF;

  BEGIN
    v_url := current_setting('app.settings.supabase_url', true);
  EXCEPTION WHEN OTHERS THEN v_url := NULL;
  END;
  BEGIN
    v_token := current_setting('app.settings.service_role_key', true);
  EXCEPTION WHEN OTHERS THEN v_token := NULL;
  END;

  -- Idempotência: remove agendamento anterior se existir.
  PERFORM cron.unschedule('efi-poll-pix-1min')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'efi-poll-pix-1min');

  IF v_url IS NULL OR v_token IS NULL THEN
    RAISE NOTICE 'app.settings.supabase_url / service_role_key não configurados — '
      'cron criado com placeholders; ajuste no dashboard ou via ALTER DATABASE.';
    v_url := COALESCE(v_url, 'https://EDITAR.supabase.co');
    v_token := COALESCE(v_token, 'EDITAR');
  END IF;

  PERFORM cron.schedule(
    'efi-poll-pix-1min',
    '* * * * *', -- a cada 1 minuto
    format(
      $cron$
      SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || %L,
          'Content-Type', 'application/json'
        ),
        body := jsonb_build_object('source', 'pg_cron')
      );
      $cron$,
      v_url || '/functions/v1/cron-efi-poll-pix',
      v_token
    )
  );

  RAISE NOTICE 'Cron efi-poll-pix-1min agendado (a cada 1 minuto).';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Falha ao agendar efi-poll-pix-1min: %.', SQLERRM;
END;
$$;
