-- Migration 032: Endereço detalhado na tabela clientes
-- Adiciona campos separados de endereço (rua, numero, bairro, estado, cidade, cep)
-- mantendo o campo 'endereco' legado para compatibilidade

ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS rua     TEXT,
  ADD COLUMN IF NOT EXISTS numero  TEXT,
  ADD COLUMN IF NOT EXISTS bairro  TEXT,
  ADD COLUMN IF NOT EXISTS estado  CHAR(2),
  ADD COLUMN IF NOT EXISTS cidade  TEXT,
  ADD COLUMN IF NOT EXISTS cep     TEXT;
