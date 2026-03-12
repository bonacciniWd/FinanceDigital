-- Fix whatsapp_instancias constraints:
-- 1. Add UNIQUE on instance_name (required for upsert ON CONFLICT)
-- 2. Remove UNIQUE from departamento (allow multiple instances per dept)
-- 3. Allow NULL departamento (sync_all imports without departamento)

-- Drop the old unique constraint on departamento
ALTER TABLE whatsapp_instancias DROP CONSTRAINT IF EXISTS whatsapp_instancias_departamento_key;

-- Make departamento nullable (sync imports don't have departamento)
ALTER TABLE whatsapp_instancias ALTER COLUMN departamento DROP NOT NULL;
ALTER TABLE whatsapp_instancias ALTER COLUMN departamento SET DEFAULT 'geral';

-- Add unique constraint on instance_name (for upsert ON CONFLICT)
ALTER TABLE whatsapp_instancias ADD CONSTRAINT whatsapp_instancias_instance_name_key UNIQUE (instance_name);
