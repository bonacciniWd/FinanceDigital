-- 051: Saídas Órfãs (Pix Enviados sem vínculo) + Gastos Internos por categoria
--
-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  Adiciona infraestrutura para:                                   ║
-- ║   1. Conciliação de Pix ENVIADOS (saídas) com empréstimos        ║
-- ║      → tabela saidas_orfas (espelho de pagamentos_orfaos p/ saída)║
-- ║   2. Cadastro de categorias de gastos internos                   ║
-- ║      (nome + termo de busca)                                     ║
-- ║   3. Registro automático de gastos detectados no extrato         ║
-- ║      → tabela gastos_internos                                    ║
-- ║                                                                  ║
-- ║  Alimentação automática: edge function `cron-saidas-orfas`       ║
-- ║  varre `/v2/gn/pix/enviados` diariamente e classifica cada saída.║
-- ╚══════════════════════════════════════════════════════════════════╝

-- ══════════════════════════════════════════════════════════════
-- 1. Categorias de gastos internos
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS categorias_gastos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,                            -- ex: "Aluguel escritório"
  termo TEXT NOT NULL,                           -- ex: "imobiliária xpto" (case-insensitive substring)
  cor TEXT,                                      -- ex: "#f97316" (opcional, usado em badges)
  ativo BOOLEAN NOT NULL DEFAULT true,
  observacao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_categorias_gastos_ativo ON categorias_gastos(ativo);
CREATE INDEX IF NOT EXISTS idx_categorias_gastos_termo_lower ON categorias_gastos(LOWER(termo));

ALTER TABLE categorias_gastos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "categorias_gastos_select_auth" ON categorias_gastos
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "categorias_gastos_admin_gerencia" ON categorias_gastos
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','gerencia'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','gerencia'))
  );

-- ══════════════════════════════════════════════════════════════
-- 2. Gastos internos (saídas que casaram com uma categoria)
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS gastos_internos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria_id UUID NOT NULL REFERENCES categorias_gastos(id) ON DELETE RESTRICT,
  -- Dados da saída no extrato
  e2e_id TEXT,                                  -- EndToEnd ID PIX (BCB) — usado p/ deduplicação
  valor NUMERIC(14,2) NOT NULL,
  horario TIMESTAMPTZ NOT NULL,                 -- horario.solicitacao da EFI
  chave_favorecido TEXT,
  nome_favorecido TEXT,
  descricao TEXT,
  gateway TEXT NOT NULL DEFAULT 'efi',
  raw_payload JSONB,                            -- payload original (auditoria)
  -- Origem do match
  match_origem TEXT NOT NULL DEFAULT 'auto'
    CHECK (match_origem IN ('auto','manual')),
  vinculado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  vinculado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  observacao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gastos_internos_categoria ON gastos_internos(categoria_id);
CREATE INDEX IF NOT EXISTS idx_gastos_internos_horario ON gastos_internos(horario DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_gastos_internos_e2e ON gastos_internos(e2e_id) WHERE e2e_id IS NOT NULL;

ALTER TABLE gastos_internos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gastos_internos_select_auth" ON gastos_internos
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "gastos_internos_admin_gerencia" ON gastos_internos
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','gerencia'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','gerencia'))
  );

-- ══════════════════════════════════════════════════════════════
-- 3. Saídas órfãs (Pix Enviados sem vínculo automático)
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS saidas_orfas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Dados da saída
  e2e_id TEXT,                                  -- usado p/ deduplicação
  id_envio TEXT,                                -- idEnvio retornado pela EFI
  valor NUMERIC(14,2) NOT NULL,
  horario TIMESTAMPTZ NOT NULL,
  chave_favorecido TEXT,
  nome_favorecido TEXT,
  cpf_cnpj_favorecido TEXT,
  gateway TEXT NOT NULL DEFAULT 'efi',
  raw_payload JSONB,
  -- Status / vinculação
  status TEXT NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente','vinculada_emprestimo','vinculada_gasto','ignorada')),
  emprestimo_id_match UUID REFERENCES emprestimos(id) ON DELETE SET NULL,
  gasto_id_match UUID REFERENCES gastos_internos(id) ON DELETE SET NULL,
  candidatas_emprestimo JSONB,                  -- empréstimos com mesma chave/valor próximo
  vinculado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  vinculado_em TIMESTAMPTZ,
  observacao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_saidas_orfas_status ON saidas_orfas(status);
CREATE INDEX IF NOT EXISTS idx_saidas_orfas_horario ON saidas_orfas(horario DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_saidas_orfas_e2e ON saidas_orfas(e2e_id) WHERE e2e_id IS NOT NULL;

ALTER TABLE saidas_orfas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "saidas_orfas_select_auth" ON saidas_orfas
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "saidas_orfas_admin_gerencia" ON saidas_orfas
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','gerencia'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','gerencia'))
  );

-- ══════════════════════════════════════════════════════════════
-- 4. RPC: vincular saída órfã a um empréstimo (e marcar desembolsado)
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION vincular_saida_orfa_emprestimo(
  p_orfa_id UUID,
  p_emprestimo_id UUID,
  p_marcar_desembolsado BOOLEAN DEFAULT true
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_orfa RECORD;
  v_emp RECORD;
  v_role TEXT;
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

  SELECT * INTO v_emp FROM emprestimos WHERE id = p_emprestimo_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Empréstimo não encontrado'; END IF;

  UPDATE saidas_orfas SET
    status = 'vinculada_emprestimo',
    emprestimo_id_match = p_emprestimo_id,
    vinculado_por = auth.uid(),
    vinculado_em = now()
  WHERE id = p_orfa_id;

  IF p_marcar_desembolsado AND v_emp.desembolsado IS NOT TRUE THEN
    UPDATE emprestimos SET
      desembolsado = true,
      desembolsado_em = COALESCE(desembolsado_em, v_orfa.horario),
      desembolsado_por = COALESCE(desembolsado_por, auth.uid())
    WHERE id = p_emprestimo_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'emprestimo_id', p_emprestimo_id);
END;
$$;

GRANT EXECUTE ON FUNCTION vincular_saida_orfa_emprestimo(UUID, UUID, BOOLEAN) TO authenticated;

-- ══════════════════════════════════════════════════════════════
-- 5. RPC: vincular saída órfã a uma categoria de gasto
-- ══════════════════════════════════════════════════════════════
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

  -- Insere o gasto interno
  INSERT INTO gastos_internos (
    categoria_id, e2e_id, valor, horario,
    chave_favorecido, nome_favorecido, descricao,
    gateway, raw_payload, match_origem, vinculado_por
  ) VALUES (
    p_categoria_id, v_orfa.e2e_id, v_orfa.valor, v_orfa.horario,
    v_orfa.chave_favorecido, v_orfa.nome_favorecido, v_cat.nome,
    v_orfa.gateway, v_orfa.raw_payload, 'manual', auth.uid()
  )
  ON CONFLICT (e2e_id) DO UPDATE SET categoria_id = EXCLUDED.categoria_id, match_origem = 'manual'
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

-- ══════════════════════════════════════════════════════════════
-- 6. RPC: ignorar saída órfã (não relevante)
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION ignorar_saida_orfa(
  p_orfa_id UUID,
  p_observacao TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
BEGIN
  SELECT role INTO v_role FROM profiles WHERE id = auth.uid();
  IF v_role NOT IN ('admin','gerencia') THEN
    RAISE EXCEPTION 'Permissão negada';
  END IF;

  UPDATE saidas_orfas SET
    status = 'ignorada',
    observacao = COALESCE(p_observacao, observacao),
    vinculado_por = auth.uid(),
    vinculado_em = now()
  WHERE id = p_orfa_id AND status = 'pendente';

  IF NOT FOUND THEN RAISE EXCEPTION 'Saída não encontrada ou já vinculada'; END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION ignorar_saida_orfa(UUID, TEXT) TO authenticated;
