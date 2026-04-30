-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  053_realtime_identity_verifications.sql                                 ║
-- ║                                                                          ║
-- ║  Adiciona identity_verifications à publicação supabase_realtime para     ║
-- ║  permitir que AnaliseCreditoPage receba notificações instantâneas        ║
-- ║  quando o cliente conclui a verificação (envia vídeo/docs/localização).  ║
-- ║                                                                          ║
-- ║  Sem isso, o operador precisa fechar e reabrir o app inteiro para ver    ║
-- ║  o status atualizado (cache localStorage + sem invalidação automática).  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'identity_verifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE identity_verifications;
  END IF;
END $$;
