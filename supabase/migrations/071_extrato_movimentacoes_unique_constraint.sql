-- Substitui o partial unique index de protocolo por uma UNIQUE constraint
-- "real". Necessário porque o PostgREST/Supabase exige UNIQUE constraint
-- (não partial index) para a cláusula ON CONFLICT do upsert.
-- Postgres permite múltiplos NULLs em UNIQUE por padrão (NULLS DISTINCT),
-- portanto saldo_diario (sem protocolo) continua funcionando normalmente.

DROP INDEX IF EXISTS public.uniq_extrato_movimentacoes_protocolo;

ALTER TABLE public.extrato_movimentacoes
  ADD CONSTRAINT extrato_movimentacoes_protocolo_key UNIQUE (protocolo);
