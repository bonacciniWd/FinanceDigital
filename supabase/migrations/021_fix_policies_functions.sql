-- ════════════════════════════════════════════════════════════
-- Migration 021: Ensure all policies and functions exist (idempotent)
-- ════════════════════════════════════════════════════════════

-- Drop and recreate policies to be idempotent
DROP POLICY IF EXISTS "emergency_tokens_admin_all" ON emergency_tokens;
DROP POLICY IF EXISTS "emergency_tokens_anon_select" ON emergency_tokens;
DROP POLICY IF EXISTS "app_usage_own" ON app_usage_sessions;

CREATE POLICY "emergency_tokens_admin_all" ON emergency_tokens
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "emergency_tokens_anon_select" ON emergency_tokens
  FOR SELECT TO anon
  USING (TRUE);

CREATE POLICY "app_usage_own" ON app_usage_sessions
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'gerencia')));

-- Functions (CREATE OR REPLACE is already idempotent)
CREATE OR REPLACE FUNCTION check_ip_allowed(check_ip INET)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM allowed_ips
    WHERE ip_address = check_ip AND active = TRUE
  );
$$;

CREATE OR REPLACE FUNCTION redeem_emergency_token(p_token TEXT, p_ip INET, p_label TEXT DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_token_id UUID;
BEGIN
  SELECT id INTO v_token_id
  FROM emergency_tokens
  WHERE token = p_token
    AND used_at IS NULL
    AND expires_at > now();

  IF v_token_id IS NULL THEN
    RETURN FALSE;
  END IF;

  UPDATE emergency_tokens
  SET used_at = now(), used_by_ip = p_ip
  WHERE id = v_token_id;

  INSERT INTO allowed_ips (ip_address, label)
  VALUES (p_ip, COALESCE(p_label, 'Token emergência - ' || p_ip::TEXT))
  ON CONFLICT DO NOTHING;

  RETURN TRUE;
END;
$$;
