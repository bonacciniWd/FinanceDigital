-- ============================================================================
-- 088_emprestimo_midias_cleanup.sql
-- Limpa automaticamente mídias quando empréstimos são quitados.
--
-- Comportamento:
--   • Quando `emprestimos.status` muda para 'quitado' (ou linha é deletada),
--     remove o ID do array `emprestimo_midias.emprestimo_ids`.
--   • Se após a remoção a mídia ficar SEM nenhum empréstimo E SEM nenhum
--     cliente vinculado, deleta a linha (e o objeto do Storage via trigger).
--   • Mídias compartilhadas (vinculadas a outros empréstimos ativos ou
--     clientes) são preservadas — apenas desvinculadas.
--
-- Também adiciona trigger AFTER DELETE em `emprestimo_midias` para remover
-- o arquivo do bucket de storage (evita lixo no S3).
-- ============================================================================

-- ── Função: remove arquivo do storage quando mídia é apagada ─────────────────
CREATE OR REPLACE FUNCTION emprestimo_midias_delete_storage()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
BEGIN
  IF OLD.storage_path IS NOT NULL THEN
    -- Remove objeto silenciosamente (ignora se não existir mais)
    DELETE FROM storage.objects
    WHERE bucket_id = 'emprestimo-midias'
      AND name = OLD.storage_path;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_emprestimo_midias_delete_storage ON emprestimo_midias;
CREATE TRIGGER trg_emprestimo_midias_delete_storage
AFTER DELETE ON emprestimo_midias
FOR EACH ROW
EXECUTE FUNCTION emprestimo_midias_delete_storage();

-- ── Função: limpa mídias quando empréstimo é quitado/removido ────────────────
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
    IF NEW.status = 'quitado' AND COALESCE(OLD.status, '') <> 'quitado' THEN
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
  --    O trigger de DELETE acima cuida da remoção do objeto no storage.
  DELETE FROM emprestimo_midias
  WHERE COALESCE(array_length(emprestimo_ids, 1), 0) = 0
    AND COALESCE(array_length(cliente_ids, 1), 0) = 0;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_cleanup_midias_emp_quitado ON emprestimos;
CREATE TRIGGER trg_cleanup_midias_emp_quitado
AFTER UPDATE OR DELETE ON emprestimos
FOR EACH ROW
EXECUTE FUNCTION cleanup_midias_emprestimo_quitado();

COMMENT ON FUNCTION cleanup_midias_emprestimo_quitado IS
  'Desvincula (e remove se órfã) as mídias quando um empréstimo é quitado ou deletado.';
COMMENT ON FUNCTION emprestimo_midias_delete_storage IS
  'Remove o arquivo do bucket emprestimo-midias quando a linha é deletada.';
