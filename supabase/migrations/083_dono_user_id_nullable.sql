-- 083_dono_user_id_nullable.sql
--
-- Permite `user_id NULL` quando tipo='dono_pct'. Casos de uso: o dono não tem
-- conta no sistema, mas a regra de comissão (pct sobre entradas) ainda precisa
-- aparecer no relatório.
--
-- Para gerente e cobrador (kanban_nivel), `user_id` continua obrigatório.

BEGIN;

ALTER TABLE comissoes_config
  ALTER COLUMN user_id DROP NOT NULL;

-- Constraint: kanban_nivel e gerente_pct exigem user_id; dono_pct pode ter NULL.
ALTER TABLE comissoes_config
  DROP CONSTRAINT IF EXISTS comissoes_config_user_required_chk;
ALTER TABLE comissoes_config
  ADD CONSTRAINT comissoes_config_user_required_chk
  CHECK (
    (tipo = 'dono_pct') OR (user_id IS NOT NULL)
  );

-- Index único ativo: trata NULL como valor único (UNIQUE NULLS NOT DISTINCT no
-- PG 15+; aqui usamos COALESCE para compatibilidade).
DROP INDEX IF EXISTS comissoes_config_unique_ativo_idx;
CREATE UNIQUE INDEX comissoes_config_unique_ativo_idx
  ON comissoes_config (
    COALESCE(user_id::text, '__null__'),
    tipo,
    COALESCE(nivel_kanban, '')
  )
  WHERE ativo = true;

COMMIT;
