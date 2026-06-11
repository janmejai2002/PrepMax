-- Migration 023: Role/view guards + scheduling clash detection + mentee management
--
-- 1. join_slot v4      — block seniors; block juniors with overlapping confirmed enrollment
-- 2. edit_slot v2      — block room double-booking when times change
-- 3. create_slot RPC   — atomic slot creation with host-overlap + room-overlap checks
-- 4. get_all_juniors   — CRISP member mentee picker (returns all b26/first-year profiles)
-- 5. assign_mentee     — CRISP member sets mentor_id on a junior profile

-- ── 1. join_slot v4 ──────────────────────────────────────────────────────────────
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
  -- Caller must be joining for themselves
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;

  -- Load caller profile to check role
  SELECT * INTO v_caller FROM public.profiles WHERE id = p_user_id;

  -- Seniors (hosts) are judges/evaluators, not participants
  IF v_caller.can_host_gd OR v_caller.can_host_pi THEN
    RETURN jsonb_build_object('error', 'seniors_cannot_join');
  END IF;

  -- Committee shared accounts also cannot join as participants
  IF v_caller.is_sac OR v_caller.is_crisp_admin OR v_caller.is_committee THEN
    RETURN jsonb_build_object('error', 'seniors_cannot_join');
  END IF;

  -- Lock the slot row — all concurrent joins block here until we commit
  SELECT * INTO v_slot
  FROM public.slots
  WHERE id = p_slot_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'slot_not_found');
  END IF;

  -- Only open/full slots are joinable (full still allows waitlist)
  IF v_slot.status NOT IN ('open', 'full') THEN
    RETURN jsonb_build_object('error', 'slot_not_joinable', 'slot_status', v_slot.status);
  END IF;

  -- Lineup finalised by the host: no new joiners
  IF v_slot.confirmed_at IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'lineup_confirmed');
  END IF;

  -- Time-conflict: caller already has a confirmed enrollment that overlaps this slot
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

  -- Inspect any prior enrollment for this user
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

-- ── 2. edit_slot v2 — add room double-booking check on time change ─────────────
CREATE OR REPLACE FUNCTION public.edit_slot(
  p_slot_id          uuid,
  p_expected_version int,
  p_patch            jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slot           public.slots%ROWTYPE;
  v_new_capacity   int;
  v_start          timestamptz;
  v_end            timestamptz;
  v_promoted_count int := 0;
  v_enrolled       int;
  v_new_status     text;
BEGIN
  SELECT * INTO v_slot FROM public.slots WHERE id = p_slot_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'slot_not_found');
  END IF;

  IF NOT (v_slot.host_id = auth.uid() OR public.can_manage_rooms()) THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;

  IF v_slot.status NOT IN ('open', 'full') THEN
    RETURN jsonb_build_object('error', 'slot_not_editable', 'slot_status', v_slot.status);
  END IF;

  IF v_slot.version IS DISTINCT FROM p_expected_version THEN
    RETURN jsonb_build_object('error', 'version_conflict', 'current_version', v_slot.version);
  END IF;

  v_start := COALESCE((p_patch->>'start_at')::timestamptz, v_slot.start_at);
  v_end   := COALESCE((p_patch->>'end_at')::timestamptz,   v_slot.end_at);
  IF v_end <= v_start THEN
    RETURN jsonb_build_object('error', 'invalid_times');
  END IF;

  -- Room double-booking: another active slot in the same room at the new times
  IF (p_patch ? 'start_at' OR p_patch ? 'end_at') AND EXISTS (
    SELECT 1 FROM public.slots
    WHERE room_id = v_slot.room_id
      AND id != p_slot_id
      AND status NOT IN ('cancelled', 'completed')
      AND start_at < v_end
      AND end_at   > v_start
  ) THEN
    RETURN jsonb_build_object('error', 'room_double_booked');
  END IF;

  v_new_capacity := COALESCE((p_patch->>'capacity')::int, v_slot.capacity);
  IF v_new_capacity < 1 THEN
    RETURN jsonb_build_object('error', 'invalid_capacity');
  END IF;
  IF v_new_capacity < v_slot.enrolled_count THEN
    RETURN jsonb_build_object('error', 'capacity_below_enrolled', 'enrolled_count', v_slot.enrolled_count);
  END IF;

  IF v_new_capacity > v_slot.enrolled_count THEN
    WITH heads AS (
      SELECT id FROM public.enrollments
      WHERE slot_id = p_slot_id AND status = 'waitlist'
      ORDER BY position ASC
      LIMIT (v_new_capacity - v_slot.enrolled_count)
      FOR UPDATE
    )
    UPDATE public.enrollments SET status = 'confirmed'
    WHERE id IN (SELECT id FROM heads);
    GET DIAGNOSTICS v_promoted_count = ROW_COUNT;
  END IF;

  v_enrolled   := v_slot.enrolled_count + v_promoted_count;
  v_new_status := CASE WHEN v_enrolled >= v_new_capacity THEN 'full' ELSE 'open' END;

  UPDATE public.slots SET
    topic        = CASE WHEN p_patch ? 'topic'        THEN p_patch->>'topic'        ELSE topic END,
    description  = CASE WHEN p_patch ? 'description'  THEN p_patch->>'description'  ELSE description END,
    internship   = CASE WHEN p_patch ? 'internship'   THEN p_patch->>'internship'   ELSE internship END,
    gd_type_desc = CASE WHEN p_patch ? 'gd_type_desc' THEN p_patch->>'gd_type_desc' ELSE gd_type_desc END,
    expert_areas = CASE WHEN p_patch ? 'expert_areas'
                        THEN ARRAY(SELECT jsonb_array_elements_text(p_patch->'expert_areas'))
                        ELSE expert_areas END,
    start_at       = v_start,
    end_at         = v_end,
    capacity       = v_new_capacity,
    enrolled_count = v_enrolled,
    status         = v_new_status,
    version        = version + 1,
    updated_at     = now()
  WHERE id = p_slot_id;

  WITH ranked AS (
    SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn
    FROM public.enrollments WHERE slot_id = p_slot_id AND status = 'confirmed'
  )
  UPDATE public.enrollments e SET position = ranked.rn FROM ranked WHERE e.id = ranked.id;

  WITH ranked AS (
    SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn
    FROM public.enrollments WHERE slot_id = p_slot_id AND status = 'waitlist'
  )
  UPDATE public.enrollments e SET position = ranked.rn FROM ranked WHERE e.id = ranked.id;

  RETURN jsonb_build_object(
    'status',         'updated',
    'version',        v_slot.version + 1,
    'promoted_count', v_promoted_count,
    'enrolled_count', v_enrolled,
    'slot_status',    v_new_status
  );
END;
$$;

-- ── 3. create_slot — atomic creation with overlap checks ──────────────────────
-- Replaces direct INSERT from the client. Returns {slot: <row>} on success or
-- {error: <code>} on failure.
CREATE OR REPLACE FUNCTION public.create_slot(
  p_type         text,
  p_topic        text,
  p_internship   text,
  p_expert_areas text[],
  p_room_id      uuid,
  p_start_at     timestamptz,
  p_end_at       timestamptz,
  p_capacity     int,
  p_description  text,
  p_gd_type_desc text,
  p_judge_ids    uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_caller   public.profiles%ROWTYPE;
  v_slot_id  uuid;
  v_slot_row jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;

  SELECT * INTO v_caller FROM public.profiles WHERE id = v_uid;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;

  -- Capability check mirrors the RLS slots_insert policy
  IF NOT (
    public.can_manage_rooms()
    OR (p_type = 'GD' AND v_caller.can_host_gd)
    OR (p_type = 'PI' AND v_caller.can_host_pi)
  ) THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;

  -- Basic time sanity
  IF p_end_at <= p_start_at THEN
    RETURN jsonb_build_object('error', 'invalid_times');
  END IF;

  -- Host double-booking: this senior is already hosting a slot at the same time
  IF EXISTS (
    SELECT 1 FROM public.slots
    WHERE host_id = v_uid
      AND status NOT IN ('cancelled', 'completed')
      AND start_at < p_end_at
      AND end_at   > p_start_at
  ) THEN
    RETURN jsonb_build_object('error', 'host_time_conflict');
  END IF;

  -- Room double-booking
  IF EXISTS (
    SELECT 1 FROM public.slots
    WHERE room_id = p_room_id
      AND status NOT IN ('cancelled', 'completed')
      AND start_at < p_end_at
      AND end_at   > p_start_at
  ) THEN
    RETURN jsonb_build_object('error', 'room_double_booked');
  END IF;

  INSERT INTO public.slots (
    type, host_id, topic, internship, expert_areas,
    room_id, start_at, end_at, capacity,
    description, gd_type_desc
  )
  VALUES (
    p_type, v_uid, p_topic, NULLIF(p_internship, ''), p_expert_areas,
    p_room_id, p_start_at, p_end_at, p_capacity,
    NULLIF(p_description, ''), NULLIF(p_gd_type_desc, '')
  )
  RETURNING id INTO v_slot_id;

  -- Co-judges
  IF array_length(p_judge_ids, 1) > 0 THEN
    INSERT INTO public.slot_judges (slot_id, judge_id)
    SELECT v_slot_id, unnest(p_judge_ids)
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT to_jsonb(s) INTO v_slot_row FROM public.slots s WHERE id = v_slot_id;

  RETURN jsonb_build_object('slot', v_slot_row);
END;
$$;

-- ── 4. get_all_juniors — mentee picker for CRISP members ─────────────────────
CREATE OR REPLACE FUNCTION public.get_all_juniors()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_caller public.profiles%ROWTYPE;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;

  SELECT * INTO v_caller FROM public.profiles WHERE id = v_uid;
  IF NOT (v_caller.is_crisp_member OR v_caller.is_crisp_admin) THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id',        p.id,
      'name',      p.name,
      'email',     p.email,
      'batch',     p.batch,
      'section',   p.section,
      'mentor_id', p.mentor_id
    ) ORDER BY p.name
  ), '[]'::jsonb)
  INTO v_result
  FROM public.profiles p
  WHERE p.year = 'first';

  RETURN jsonb_build_object('juniors', v_result);
END;
$$;

-- ── 5. assign_mentee — CRISP member assigns themselves as mentor to a junior ──
CREATE OR REPLACE FUNCTION public.assign_mentee(p_junior_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_caller public.profiles%ROWTYPE;
  v_junior public.profiles%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;

  SELECT * INTO v_caller FROM public.profiles WHERE id = v_uid;
  IF NOT (v_caller.is_crisp_member OR v_caller.is_crisp_admin) THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;

  SELECT * INTO v_junior FROM public.profiles WHERE id = p_junior_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'junior_not_found');
  END IF;

  IF v_junior.year != 'first' THEN
    RETURN jsonb_build_object('error', 'not_a_junior');
  END IF;

  UPDATE public.profiles
  SET mentor_id = v_uid
  WHERE id = p_junior_id;

  RETURN jsonb_build_object('status', 'assigned', 'mentor_id', v_uid);
END;
$$;

-- ── 6. unassign_mentee — remove a mentor assignment ──────────────────────────
CREATE OR REPLACE FUNCTION public.unassign_mentee(p_junior_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_caller public.profiles%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;

  SELECT * INTO v_caller FROM public.profiles WHERE id = v_uid;
  IF NOT (v_caller.is_crisp_member OR v_caller.is_crisp_admin) THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;

  UPDATE public.profiles
  SET mentor_id = NULL
  WHERE id = p_junior_id AND mentor_id = v_uid;

  RETURN jsonb_build_object('status', 'unassigned');
END;
$$;

NOTIFY pgrst, 'reload schema';
