-- Migration 061: torna email de clientes opcional (nullable)
-- O campo era NOT NULL mas o cadastro público não exige email obrigatório.
ALTER TABLE clientes ALTER COLUMN email DROP NOT NULL;
