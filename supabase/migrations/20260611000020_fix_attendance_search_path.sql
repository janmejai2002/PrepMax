-- Migration 020: Fix search_path for pgcrypto functions
-- In Supabase, pgcrypto (hmac, digest, gen_random_bytes) lives in the 'extensions' schema.
-- The previous migration used SET search_path = public which didn't include extensions.
-- Re-declare both functions with SET search_path = public, extensions.

CREATE OR REPLACE FUNCTION public.generate_checkin_token(p_slot_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
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

CREATE OR REPLACE FUNCTION public.mark_attended_by_token(p_slot_id uuid, p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
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

  IF v_exp < extract(epoch from now())::bigint THEN
    RETURN jsonb_build_object('error', 'token_expired');
  END IF;

  SELECT value INTO v_secret FROM public.app_config WHERE key = 'attendance_hmac_key';
  v_expected_payload := v_parts[1] || ':' || v_parts[2] || ':' || v_parts[3];
  v_expected_sig     := encode(hmac(v_expected_payload::bytea, v_secret::bytea, 'sha256'), 'hex');
  IF v_sig != v_expected_sig THEN
    RETURN jsonb_build_object('error', 'invalid_token_signature');
  END IF;

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

NOTIFY pgrst, 'reload schema';
