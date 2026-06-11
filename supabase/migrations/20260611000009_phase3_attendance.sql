-- Migration 009: Phase 3 — Attendance, QR check-in, slot lifecycle RPCs, slot detail helper
--
-- Adds:
--   get_slot_detail()  — single-RPC loader for the slot detail page
--   attendance_tokens  — short-lived rotating QR tokens per live slot
--   start_slot()       — host/admin → status 'live' + first token
--   rotate_token()     — host/co-judge/admin → new 60-second token
--   check_in()         — student presents token → enrollment 'attended'
--   finalize_slot()    — host/admin → status 'completed', no-shows marked
--
-- All seat-critical RPCs use SECURITY DEFINER + set search_path = public

-- ── 1. get_slot_detail ────────────────────────────────────────────────────────
-- Returns everything the slot detail page needs in one round-trip.
-- Roster visibility rules:
--   host / co-judge / admin  → full roster (names + statuses)
--   confirmed/attended participant → full roster (co-learners)
--   waitlisted / not enrolled     → {count} only
CREATE OR REPLACE FUNCTION public.get_slot_detail(p_slot_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller   uuid := auth.uid();
  v_slot     public.slots%ROWTYPE;
  v_is_host  bool;
  v_is_judge bool;
  v_is_admin bool;
  v_enroll   public.enrollments%ROWTYPE;
  v_can_see_roster bool;
  result     jsonb;
BEGIN
  SELECT * INTO v_slot FROM public.slots WHERE id = p_slot_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'slot_not_found');
  END IF;

  v_is_host  := (v_caller = v_slot.host_id);
  v_is_admin := public.can_manage_rooms();
  v_is_judge := EXISTS (
    SELECT 1 FROM public.slot_judges
    WHERE slot_id = p_slot_id AND judge_id = v_caller
  );

  SELECT * INTO v_enroll
  FROM public.enrollments
  WHERE slot_id = p_slot_id AND user_id = v_caller;

  v_can_see_roster := v_is_host OR v_is_judge OR v_is_admin
    OR (FOUND AND v_enroll.status IN ('confirmed', 'attended'));

  SELECT jsonb_build_object(
    'id',            s.id,
    'type',          s.type,
    'host_id',       s.host_id,
    'internship',    s.internship,
    'expert_areas',  s.expert_areas,
    'room_id',       s.room_id,
    'start_at',      s.start_at,
    'end_at',        s.end_at,
    'topic',         s.topic,
    'description',   s.description,
    'gd_type_desc',  s.gd_type_desc,
    'capacity',      s.capacity,
    'enrolled_count',s.enrolled_count,
    'status',        s.status,
    'confirmed_at',  s.confirmed_at,
    'version',       s.version,
    'share_slug',    s.share_slug,
    'room',          jsonb_build_object('name', r.name, 'location', r.location),
    'host',          jsonb_build_object('id', h.id, 'name', h.name, 'whatsapp', h.whatsapp),
    'co_judges',     COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', hd.id, 'name', hd.name) ORDER BY hd.name)
      FROM public.slot_judges sj
      JOIN public.host_directory hd ON hd.id = sj.judge_id
      WHERE sj.slot_id = p_slot_id
    ), '[]'::jsonb),
    'my_enrollment', CASE WHEN v_enroll IS NOT NULL THEN
      jsonb_build_object('status', v_enroll.status, 'position', v_enroll.position)
    ELSE NULL END,
    'roster', CASE
      WHEN v_can_see_roster THEN COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'user_id',  e.user_id,
            'name',     p.name,
            'status',   e.status,
            'position', e.position
          ) ORDER BY e.position NULLS LAST, e.created_at
        )
        FROM public.enrollments e
        JOIN public.profiles p ON p.id = e.user_id
        WHERE e.slot_id = p_slot_id
          AND e.status IN ('confirmed', 'attended', 'no_show')
      ), '[]'::jsonb)
      ELSE jsonb_build_object('count', v_slot.enrolled_count)
    END,
    'is_host',  v_is_host,
    'is_judge', v_is_judge,
    'is_admin', v_is_admin
  )
  INTO result
  FROM public.slots s
  JOIN public.rooms r         ON r.id = s.room_id
  JOIN public.host_directory h ON h.id = s.host_id
  WHERE s.id = p_slot_id;

  RETURN result;
END;
$$;

-- ── 2. attendance_tokens ──────────────────────────────────────────────────────
CREATE TABLE public.attendance_tokens (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id    uuid        NOT NULL REFERENCES public.slots(id) ON DELETE CASCADE,
  token      text        NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX att_tokens_slot_idx    ON public.attendance_tokens(slot_id);
CREATE INDEX att_tokens_expires_idx ON public.attendance_tokens(expires_at);

ALTER TABLE public.attendance_tokens ENABLE ROW LEVEL SECURITY;

-- Only host / co-judge / admin reads (cockpit display)
CREATE POLICY "att_tokens_read" ON public.attendance_tokens
  FOR SELECT TO authenticated
  USING (
    public.can_manage_rooms()
    OR EXISTS (SELECT 1 FROM public.slots     WHERE id      = slot_id AND host_id  = auth.uid())
    OR EXISTS (SELECT 1 FROM public.slot_judges WHERE slot_id = attendance_tokens.slot_id AND judge_id = auth.uid())
  );

-- Direct DML blocked; all writes go through SECURITY DEFINER RPCs (runs as table owner)
CREATE POLICY "att_tokens_no_direct_insert" ON public.attendance_tokens
  FOR INSERT TO authenticated WITH CHECK (false);

CREATE POLICY "att_tokens_no_direct_delete" ON public.attendance_tokens
  FOR DELETE TO authenticated USING (false);

-- Add attendance_tokens to realtime publication (so cockpit sees token updates live)
ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance_tokens;

-- ── 3. start_slot ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.start_slot(p_slot_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slot  public.slots%ROWTYPE;
  v_token text;
  v_exp   timestamptz;
BEGIN
  SELECT * INTO v_slot FROM public.slots WHERE id = p_slot_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'slot_not_found'); END IF;

  IF auth.uid() IS DISTINCT FROM v_slot.host_id AND NOT public.can_manage_rooms() THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;

  IF v_slot.status NOT IN ('open', 'full') THEN
    -- Idempotent: already live returns a fresh token
    IF v_slot.status = 'live' THEN
      NULL; -- fall through to token generation
    ELSE
      RETURN jsonb_build_object('error', 'slot_not_startable', 'status', v_slot.status);
    END IF;
  END IF;

  v_token := upper(substring(md5(random()::text || clock_timestamp()::text), 1, 6));
  v_exp   := now() + interval '60 seconds';

  UPDATE public.slots SET status = 'live', updated_at = now()
  WHERE id = p_slot_id AND status != 'live';

  DELETE FROM public.attendance_tokens WHERE slot_id = p_slot_id;
  INSERT INTO public.attendance_tokens (slot_id, token, expires_at)
  VALUES (p_slot_id, v_token, v_exp);

  RETURN jsonb_build_object('token', v_token, 'expires_at', v_exp);
END;
$$;

-- ── 4. rotate_token ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rotate_token(p_slot_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slot  public.slots%ROWTYPE;
  v_token text;
  v_exp   timestamptz;
BEGIN
  SELECT * INTO v_slot FROM public.slots WHERE id = p_slot_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'slot_not_found'); END IF;

  IF auth.uid() IS DISTINCT FROM v_slot.host_id
     AND NOT public.can_manage_rooms()
     AND NOT EXISTS (
       SELECT 1 FROM public.slot_judges WHERE slot_id = p_slot_id AND judge_id = auth.uid()
     ) THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;

  IF v_slot.status != 'live' THEN
    RETURN jsonb_build_object('error', 'slot_not_live', 'status', v_slot.status);
  END IF;

  v_token := upper(substring(md5(random()::text || clock_timestamp()::text), 1, 6));
  v_exp   := now() + interval '60 seconds';

  DELETE FROM public.attendance_tokens WHERE slot_id = p_slot_id;
  INSERT INTO public.attendance_tokens (slot_id, token, expires_at)
  VALUES (p_slot_id, v_token, v_exp);

  RETURN jsonb_build_object('token', v_token, 'expires_at', v_exp);
END;
$$;

-- ── 5. check_in ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_in(p_slot_id uuid, p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_valid  bool;
  v_enroll public.enrollments%ROWTYPE;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.attendance_tokens
    WHERE slot_id = p_slot_id
      AND token = upper(trim(p_token))
      AND expires_at > now()
  ) INTO v_valid;

  IF NOT v_valid THEN
    RETURN jsonb_build_object('error', 'invalid_or_expired_token');
  END IF;

  SELECT * INTO v_enroll
  FROM public.enrollments
  WHERE slot_id = p_slot_id AND user_id = auth.uid();

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
  SET status = 'attended', attended_at = now()
  WHERE slot_id = p_slot_id AND user_id = auth.uid();

  RETURN jsonb_build_object('status', 'attended');
END;
$$;

-- ── 6. finalize_slot ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.finalize_slot(p_slot_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slot     public.slots%ROWTYPE;
  v_attended int;
  v_no_show  int;
BEGIN
  SELECT * INTO v_slot FROM public.slots WHERE id = p_slot_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'slot_not_found'); END IF;

  IF auth.uid() IS DISTINCT FROM v_slot.host_id AND NOT public.can_manage_rooms() THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;

  IF v_slot.status != 'live' THEN
    RETURN jsonb_build_object('error', 'slot_not_live', 'status', v_slot.status);
  END IF;

  UPDATE public.enrollments
  SET status = 'no_show'
  WHERE slot_id = p_slot_id AND status = 'confirmed';
  GET DIAGNOSTICS v_no_show = ROW_COUNT;

  SELECT count(*) INTO v_attended
  FROM public.enrollments
  WHERE slot_id = p_slot_id AND status = 'attended';

  UPDATE public.slots SET status = 'completed', updated_at = now()
  WHERE id = p_slot_id;

  DELETE FROM public.attendance_tokens WHERE slot_id = p_slot_id;

  RETURN jsonb_build_object('attended', v_attended, 'no_show', v_no_show);
END;
$$;
