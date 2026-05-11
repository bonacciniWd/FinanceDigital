-- ══════════════════════════════════════════════════════════════════════════
-- Migration 072: Extrato Semanal Automático (CNAB 240 EFI)
--
-- Cria infra para baixar semanalmente o extrato CNAB 240 da EFI,
-- armazenar (CNAB + PDF gerado) em bucket privado, parsear movimentações
-- para extrato_movimentacoes e enviar por WhatsApp para destinatários.
--
-- Fluxo:
--   1. EFI gera o arquivo CNAB todo domingo (recorrência configurada
--      no painel EFI uma vez — a API pública só lista/baixa).
--   2. pg_cron toda segunda 13:00 UTC (10:00 BRT) chama a edge
--      function `cron-extrato-semanal` via pg_net.http_post.
--   3. Edge function lista arquivos da última semana, baixa o mais
--      recente, sobe para storage, parsea, gera PDF resumo e envia
--      pra cada destinatário ativo.
-- ══════════════════════════════════════════════════════════════════════════

-- ── 1. Extensão pg_net (necessária para chamar HTTP a partir do pg_cron) ──
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ── 2. Tabela: histórico de extratos semanais ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.extratos_semanais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo_inicio DATE NOT NULL,
  periodo_fim DATE NOT NULL,
  efi_arquivo_id TEXT,
  efi_arquivo_nome TEXT,
  cnab_path TEXT,
  pdf_path TEXT,
  pdf_relatorio_path TEXT,
  status TEXT NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'baixado', 'processado', 'enviado', 'falhou')),
  movimentacoes_importadas INT DEFAULT 0,
  destinatarios_enviados INT DEFAULT 0,
  destinatarios_falharam INT DEFAULT 0,
  erro_msg TEXT,
  raw_meta JSONB,
  trigger_type TEXT NOT NULL DEFAULT 'cron'
    CHECK (trigger_type IN ('cron', 'manual')),
  triggered_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_extratos_semanais_periodo
  ON public.extratos_semanais(periodo_inicio DESC, periodo_fim DESC);

CREATE INDEX IF NOT EXISTS idx_extratos_semanais_status
  ON public.extratos_semanais(status);

-- Dedup: 1 registro por (periodo_inicio, periodo_fim) bem-sucedido.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_extratos_semanais_periodo_ok
  ON public.extratos_semanais(periodo_inicio, periodo_fim)
  WHERE status IN ('processado', 'enviado');

-- ── 3. Tabela: destinatários WhatsApp do extrato ──────────────────────────
CREATE TABLE IF NOT EXISTS public.extrato_whatsapp_destinatarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  telefone TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  observacao TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_extrato_dest_ativo
  ON public.extrato_whatsapp_destinatarios(ativo) WHERE ativo = true;

-- ── 4. Triggers updated_at ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_extratos_semanais_updated ON public.extratos_semanais;
CREATE TRIGGER trg_extratos_semanais_updated
  BEFORE UPDATE ON public.extratos_semanais
  FOR EACH ROW EXECUTE FUNCTION public._set_updated_at();

DROP TRIGGER IF EXISTS trg_extrato_dest_updated ON public.extrato_whatsapp_destinatarios;
CREATE TRIGGER trg_extrato_dest_updated
  BEFORE UPDATE ON public.extrato_whatsapp_destinatarios
  FOR EACH ROW EXECUTE FUNCTION public._set_updated_at();

-- ── 5. RLS ────────────────────────────────────────────────────────────────
ALTER TABLE public.extratos_semanais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.extrato_whatsapp_destinatarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS extratos_semanais_select_auth ON public.extratos_semanais;
CREATE POLICY extratos_semanais_select_auth ON public.extratos_semanais
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS extratos_semanais_admin_all ON public.extratos_semanais;
CREATE POLICY extratos_semanais_admin_all ON public.extratos_semanais
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'gerencia')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'gerencia')
    )
  );

DROP POLICY IF EXISTS extrato_dest_select_auth ON public.extrato_whatsapp_destinatarios;
CREATE POLICY extrato_dest_select_auth ON public.extrato_whatsapp_destinatarios
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS extrato_dest_admin_all ON public.extrato_whatsapp_destinatarios;
CREATE POLICY extrato_dest_admin_all ON public.extrato_whatsapp_destinatarios
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'gerencia')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'gerencia')
    )
  );

-- ── 6. Bucket de storage para arquivos do extrato ─────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'extratos-bancarios',
  'extratos-bancarios',
  false,
  20971520, -- 20 MB
  ARRAY[
    'text/plain',
    'application/octet-stream',
    'application/pdf'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "extratos_bancarios_admin_select" ON storage.objects;
CREATE POLICY "extratos_bancarios_admin_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'extratos-bancarios'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'gerencia')
    )
  );

DROP POLICY IF EXISTS "extratos_bancarios_admin_modify" ON storage.objects;
CREATE POLICY "extratos_bancarios_admin_modify" ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'extratos-bancarios'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'gerencia')
    )
  )
  WITH CHECK (
    bucket_id = 'extratos-bancarios'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'gerencia')
    )
  );

-- ── 7. Configurações em configuracoes_sistema ─────────────────────────────
INSERT INTO public.configuracoes_sistema (chave, valor, descricao)
VALUES
  ('extrato_semanal_ativo', 'false'::jsonb,
    'Ativa/desativa download semanal automático do extrato CNAB 240 da EFI'),
  ('extrato_semanal_instancia_whatsapp_id', 'null'::jsonb,
    'UUID da instância whatsapp_instancias usada para envio do extrato semanal')
ON CONFLICT (chave) DO NOTHING;

-- ── 8. Agendamento pg_cron ────────────────────────────────────────────────
-- Toda segunda-feira às 13:00 UTC (10:00 horário de Brasília).
-- Dispara HTTP POST para a edge function cron-extrato-semanal usando
-- service_role armazenado em vault ou variável de configuração.
DO $$
DECLARE
  v_url TEXT;
  v_token TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron indisponível — agendamento ignorado.';
    RETURN;
  END IF;

  -- URL e token são lidos via current_setting de variáveis configuradas
  -- pelo Supabase. Caímos silenciosamente se não estiverem definidas.
  BEGIN
    v_url := current_setting('app.settings.supabase_url', true);
  EXCEPTION WHEN OTHERS THEN v_url := NULL;
  END;
  BEGIN
    v_token := current_setting('app.settings.service_role_key', true);
  EXCEPTION WHEN OTHERS THEN v_token := NULL;
  END;

  -- Remove agendamento anterior (idempotência)
  PERFORM cron.unschedule('extrato-semanal-domingo')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'extrato-semanal-domingo');

  IF v_url IS NULL OR v_token IS NULL THEN
    RAISE NOTICE 'app.settings.supabase_url / service_role_key não configurados — '
      'agendamento criado mas precisa ser refeito após configurar GUCs ou '
      'edite via dashboard.';
    -- Cria mesmo assim com placeholders; será substituído ao ajustar config.
    v_url := COALESCE(v_url, 'https://EDITAR.supabase.co');
    v_token := COALESCE(v_token, 'EDITAR');
  END IF;

  PERFORM cron.schedule(
    'extrato-semanal-domingo',
    '0 13 * * 1', -- segunda 13:00 UTC = 10:00 BRT
    format(
      $cron$
      SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || %L,
          'Content-Type', 'application/json'
        ),
        body := jsonb_build_object('source', 'pg_cron', 'trigger_type', 'cron')
      );
      $cron$,
      v_url || '/functions/v1/cron-extrato-semanal',
      v_token
    )
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Falha ao agendar extrato-semanal-domingo: %.', SQLERRM;
END;
$$;

COMMENT ON TABLE public.extratos_semanais IS
  'Histórico de execuções de download semanal de extrato CNAB 240 da EFI Bank.';
COMMENT ON TABLE public.extrato_whatsapp_destinatarios IS
  'Lista de destinatários WhatsApp que recebem o extrato bancário semanal.';
