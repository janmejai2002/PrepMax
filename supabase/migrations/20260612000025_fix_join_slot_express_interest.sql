-- Migration 025: Fix join_slot v5 (broken position/status) + express_interest (old columns)
--
-- join_slot v5 in migration 024 had two bugs:
--   1. INSERT omitted position → position was NULL
--   2. Used status 'waitlisted' instead of the valid 'waitlist'
-- express_interest still referenced dropped columns is_committee + is_crisp_admin.

-- ── 1. join_slot v6: correct position + waitlist status + is_crisp check ─────────
CREATE OR REPLACE FUNCTION public.join_slot(p_slot_id uuid, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slot          public.slots%ROWTYPE;
  v_caller        public.profiles%ROWTYPE;
  v_existing      public.enrollments%ROWTYPE;
  v_enroll_status text;
  v_position      int;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;

  SELECT * INTO v_caller FROM public.profiles WHERE id = p_user_id;

  IF v_caller.can_host_gd OR v_caller.can_host_pi THEN
    RETURN jsonb_build_object('error', 'seniors_cannot_join');
  END IF;

  IF v_caller.is_sac OR v_caller.is_crisp THEN
    RETURN jsonb_build_object('error', 'seniors_cannot_join');
  END IF;

  SELECT * INTO v_slot
  FROM public.slots
  WHERE id = p_slot_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'slot_not_found');
  END IF;

  IF v_slot.status NOT IN ('open', 'full') THEN
    RETURN jsonb_build_object('error', 'slot_not_joinable', 'slot_status', v_slot.status);
  END IF;

  IF v_slot.confirmed_at IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'lineup_confirmed');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.enrollments e
    JOIN public.slots s ON s.id = e.slot_id
    WHERE e.user_id = p_user_id
      AND e.status = 'confirmed'
      AND s.id != p_slot_id
      AND s.status NOT IN ('cancelled', 'completed')
      AND s.start_at < v_slot.end_at
      AND s.end_at   > v_slot.start_at
  ) THEN
    RETURN jsonb_build_object('error', 'time_conflict');
  END IF;

  SELECT * INTO v_existing
  FROM public.enrollments
  WHERE slot_id = p_slot_id AND user_id = p_user_id;

  IF FOUND THEN
    IF v_existing.status IN ('confirmed', 'waitlist') THEN
      RETURN jsonb_build_object('status', v_existing.status, 'position', v_existing.position, 'idempotent', true);
    ELSIF v_existing.status IN ('no_show', 'attended') THEN
      RETURN jsonb_build_object('error', 'enrollment_closed', 'enrollment_status', v_existing.status);
    END IF;
    -- status = 'cancelled': fall through to re-join
  END IF;

  IF v_slot.enrolled_count < v_slot.capacity THEN
    v_enroll_status := 'confirmed';
    v_position      := v_slot.enrolled_count + 1;

    INSERT INTO public.enrollments (slot_id, user_id, status, position, created_at)
    VALUES (p_slot_id, p_user_id, 'confirmed', v_position, now())
    ON CONFLICT (slot_id, user_id)
    DO UPDATE SET status = 'confirmed', position = v_position, created_at = now();

    UPDATE public.slots
    SET enrolled_count = enrolled_count + 1,
        status         = CASE WHEN enrolled_count + 1 >= capacity THEN 'full' ELSE 'open' END,
        updated_at     = now()
    WHERE id = p_slot_id;

  ELSE
    v_enroll_status := 'waitlist';

    SELECT COALESCE(MAX(position), 0) + 1 INTO v_position
    FROM public.enrollments
    WHERE slot_id = p_slot_id AND status = 'waitlist';

    INSERT INTO public.enrollments (slot_id, user_id, status, position, created_at)
    VALUES (p_slot_id, p_user_id, 'waitlist', v_position, now())
    ON CONFLICT (slot_id, user_id)
    DO UPDATE SET status = 'waitlist', position = v_position, created_at = now();
  END IF;

  RETURN jsonb_build_object('status', v_enroll_status, 'position', v_position);
END;
$$;

-- ── 2. express_interest: replace is_committee/is_crisp_admin with is_crisp ──────
CREATE OR REPLACE FUNCTION public.express_interest(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid            uuid := auth.uid();
  v_req            public.slot_requests%ROWTYPE;
  v_prof           public.profiles%ROWTYPE;
  v_junior_prof    public.profiles%ROWTYPE;
  v_interest_count int;
  v_rows_affected  int;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;

  SELECT * INTO v_prof FROM public.profiles WHERE id = v_uid;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;
  IF NOT (v_prof.can_host_gd OR v_prof.can_host_pi OR v_prof.is_crisp) THEN
    RETURN jsonb_build_object('error', 'seniors_only');
  END IF;

  SELECT * INTO v_req FROM public.slot_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;
  IF v_req.status != 'open' THEN
    RETURN jsonb_build_object('error', 'request_not_open', 'status', v_req.status);
  END IF;
  IF v_req.junior_id = v_uid THEN
    RETURN jsonb_build_object('error', 'cannot_self_interest');
  END IF;

  INSERT INTO public.interests (request_id, senior_id)
  VALUES (p_request_id, v_uid)
  ON CONFLICT (request_id, senior_id) DO NOTHING;
  GET DIAGNOSTICS v_rows_affected = ROW_COUNT;

  IF v_rows_affected > 0 THEN
    SELECT * INTO v_junior_prof FROM public.profiles WHERE id = v_req.junior_id;
    SELECT COUNT(*)::int INTO v_interest_count
    FROM public.interests WHERE request_id = p_request_id;

    INSERT INTO public.outbox (event_type, payload) VALUES (
      'interest_expressed',
      jsonb_build_object(
        'to_email',       v_junior_prof.email,
        'to_name',        v_junior_prof.name,
        'request_id',     p_request_id,
        'location',       v_req.location,
        'preferred_at',   v_req.preferred_at,
        'interest_count', v_interest_count
      )
    );
  END IF;

  RETURN jsonb_build_object('status', 'interested');
END;
$$;
