-- Migration 019: Harden attendance check-in against fraud
--
-- THREAT MODEL (old, broken):
--   Host shows rotating QR on screen → junior scans → junior calls check_in(slot_id, token)
--   Junior can self-mark attended: screenshot QR → share URL → absent friend opens page
--
-- NEW SECURE MODEL:
--   Junior opens /myqr/[slotId] → shows personal HMAC-signed QR (tied to their user_id)
--   Host scans each junior's QR  → calls mark_attended_by_token(slot_id, token)
--   OR host taps a name in the roster → calls mark_attended_direct(slot_id, user_id)
--   Junior can NEVER submit their own attendance: only host/judge/admin can call either RPC.
--
-- Security properties guaranteed:
--   ✓ auth.uid() must be host/judge/admin to mark attendance
--   ✓ HMAC-SHA256 tokens: can't be forged without server secret
--   ✓ Server secret stored in app_config (no SELECT RLS = unreachable by clients)
--   ✓ 90-second token expiry (hard to share in time)
--   ✓ Single-use nonce (replay blocked by used_checkin_tokens)
--   ✓ Token payload binds user_id + slot_id (cross-slot, cross-user replay impossible)
--   ✓ check_in() returns error for all callers (self-check-in disabled)

-- Ensure pgcrypto is available (always enabled in Supabase projects)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── 1. app_config — server-side secret store ──────────────────────────────────
-- No SELECT/INSERT/UPDATE/DELETE RLS policies: completely blocked to clients.
-- Only SECURITY DEFINER functions (run as postgres) can touch this table.
CREATE TABLE IF NOT EXISTS public.app_config (
  key   text PRIMARY KEY,
  value text NOT NULL
);
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

-- Seed HMAC key (gen_random_bytes generates a fresh key on first migration only)
INSERT INTO public.app_config (key, value)
VALUES ('attendance_hmac_key', encode(gen_random_bytes(32), 'hex'))
ON CONFLICT DO NOTHING;

-- ── 2. used_checkin_tokens — single-use replay prevention ─────────────────────
CREATE TABLE IF NOT EXISTS public.used_checkin_tokens (
  token_sig  text        PRIMARY KEY,  -- sha256 digest of the full token string
  slot_id    uuid        NOT NULL REFERENCES public.slots(id) ON DELETE CASCADE,
  user_id    uuid        NOT NULL,
  used_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.used_checkin_tokens ENABLE ROW LEVEL SECURITY;
-- No client access; written by mark_attended_by_token (SECURITY DEFINER)

-- ── 3. Track scanner identity in enrollments ──────────────────────────────────
ALTER TABLE public.enrollments
  ADD COLUMN IF NOT EXISTS checked_in_by uuid REFERENCES public.profiles(id);

-- ── 4. generate_checkin_token — junior calls this; gets personal QR token ─────
-- Token format: {user_id}:{slot_id}:{exp_unix_seconds}:{hmac_sha256_hex}
-- No sensitive key is exposed to the client — only the signed token.
CREATE OR REPLACE FUNCTION public.generate_checkin_token(p_slot_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id  uuid        := auth.uid();
  v_slot     public.slots%ROWTYPE;
  v_enroll   public.enrollments%ROWTYPE;
  v_secret   text;
  v_exp      bigint;
  v_exp_ts   timestamptz;
  v_payload  text;
  v_sig      text;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;

  SELECT * INTO v_slot FROM public.slots WHERE id = p_slot_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'slot_not_found');
  END IF;
  IF v_slot.status != 'live' THEN
    RETURN jsonb_build_object('error', 'slot_not_live', 'slot_status', v_slot.status);
  END IF;

  SELECT * INTO v_enroll
  FROM public.enrollments
  WHERE slot_id = p_slot_id AND user_id = v_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'not_enrolled');
  END IF;
  IF v_enroll.status = 'attended' THEN
    RETURN jsonb_build_object('error', 'already_attended');
  END IF;
  IF v_enroll.status != 'confirmed' THEN
    RETURN jsonb_build_object('error', 'not_confirmed', 'enrollment_status', v_enroll.status);
  END IF;

  -- Fetch HMAC secret (only reachable server-side; no client RLS policy on app_config)
  SELECT value INTO v_secret FROM public.app_config WHERE key = 'attendance_hmac_key';
  IF NOT FOUND OR v_secret IS NULL THEN
    RETURN jsonb_build_object('error', 'server_config_error');
  END IF;

  v_exp_ts  := now() + interval '90 seconds';
  v_exp     := extract(epoch from v_exp_ts)::bigint;
  v_payload := v_user_id::text || ':' || p_slot_id::text || ':' || v_exp::text;
  v_sig     := encode(hmac(v_payload::bytea, v_secret::bytea, 'sha256'), 'hex');

  RETURN jsonb_build_object(
    'token',      v_payload || ':' || v_sig,
    'expires_at', v_exp_ts
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_checkin_token(uuid) TO authenticated;

-- ── 5. mark_attended_by_token — HOST calls after scanning junior's QR ─────────
CREATE OR REPLACE FUNCTION public.mark_attended_by_token(p_slot_id uuid, p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller           uuid := auth.uid();
  v_slot             public.slots%ROWTYPE;
  v_parts            text[];
  v_user_id          uuid;
  v_sig_slot         uuid;
  v_exp              bigint;
  v_sig              text;
  v_secret           text;
  v_expected_payload text;
  v_expected_sig     text;
  v_token_sig        text;
  v_enroll           public.enrollments%ROWTYPE;
  v_name             text;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;

  SELECT * INTO v_slot FROM public.slots WHERE id = p_slot_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'slot_not_found');
  END IF;

  -- Caller must be host / co-judge / admin
  IF v_caller IS DISTINCT FROM v_slot.host_id
     AND NOT public.can_manage_rooms()
     AND NOT EXISTS (
       SELECT 1 FROM public.slot_judges WHERE slot_id = p_slot_id AND judge_id = v_caller
     ) THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;

  IF v_slot.status != 'live' THEN
    RETURN jsonb_build_object('error', 'slot_not_live');
  END IF;

  -- Parse: user_id:slot_id:exp_unix:hmac_sig (exactly 4 colon-separated parts)
  v_parts := string_to_array(p_token, ':');
  IF array_length(v_parts, 1) IS DISTINCT FROM 4 THEN
    RETURN jsonb_build_object('error', 'invalid_token_format');
  END IF;

  BEGIN
    v_user_id  := v_parts[1]::uuid;
    v_sig_slot := v_parts[2]::uuid;
    v_exp      := v_parts[3]::bigint;
    v_sig      := v_parts[4];
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('error', 'invalid_token_format');
  END;

  IF v_sig_slot != p_slot_id THEN
    RETURN jsonb_build_object('error', 'token_slot_mismatch');
  END IF;

  -- Expiry check before HMAC (lets us return a clear error for expired tokens)
  IF v_exp < extract(epoch from now())::bigint THEN
    RETURN jsonb_build_object('error', 'token_expired');
  END IF;

  -- Verify HMAC signature
  SELECT value INTO v_secret FROM public.app_config WHERE key = 'attendance_hmac_key';
  v_expected_payload := v_parts[1] || ':' || v_parts[2] || ':' || v_parts[3];
  v_expected_sig     := encode(hmac(v_expected_payload::bytea, v_secret::bytea, 'sha256'), 'hex');
  IF v_sig != v_expected_sig THEN
    RETURN jsonb_build_object('error', 'invalid_token_signature');
  END IF;

  -- Replay prevention: each token is single-use
  v_token_sig := encode(digest(p_token, 'sha256'), 'hex');
  IF EXISTS (SELECT 1 FROM public.used_checkin_tokens WHERE token_sig = v_token_sig) THEN
    RETURN jsonb_build_object('error', 'token_already_used');
  END IF;

  SELECT * INTO v_enroll
  FROM public.enrollments
  WHERE slot_id = p_slot_id AND user_id = v_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'junior_not_enrolled');
  END IF;
  IF v_enroll.status = 'attended' THEN
    RETURN jsonb_build_object('status', 'already_attended');
  END IF;
  IF v_enroll.status != 'confirmed' THEN
    RETURN jsonb_build_object('error', 'junior_not_confirmed', 'enrollment_status', v_enroll.status);
  END IF;

  -- Consume the nonce
  INSERT INTO public.used_checkin_tokens (token_sig, slot_id, user_id)
  VALUES (v_token_sig, p_slot_id, v_user_id);

  UPDATE public.enrollments
  SET status = 'attended', attended_at = now(), checked_in_by = v_caller
  WHERE slot_id = p_slot_id AND user_id = v_user_id;

  SELECT name INTO v_name FROM public.profiles WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'status',    'attended',
    'user_id',   v_user_id,
    'user_name', COALESCE(v_name, 'Unknown')
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_attended_by_token(uuid, text) TO authenticated;

-- ── 6. mark_attended_direct — HOST taps roster entry; no QR scan needed ───────
-- Practical for small GD/PI groups (8-12 students) where host can see everyone.
CREATE OR REPLACE FUNCTION public.mark_attended_direct(p_slot_id uuid, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_slot   public.slots%ROWTYPE;
  v_enroll public.enrollments%ROWTYPE;
  v_name   text;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;

  SELECT * INTO v_slot FROM public.slots WHERE id = p_slot_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'slot_not_found');
  END IF;

  IF v_caller IS DISTINCT FROM v_slot.host_id
     AND NOT public.can_manage_rooms()
     AND NOT EXISTS (
       SELECT 1 FROM public.slot_judges WHERE slot_id = p_slot_id AND judge_id = v_caller
     ) THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;

  IF v_slot.status != 'live' THEN
    RETURN jsonb_build_object('error', 'slot_not_live');
  END IF;

  SELECT * INTO v_enroll
  FROM public.enrollments
  WHERE slot_id = p_slot_id AND user_id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'not_enrolled');
  END IF;
  IF v_enroll.status = 'attended' THEN
    RETURN jsonb_build_object('status', 'already_attended');
  END IF;
  IF v_enroll.status != 'confirmed' THEN
    RETURN jsonb_build_object('error', 'not_confirmed', 'enrollment_status', v_enroll.status);
  END IF;

  UPDATE public.enrollments
  SET status = 'attended', attended_at = now(), checked_in_by = v_caller
  WHERE slot_id = p_slot_id AND user_id = p_user_id;

  SELECT name INTO v_name FROM public.profiles WHERE id = p_user_id;

  RETURN jsonb_build_object(
    'status',    'attended',
    'user_id',   p_user_id,
    'user_name', COALESCE(v_name, 'Unknown')
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_attended_direct(uuid, uuid) TO authenticated;

-- ── 7. Disable old self-check-in ──────────────────────────────────────────────
-- check_in() now returns a clear error for ALL callers.
-- The function body is replaced; the function still exists so nothing crashes.
CREATE OR REPLACE FUNCTION public.check_in(p_slot_id uuid, p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN jsonb_build_object(
    'error',   'self_checkin_disabled',
    'message', 'Attendance is now marked by the session host. Show your personal QR to the host.'
  );
END;
$$;

NOTIFY pgrst, 'reload schema';
