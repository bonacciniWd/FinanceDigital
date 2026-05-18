-- 084: Isolamento de conversas WhatsApp por instância (created_by)
--
-- Problema: a policy original "wpp_log_select" permitia que qualquer usuário
-- autenticado visse TODAS as mensagens de TODAS as instâncias, fazendo com que
-- usuários do mesmo role (cobrança/comercial) vissem conversas uns dos outros.
--
-- Regra nova:
--   - admin / gerência         → veem TUDO (visão gerencial)
--   - demais roles autenticados → veem APENAS mensagens das instâncias que
--                                 eles próprios criaram (whatsapp_instancias.created_by = auth.uid())
--                                 + mensagens da instância "sistema" (is_system = true)
--                                   só ficam visíveis para admin/gerência (cron / notificações).
--
-- Edge Functions usam service_role, então não passam por RLS — webhooks
-- continuam gravando normalmente.

-- ── whatsapp_mensagens_log ───────────────────────────────────────────────

DROP POLICY IF EXISTS "wpp_log_select" ON whatsapp_mensagens_log;
DROP POLICY IF EXISTS "wpp_log_insert" ON whatsapp_mensagens_log;
DROP POLICY IF EXISTS "wpp_log_update" ON whatsapp_mensagens_log;
DROP POLICY IF EXISTS "wpp_log_delete" ON whatsapp_mensagens_log;

-- Admin/gerência: acesso total
CREATE POLICY "wpp_log_admin_all"
  ON whatsapp_mensagens_log
  FOR ALL
  USING (auth_role() IN ('admin', 'gerencia'))
  WITH CHECK (auth_role() IN ('admin', 'gerencia'));

-- Demais roles: SELECT apenas mensagens das próprias instâncias
CREATE POLICY "wpp_log_own_select"
  ON whatsapp_mensagens_log
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND instancia_id IN (
      SELECT id FROM whatsapp_instancias WHERE created_by = auth.uid()
    )
  );

-- Demais roles: INSERT apenas em conversas de instâncias próprias
CREATE POLICY "wpp_log_own_insert"
  ON whatsapp_mensagens_log
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND instancia_id IN (
      SELECT id FROM whatsapp_instancias WHERE created_by = auth.uid()
    )
  );

-- Demais roles: UPDATE apenas em conversas próprias (ex.: marcar como lida)
CREATE POLICY "wpp_log_own_update"
  ON whatsapp_mensagens_log
  FOR UPDATE
  USING (
    auth.uid() IS NOT NULL
    AND instancia_id IN (
      SELECT id FROM whatsapp_instancias WHERE created_by = auth.uid()
    )
  );

-- ── conversa_cliente e conversa_etiquetas ────────────────────────────────
-- Vínculo conversa↔cliente e etiquetas também devem respeitar o isolamento:
-- usuário não-admin só vê vínculos das instâncias que criou.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'conversa_cliente') THEN
    EXECUTE 'ALTER TABLE conversa_cliente ENABLE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS "conv_cli_select" ON conversa_cliente';
    EXECUTE 'DROP POLICY IF EXISTS "conv_cli_all" ON conversa_cliente';
    EXECUTE 'DROP POLICY IF EXISTS "conv_cli_admin_all" ON conversa_cliente';
    EXECUTE 'DROP POLICY IF EXISTS "conv_cli_own" ON conversa_cliente';

    EXECUTE $POL$
      CREATE POLICY "conv_cli_admin_all"
        ON conversa_cliente
        FOR ALL
        USING (auth_role() IN ('admin', 'gerencia'))
        WITH CHECK (auth_role() IN ('admin', 'gerencia'))
    $POL$;

    EXECUTE $POL$
      CREATE POLICY "conv_cli_own"
        ON conversa_cliente
        FOR ALL
        USING (
          auth.uid() IS NOT NULL
          AND instancia_id IN (
            SELECT id FROM whatsapp_instancias WHERE created_by = auth.uid()
          )
        )
        WITH CHECK (
          auth.uid() IS NOT NULL
          AND instancia_id IN (
            SELECT id FROM whatsapp_instancias WHERE created_by = auth.uid()
          )
        )
    $POL$;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'conversa_etiquetas') THEN
    EXECUTE 'ALTER TABLE conversa_etiquetas ENABLE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS "conv_etq_select" ON conversa_etiquetas';
    EXECUTE 'DROP POLICY IF EXISTS "conv_etq_all" ON conversa_etiquetas';
    EXECUTE 'DROP POLICY IF EXISTS "conv_etq_admin_all" ON conversa_etiquetas';
    EXECUTE 'DROP POLICY IF EXISTS "conv_etq_own" ON conversa_etiquetas';

    EXECUTE $POL$
      CREATE POLICY "conv_etq_admin_all"
        ON conversa_etiquetas
        FOR ALL
        USING (auth_role() IN ('admin', 'gerencia'))
        WITH CHECK (auth_role() IN ('admin', 'gerencia'))
    $POL$;

    EXECUTE $POL$
      CREATE POLICY "conv_etq_own"
        ON conversa_etiquetas
        FOR ALL
        USING (
          auth.uid() IS NOT NULL
          AND instancia_id IN (
            SELECT id FROM whatsapp_instancias WHERE created_by = auth.uid()
          )
        )
        WITH CHECK (
          auth.uid() IS NOT NULL
          AND instancia_id IN (
            SELECT id FROM whatsapp_instancias WHERE created_by = auth.uid()
          )
        )
    $POL$;
  END IF;
END $$;
