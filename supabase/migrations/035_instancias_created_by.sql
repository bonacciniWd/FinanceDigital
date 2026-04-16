-- 035: Adiciona campo created_by em whatsapp_instancias para controle de propriedade
-- Usado para filtrar instâncias por usuário (cobranca/comercial vê só as suas)

-- 1) Adicionar coluna created_by (FK para auth.users)
ALTER TABLE whatsapp_instancias
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2) Índice para queries por proprietário
CREATE INDEX IF NOT EXISTS idx_wpp_inst_created_by ON whatsapp_instancias(created_by);

-- 3) Atualizar RLS policies:
--    - admin/gerencia vê TUDO
--    - cobranca/comercial/cliente vê apenas suas instâncias + instância do sistema (is_system = true para leitura)

-- Remover policies existentes
DROP POLICY IF EXISTS "wpp_inst_select" ON whatsapp_instancias;
DROP POLICY IF EXISTS "wpp_inst_all" ON whatsapp_instancias;

-- Admin e gerência: acesso total
CREATE POLICY "wpp_inst_admin_all"
  ON whatsapp_instancias
  FOR ALL
  USING (auth_role() IN ('admin', 'gerencia'));

-- Demais roles: SELECT apenas instâncias próprias
CREATE POLICY "wpp_inst_own_select"
  ON whatsapp_instancias
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND (created_by = auth.uid())
  );

-- Demais roles: INSERT/UPDATE/DELETE apenas instâncias próprias
CREATE POLICY "wpp_inst_own_modify"
  ON whatsapp_instancias
  FOR ALL
  USING (
    auth.uid() IS NOT NULL
    AND created_by = auth.uid()
  );
