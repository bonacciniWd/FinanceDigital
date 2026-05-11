-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 077: Agendamento pg_cron do relatório semanal por WhatsApp
--
-- Dispara a edge function `cron-relatorio-semanal-whatsapp` todo
-- DOMINGO às 10:00 BRT (= 13:00 UTC) com body `{ auto: true }`.
--
-- No modo auto, a function:
--   - calcula período = domingo anterior a sábado anterior
--   - monta texto com gastos internos + comissões (sem PDF — jsPDF só roda no front)
--   - envia para todos destinatários ativos em `relatorio_semanal_destinatarios`
--
-- O envio manual com PDF anexo continua disponível pela UI ("Enviar agora").
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_url   TEXT;
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

  -- Remove agendamento anterior (idempotência)
  PERFORM cron.unschedule('relatorio-semanal-domingo-10h')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'relatorio-semanal-domingo-10h');

  IF v_url IS NULL OR v_token IS NULL THEN
    RAISE NOTICE 'app.settings.supabase_url / service_role_key não configurados — '
      'agendamento criado com placeholder; edite via dashboard ou GUCs.';
    v_url   := COALESCE(v_url,   'https://EDITAR.supabase.co');
    v_token := COALESCE(v_token, 'EDITAR');
  END IF;

  PERFORM cron.schedule(
    'relatorio-semanal-domingo-10h',
    '0 13 * * 0', -- domingo 13:00 UTC = 10:00 BRT
    format(
      $cron$
      SELECT net.http_post(
        url     := %L,
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || %L,
          'Content-Type',  'application/json'
        ),
        body    := jsonb_build_object('auto', true, 'origem', 'cron')
      );
      $cron$,
      v_url || '/functions/v1/cron-relatorio-semanal-whatsapp',
      v_token
    )
  );

  RAISE NOTICE 'Cron relatorio-semanal-domingo-10h agendado (domingo 13:00 UTC = 10:00 BRT).';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Falha ao agendar relatorio-semanal-domingo-10h: %.', SQLERRM;
END $$;
