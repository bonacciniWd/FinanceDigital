-- ============================================================================
-- 090_fix_cleanup_midias_enum_cast.sql
-- Fix: trigger cleanup_midias_emprestimo_quitado quebrava qualquer UPDATE
-- em `emprestimos` com erro:
--   invalid input value for enum emprestimo_status: ""
-- Causa: `COALESCE(OLD.status, '')` tentava converter '' para o enum.
-- Solução: usar IS DISTINCT FROM diretamente (semântica equivalente e
-- segura para enums/NULL).
-- ============================================================================

CREATE OR REPLACE FUNCTION cleanup_midias_emprestimo_quitado()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_emp_id UUID;
BEGIN
  -- Identifica o empréstimo "fechado"
  IF TG_OP = 'DELETE' THEN
    v_emp_id := OLD.id;
  ELSE
    -- UPDATE: só atua na transição para 'quitado'
    IF NEW.status = 'quitado' AND OLD.status IS DISTINCT FROM 'quitado'::emprestimo_status THEN
      v_emp_id := NEW.id;
    ELSE
      RETURN NEW;
    END IF;
  END IF;

  -- 1) Desvincula este empréstimo de todas as mídias compartilhadas
  UPDATE emprestimo_midias
  SET emprestimo_ids = array_remove(emprestimo_ids, v_emp_id)
  WHERE v_emp_id = ANY(emprestimo_ids);

  -- 2) Deleta mídias órfãs (sem nenhum empréstimo e sem nenhum cliente vinculado)
  DELETE FROM emprestimo_midias
  WHERE COALESCE(array_length(emprestimo_ids, 1), 0) = 0
    AND COALESCE(array_length(cliente_ids, 1), 0) = 0;

  RETURN COALESCE(NEW, OLD);
END;
$$;
