-- Migration 007: cancel_slot + edit_slot RPCs (host/admin slot management)
--
-- cancel_slot() — host or room-manager cancels a whole slot. The slot and every
--   active enrolment (confirmed + waitlist) flip to 'cancelled' atomically.
--
-- edit_slot()   — host or room-manager edits slot fields under an OPTIMISTIC LOCK
--   on `version`. A stale version returns version_conflict (no write). Raising the
--   capacity auto-promotes waitlist heads into the new seats; lowering it below the
--   confirmed head-count is rejected. Positions are re-sequenced contiguous.
--
-- Both are SECURITY DEFINER (bypass RLS) so they enforce authorisation in-function:
-- caller must be the slot host OR public.can_manage_rooms() (SAC / CRISP admin).

-- ── cancel_slot ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cancel_slot(p_slot_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slot      public.slots%ROWTYPE;
  v_cancelled int;
BEGIN
  SELECT * INTO v_slot
  FROM public.slots
  WHERE id = p_slot_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'slot_not_found');
  END IF;

  -- Only the host or a room-manager may cancel
  IF NOT (v_slot.host_id = auth.uid() OR public.can_manage_rooms()) THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;

  -- Idempotency: already cancelled
  IF v_slot.status = 'cancelled' THEN
    RETURN jsonb_build_object('status', 'cancelled', 'idempotent', true);
  END IF;

  -- A finished slot cannot be cancelled
  IF v_slot.status = 'completed' THEN
    RETURN jsonb_build_object('error', 'slot_not_cancellable', 'slot_status', v_slot.status);
  END IF;

  -- Cancel every active enrolment
  UPDATE public.enrollments
  SET status = 'cancelled', position = NULL
  WHERE slot_id = p_slot_id AND status IN ('confirmed', 'waitlist');
  GET DIAGNOSTICS v_cancelled = ROW_COUNT;

  -- Cancel the slot itself (version bump keeps optimistic readers honest)
  UPDATE public.slots
  SET status     = 'cancelled',
      version    = version + 1,
      updated_at = now()
  WHERE id = p_slot_id;

  -- Outbox notifications (tell enrolees) will be added in Phase 4 (Iron Rule #4)

  RETURN jsonb_build_object(
    'status',             'cancelled',
    'enrolments_released', v_cancelled
  );
END;
$$;

-- ── edit_slot ─────────────────────────────────────────────────────────────────
-- p_patch is a jsonb object with any subset of editable keys:
--   topic, description, internship, gd_type_desc (text)
--   expert_areas (jsonb array of text)
--   start_at, end_at (ISO timestamptz strings)
--   capacity (int)
-- Only keys present in p_patch are touched.
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
  SELECT * INTO v_slot
  FROM public.slots
  WHERE id = p_slot_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'slot_not_found');
  END IF;

  IF NOT (v_slot.host_id = auth.uid() OR public.can_manage_rooms()) THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;

  -- Only live-able slots can be edited (not cancelled / completed)
  IF v_slot.status NOT IN ('open', 'full') THEN
    RETURN jsonb_build_object('error', 'slot_not_editable', 'slot_status', v_slot.status);
  END IF;

  -- Optimistic concurrency: bail if the caller's view is stale
  IF v_slot.version IS DISTINCT FROM p_expected_version THEN
    RETURN jsonb_build_object('error', 'version_conflict', 'current_version', v_slot.version);
  END IF;

  -- Validate proposed times (defaults to current values)
  v_start := COALESCE((p_patch->>'start_at')::timestamptz, v_slot.start_at);
  v_end   := COALESCE((p_patch->>'end_at')::timestamptz,   v_slot.end_at);
  IF v_end <= v_start THEN
    RETURN jsonb_build_object('error', 'invalid_times');
  END IF;

  -- Validate proposed capacity
  v_new_capacity := COALESCE((p_patch->>'capacity')::int, v_slot.capacity);
  IF v_new_capacity < 1 THEN
    RETURN jsonb_build_object('error', 'invalid_capacity');
  END IF;
  IF v_new_capacity < v_slot.enrolled_count THEN
    RETURN jsonb_build_object(
      'error', 'capacity_below_enrolled',
      'enrolled_count', v_slot.enrolled_count
    );
  END IF;

  -- Raising capacity pulls waitlist heads into the freed seats
  IF v_new_capacity > v_slot.enrolled_count THEN
    WITH heads AS (
      SELECT id
      FROM public.enrollments
      WHERE slot_id = p_slot_id AND status = 'waitlist'
      ORDER BY position ASC
      LIMIT (v_new_capacity - v_slot.enrolled_count)
      FOR UPDATE
    )
    UPDATE public.enrollments
    SET status = 'confirmed'
    WHERE id IN (SELECT id FROM heads);
    GET DIAGNOSTICS v_promoted_count = ROW_COUNT;
  END IF;

  v_enrolled   := v_slot.enrolled_count + v_promoted_count;
  v_new_status := CASE WHEN v_enrolled >= v_new_capacity THEN 'full' ELSE 'open' END;

  -- Apply the patch (only keys present in p_patch are changed)
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

  -- Re-sequence confirmed seats 1..N and the waitlist 1..M (FIFO) after promotion
  WITH ranked AS (
    SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn
    FROM public.enrollments
    WHERE slot_id = p_slot_id AND status = 'confirmed'
  )
  UPDATE public.enrollments e SET position = ranked.rn
  FROM ranked WHERE e.id = ranked.id;

  WITH ranked AS (
    SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn
    FROM public.enrollments
    WHERE slot_id = p_slot_id AND status = 'waitlist'
  )
  UPDATE public.enrollments e SET position = ranked.rn
  FROM ranked WHERE e.id = ranked.id;

  RETURN jsonb_build_object(
    'status',          'updated',
    'version',         v_slot.version + 1,
    'promoted_count',  v_promoted_count,
    'enrolled_count',  v_enrolled,
    'slot_status',     v_new_status
  );
END;
$$;
