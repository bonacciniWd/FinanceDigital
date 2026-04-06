-- ════════════════════════════════════════════════════════════
-- Migration 020: Repair — complete items that 019 didn't finish
-- (019 failed at gen_random_bytes; allowed_ips was created OK)
-- ════════════════════════════════════════════════════════════

-- Ensure pgcrypto is available
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ── 1. emergency_tokens ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS emergency_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token       TEXT NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(32), 'hex'),
  created_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  used_by_ip  INET,
  used_at     TIMESTAMPTZ,
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '15 minutes'),
  created_at  TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE emergency_tokens IS
  'Tokens únicos de emergência para registrar novos IPs quando o IP muda.';

-- ── 2. app_usage_sessions ───────────────────────────────────
CREATE TABLE IF NOT EXISTS app_usage_sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  ip_address   INET NOT NULL,
  machine_id   TEXT,
  started_at   TIMESTAMPTZ DEFAULT now(),
  ended_at     TIMESTAMPTZ,
  last_ping_at TIMESTAMPTZ DEFAULT now(),
  duration_sec INTEGER GENERATED ALWAYS AS (
    EXTRACT(EPOCH FROM (COALESCE(ended_at, last_ping_at) - started_at))::INTEGER
  ) STORED
);

CREATE INDEX IF NOT EXISTS idx_app_usage_user ON app_usage_sessions (user_id, started_at DESC);

COMMENT ON TABLE app_usage_sessions IS
  'Sessões de uso do app desktop por funcionário, com tempo rastreado.';

-- ── 3. RLS for new tables ───────────────────────────────────
ALTER TABLE emergency_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_usage_sessions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any (idempotent)
DROP POLICY IF EXISTS "emergency_tokens_admin_all" ON emergency_tokens;
DROP POLICY IF EXISTS "emergency_tokens_anon_select" ON emergency_tokens;
DROP POLICY IF EXISTS "app_usage_own" ON app_usage_sessions;

-- emergency_tokens: admin can manage, anon can read (to validate token)
CREATE POLICY "emergency_tokens_admin_all" ON emergency_tokens
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "emergency_tokens_anon_select" ON emergency_tokens
  FOR SELECT TO anon
  USING (TRUE);

-- app_usage_sessions: authenticated read own + admin read all
CREATE POLICY "app_usage_own" ON app_usage_sessions
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'gerencia')));

-- ── 4. Functions ────────────────────────────────────────────
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
