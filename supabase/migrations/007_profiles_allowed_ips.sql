-- ════════════════════════════════════════════════════════════
-- Migration 007: allowed_ips column on profiles
-- Stores array of allowed IP addresses for login restriction.
-- When non-null and non-empty, login is blocked from IPs not in the list.
-- ════════════════════════════════════════════════════════════

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS allowed_ips TEXT[] DEFAULT NULL;

COMMENT ON COLUMN profiles.allowed_ips IS
  'Array de IPs autorizados para login. NULL = sem restrição.';
