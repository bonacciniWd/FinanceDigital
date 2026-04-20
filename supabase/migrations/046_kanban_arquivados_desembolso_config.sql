-- 046: Kanban arquivados + novas configuracoes de desembolso/aprovacao

BEGIN;

ALTER TYPE kanban_cobranca_etapa ADD VALUE IF NOT EXISTS 'arquivado';

INSERT INTO configuracoes_sistema (chave, valor, descricao)
VALUES
  ('controle_desembolso_ativo', 'true'::jsonb, 'Exibe o painel manual de controle de desembolso na analise de credito'),
  ('desembolso_automatico_ativo', 'false'::jsonb, 'Quando ativo, aprovacoes enviam PIX automaticamente para a chave do cliente'),
  ('notificacoes_aprovacao_ativas', 'true'::jsonb, 'Envia WhatsApp automatico ao aprovar o credito')
ON CONFLICT (chave) DO UPDATE
SET valor = EXCLUDED.valor,
    descricao = COALESCE(EXCLUDED.descricao, configuracoes_sistema.descricao),
    updated_at = now();

COMMIT;
