-- 068: Fix vincular_saida_orfa_categoria — ON CONFLICT em index parcial
--
-- O index `uniq_gastos_internos_e2e` é PARCIAL (WHERE e2e_id IS NOT NULL).
-- O PostgreSQL exige que ON CONFLICT especifique exatamente o mesmo predicado
-- do index parcial, caso contrário lança:
--   "there is no unique or exclusion constraint matching the ON CONFLICT specification"
--
-- Solução: usar ON CONFLICT (e2e_id) WHERE e2e_id IS NOT NULL
-- Adicionalmente: quando e2e_id for NULL (saída sem e2e), jamais haverá conflito,
-- então o INSERT prossegue normalmente.

CREATE OR REPLACE FUNCTION vincular_saida_orfa_categoria(
  p_orfa_id UUID,
  p_categoria_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_orfa RECORD;
  v_cat RECORD;
  v_role TEXT;
  v_gasto_id UUID;
BEGIN
  SELECT role INTO v_role FROM profiles WHERE id = auth.uid();
  IF v_role NOT IN ('admin','gerencia') THEN
    RAISE EXCEPTION 'Permissão negada';
  END IF;

  SELECT * INTO v_orfa FROM saidas_orfas WHERE id = p_orfa_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Saída órfã não encontrada'; END IF;
  IF v_orfa.status NOT IN ('pendente') THEN
    RAISE EXCEPTION 'Saída já vinculada/ignorada';
  END IF;

  SELECT * INTO v_cat FROM categorias_gastos WHERE id = p_categoria_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Categoria não encontrada'; END IF;

  -- Insere o gasto interno.
  -- ON CONFLICT precisa referenciar o index parcial com o mesmo predicado WHERE.
  INSERT INTO gastos_internos (
    categoria_id, e2e_id, valor, horario,
    chave_favorecido, nome_favorecido, descricao,
    gateway, raw_payload, match_origem, vinculado_por
  ) VALUES (
    p_categoria_id, v_orfa.e2e_id, v_orfa.valor, v_orfa.horario,
    v_orfa.chave_favorecido, v_orfa.nome_favorecido, v_cat.nome,
    v_orfa.gateway, v_orfa.raw_payload, 'manual', auth.uid()
  )
  ON CONFLICT (e2e_id) WHERE e2e_id IS NOT NULL
    DO UPDATE SET categoria_id = EXCLUDED.categoria_id, match_origem = 'manual'
  RETURNING id INTO v_gasto_id;

  UPDATE saidas_orfas SET
    status = 'vinculada_gasto',
    gasto_id_match = v_gasto_id,
    vinculado_por = auth.uid(),
    vinculado_em = now()
  WHERE id = p_orfa_id;

  RETURN jsonb_build_object('success', true, 'gasto_id', v_gasto_id);
END;
$$;

GRANT EXECUTE ON FUNCTION vincular_saida_orfa_categoria(UUID, UUID) TO authenticated;
