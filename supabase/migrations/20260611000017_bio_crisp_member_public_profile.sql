-- Migration 017: bio field + is_crisp_member flag + committee account support
-- + get_public_profile SECURITY DEFINER RPC

-- ── 1. bio — short background description shown on public profile ─────────────
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bio text;

-- ── 2. is_crisp_member — b25 seniors who are also CRISP committee members ─────
-- Distinct from is_crisp_admin (admin-level). Used for mentee-management access.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_crisp_member boolean NOT NULL DEFAULT false;

-- ── 3. Allow year to be null (committee shared logins have no year) ───────────
ALTER TABLE public.profiles ALTER COLUMN year DROP NOT NULL;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_year_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_year_check
  CHECK (year IS NULL OR year IN ('first', 'second'));

-- ── 4. Update email-role trigger to handle @xlri.ac.in (committee) ────────────
CREATE OR REPLACE FUNCTION public.set_year_from_email()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF    NEW.email ~* '^b25[0-9]+@astra\.xlri\.ac\.in$' THEN NEW.year := 'second';
  ELSIF NEW.email ~* '^b26[0-9]+@astra\.xlri\.ac\.in$' THEN NEW.year := 'first';
  ELSIF NEW.email ~* '@xlri\.ac\.in$'                  THEN NEW.year := NULL;
  END IF;
  RETURN NEW;
END;
$$;

-- ── 5. get_public_profile RPC — any authenticated user, returns safe fields ───
-- SECURITY DEFINER bypasses RLS on profiles so any user can read others' public
-- info. Phone/WhatsApp are NOT included.
CREATE OR REPLACE FUNCTION public.get_public_profile(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile         public.profiles%ROWTYPE;
  v_result          jsonb;
  -- junior stats
  v_slots_joined    bigint := 0;
  v_slots_attended  bigint := 0;
  v_no_shows        bigint := 0;
  v_gd_attended     bigint := 0;
  v_pi_attended     bigint := 0;
  v_feedback_count  bigint := 0;
  v_avg_clarity     numeric;
  v_avg_content     numeric;
  v_avg_confidence  numeric;
  v_avg_structure   numeric;
  -- senior stats
  v_slots_hosted    bigint := 0;
  v_slots_judged    bigint := 0;
  v_open_slots      jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;

  -- Base public fields (no phone/whatsapp)
  v_result := jsonb_build_object(
    'id',      v_profile.id,
    'name',    v_profile.name,
    'email',   v_profile.email,
    'year',    v_profile.year,
    'batch',   v_profile.batch,
    'section', v_profile.section,
    'bio',     v_profile.bio
  );

  IF v_profile.year = 'first' THEN
    -- Junior: enrollment stats
    SELECT
      COUNT(DISTINCT e.slot_id) FILTER (WHERE e.status IN ('confirmed','attended','no_show')),
      COUNT(DISTINCT e.slot_id) FILTER (WHERE e.status = 'attended'),
      COUNT(DISTINCT e.slot_id) FILTER (WHERE e.status = 'no_show'),
      COUNT(DISTINCT CASE WHEN e.status = 'attended' AND s.type = 'GD' THEN e.slot_id END),
      COUNT(DISTINCT CASE WHEN e.status = 'attended' AND s.type = 'PI' THEN e.slot_id END)
    INTO v_slots_joined, v_slots_attended, v_no_shows, v_gd_attended, v_pi_attended
    FROM public.enrollments e
    LEFT JOIN public.slots s ON s.id = e.slot_id
    WHERE e.user_id = p_user_id;

    -- Junior: feedback averages
    SELECT
      COUNT(*),
      ROUND(AVG((scores->>'clarity')::numeric),    1),
      ROUND(AVG((scores->>'content')::numeric),    1),
      ROUND(AVG((scores->>'confidence')::numeric), 1),
      ROUND(AVG((scores->>'structure')::numeric),  1)
    INTO v_feedback_count, v_avg_clarity, v_avg_content, v_avg_confidence, v_avg_structure
    FROM public.feedback
    WHERE to_user_id = p_user_id;

    v_result := v_result || jsonb_build_object(
      'slots_joined',    COALESCE(v_slots_joined,   0),
      'slots_attended',  COALESCE(v_slots_attended, 0),
      'no_shows',        COALESCE(v_no_shows,       0),
      'gd_attended',     COALESCE(v_gd_attended,    0),
      'pi_attended',     COALESCE(v_pi_attended,    0),
      'feedback_count',  COALESCE(v_feedback_count, 0),
      'avg_clarity',     v_avg_clarity,
      'avg_content',     v_avg_content,
      'avg_confidence',  v_avg_confidence,
      'avg_structure',   v_avg_structure
    );

  ELSIF v_profile.year = 'second' THEN
    -- Senior: hosting stats
    SELECT COUNT(*) INTO v_slots_hosted
    FROM public.slots
    WHERE host_id = p_user_id AND status != 'cancelled';

    SELECT COUNT(*) INTO v_slots_judged
    FROM public.slot_judges
    WHERE judge_id = p_user_id;

    -- Senior: currently open slots
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id',             s.id,
        'type',           s.type,
        'topic',          s.topic,
        'start_at',       s.start_at,
        'capacity',       s.capacity,
        'enrolled_count', s.enrolled_count,
        'status',         s.status
      ) ORDER BY s.start_at
    ), '[]'::jsonb)
    INTO v_open_slots
    FROM public.slots s
    WHERE s.host_id = p_user_id
      AND s.status IN ('open', 'full')
      AND s.end_at > now();

    v_result := v_result || jsonb_build_object(
      'slots_hosted', COALESCE(v_slots_hosted, 0),
      'slots_judged', COALESCE(v_slots_judged, 0),
      'open_slots',   COALESCE(v_open_slots, '[]'::jsonb)
    );
  END IF;

  RETURN v_result;
END;
$$;

NOTIFY pgrst, 'reload schema';
