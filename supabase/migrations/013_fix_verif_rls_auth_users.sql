-- ============================================================
-- 013: Fix RLS policies that reference auth.users (permission denied)
-- Replace with direct profiles lookup (public schema, already accessible)
-- ============================================================

-- ── identity_verifications: SELECT ─────────────────────────
DROP POLICY IF EXISTS "verif_select" ON identity_verifications;
CREATE POLICY "verif_select" ON identity_verifications
  FOR SELECT USING (
    auth.uid() = user_id
    OR auth.uid() IN (SELECT id FROM profiles WHERE role IN ('admin', 'gerencia'))
  );

-- ── identity_verifications: UPDATE ─────────────────────────
DROP POLICY IF EXISTS "verif_update" ON identity_verifications;
CREATE POLICY "verif_update" ON identity_verifications
  FOR UPDATE USING (
    auth.uid() = user_id
    OR auth.uid() IN (SELECT id FROM profiles WHERE role IN ('admin', 'gerencia'))
  );
