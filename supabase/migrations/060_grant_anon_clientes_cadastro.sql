-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  060 — Concede privilégios de tabela ao role anon para cadastro público  ║
-- ║                                                                          ║
-- ║  O role anon precisa de permissão de tabela (GRANT) ALÉM de passar RLS.  ║
-- ║  Sem o GRANT, o Postgres rejeita antes mesmo de avaliar as policies.     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- Permite anon selecionar clientes (necessário para SELECT antes do update)
GRANT SELECT ON clientes TO anon;

-- Permite anon inserir em clientes (link de cadastro genérico/novo lead)
GRANT INSERT ON clientes TO anon;

-- Permite anon atualizar clientes (link de cadastro para cliente existente)
GRANT UPDATE ON clientes TO anon;

-- Cadastro_links: anon já lê/atualiza, mas garantir SELECT explicitamente
GRANT SELECT, UPDATE ON cadastro_links TO anon;

-- Storage client-documents: já coberto por policies de storage, mas garantir
-- que o bucket "client-documents" aceite upload anon está nas storage policies.
