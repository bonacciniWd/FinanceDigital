-- ════════════════════════════════════════════════════════════
-- Migration 031 — Alerta de pendências para clientes com empréstimos ativos
-- ════════════════════════════════════════════════════════════
-- RPC que verifica se um cliente (por CPF ou ID) tem empréstimos não-quitados.
-- Retorna JSON com detalhes para exibir alerta (não bloqueia criação).

CREATE OR REPLACE FUNCTION verificar_pendencias_cliente(p_cpf TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  resultado JSON;
BEGIN
  SELECT json_build_object(
    'tem_pendencia', COUNT(*) > 0,
    'total_emprestimos_pendentes', COUNT(*),
    'emprestimos', COALESCE(json_agg(
      json_build_object(
        'id', e.id,
        'valor', e.valor,
        'status', e.status,
        'parcelas', e.parcelas,
        'parcelas_pagas', e.parcelas_pagas,
        'data_contrato', e.data_contrato
      )
    ) FILTER (WHERE e.id IS NOT NULL), '[]'::json)
  ) INTO resultado
  FROM emprestimos e
  JOIN clientes c ON c.id = e.cliente_id
  WHERE c.cpf = p_cpf
    AND e.status IN ('ativo', 'inadimplente');

  RETURN resultado;
END;
$$;

-- Também verificar por cliente_id (para uso quando o cliente já está selecionado)
CREATE OR REPLACE FUNCTION verificar_pendencias_cliente_id(p_cliente_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  resultado JSON;
BEGIN
  SELECT json_build_object(
    'tem_pendencia', COUNT(*) > 0,
    'total_emprestimos_pendentes', COUNT(*),
    'emprestimos', COALESCE(json_agg(
      json_build_object(
        'id', e.id,
        'valor', e.valor,
        'status', e.status,
        'parcelas', e.parcelas,
        'parcelas_pagas', e.parcelas_pagas,
        'data_contrato', e.data_contrato
      )
    ) FILTER (WHERE e.id IS NOT NULL), '[]'::json)
  ) INTO resultado
  FROM emprestimos e
  WHERE e.cliente_id = p_cliente_id
    AND e.status IN ('ativo', 'inadimplente');

  RETURN resultado;
END;
$$;

-- NOTA: Sem trigger de bloqueio — a verificação é apenas informativa (alerta no frontend).
-- O admin/gerência recebe notificação sonora + toast via realtime quando há pendências.

-- Habilitar Realtime para analises_credito
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE analises_credito;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
