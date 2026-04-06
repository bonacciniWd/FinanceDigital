-- ════════════════════════════════════════════════════════════
-- Migration 019: IP Whitelist system for desktop app + download page
--
-- Tables:
--   allowed_ips        — global whitelist of authorized IPs
--   emergency_tokens   — one-time tokens for dynamic IP registration
--   app_usage_sessions — desktop app usage tracking per employee
-- ════════════════════════════════════════════════════════════

-- ── 1. allowed_ips ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS allowed_ips (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address  INET NOT NULL,
  label       TEXT,                   -- ex: "Escritório SP", "Home - João"
  added_by    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  active      BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Prevent duplicate active IPs
CREATE UNIQUE INDEX IF NOT EXISTS idx_allowed_ips_unique_active
  ON allowed_ips (ip_address) WHERE active = TRUE;

-- Fast lookup by IP
CREATE INDEX IF NOT EXISTS idx_allowed_ips_address ON allowed_ips (ip_address);

COMMENT ON TABLE allowed_ips IS
  'Lista global de IPs autorizados para acessar a página de download e o app desktop.';

-- ── 2. emergency_tokens ─────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

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

-- ── 3. app_usage_sessions ───────────────────────────────────
CREATE TABLE IF NOT EXISTS app_usage_sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  ip_address   INET NOT NULL,
  machine_id   TEXT,                  -- hardware fingerprint from Tauri
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

-- ── 4. RLS Policies ─────────────────────────────────────────
ALTER TABLE allowed_ips ENABLE ROW LEVEL SECURITY;
ALTER TABLE emergency_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_usage_sessions ENABLE ROW LEVEL SECURITY;

-- allowed_ips: admin read/write, service role full
CREATE POLICY "allowed_ips_select" ON allowed_ips
  FOR SELECT TO authenticated
  USING (TRUE);

CREATE POLICY "allowed_ips_admin_insert" ON allowed_ips
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "allowed_ips_admin_update" ON allowed_ips
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "allowed_ips_admin_delete" ON allowed_ips
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- emergency_tokens: admin can create, anon can read (to validate token)
CREATE POLICY "emergency_tokens_admin_all" ON emergency_tokens
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "emergency_tokens_anon_select" ON emergency_tokens
  FOR SELECT TO anon
  USING (TRUE);

-- app_usage_sessions: authenticated read own, admin read all
CREATE POLICY "app_usage_own" ON app_usage_sessions
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'gerencia')));

-- ── 5. Function to check IP against whitelist ───────────────
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

-- ── 6. Function to redeem emergency token ───────────────────
CREATE OR REPLACE FUNCTION redeem_emergency_token(p_token TEXT, p_ip INET, p_label TEXT DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_token_id UUID;
BEGIN
  -- Find valid unused token
  SELECT id INTO v_token_id
  FROM emergency_tokens
  WHERE token = p_token
    AND used_at IS NULL
    AND expires_at > now();

  IF v_token_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Mark token as used
  UPDATE emergency_tokens
  SET used_at = now(), used_by_ip = p_ip
  WHERE id = v_token_id;

  -- Add IP to whitelist
  INSERT INTO allowed_ips (ip_address, label)
  VALUES (p_ip, COALESCE(p_label, 'Token emergência - ' || p_ip::TEXT))
  ON CONFLICT DO NOTHING;

  RETURN TRUE;
END;
$$;
