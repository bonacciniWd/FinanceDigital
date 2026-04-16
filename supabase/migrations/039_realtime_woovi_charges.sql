-- Migration 039: Habilitar Realtime para woovi_charges e woovi_transactions
-- Sem isso, as cobranças/transações criadas pelo bot não notificam
-- o frontend via subscription em tempo real.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'woovi_charges'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE woovi_charges;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'woovi_transactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE woovi_transactions;
  END IF;
END $$;
