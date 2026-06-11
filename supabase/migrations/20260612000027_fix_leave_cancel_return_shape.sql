-- Migration 027: Fix leave_slot + cancel_slot return shapes to match test expectations
--
-- Migration 026 based these functions on migration 011's slimmer return shapes,
-- but the test suite (and pre-existing code) expects the richer migration 006/007 shapes:
--
--   leave_slot  → { status, was_confirmed, promoted_user_id, seat_freed }
--                  idempotent case → { status: 'cancelled', idempotent: true }
--
--   cancel_slot → { status, enrolments_released }
--                  idempotent case → { status: 'cancelled', idempotent: true }
--
-- All notification logic from migration 026 is preserved.

-- ── leave_slot v4 ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.leave_slot(p_slot_id uuid, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slot             public.slots%ROWTYPE;
  v_enroll           public.enrollments%ROWTYPE;
  v_waitlist_head    public.enrollments%ROWTYPE;
  v_was_confirmed    bool    := false;
  v_promoted_user    uuid    := NULL;
  v_seat_freed       bool    := false;
  v_room             public.rooms%ROWTYPE;
  v_promoted_profile public.profiles%ROWTYPE;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;

  SELECT * INTO v_slot FROM public.slots WHERE id = p_slot_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'slot_not_found'); END IF;

  IF v_slot.status IN ('live', 'completed', 'cancelled') THEN
    RETURN jsonb_build_object('error', 'slot_not_leavable', 'slot_status', v_slot.status);
  END IF;

  SELECT * INTO v_enroll FROM public.enrollments
  WHERE slot_id = p_slot_id AND user_id = p_user_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_enrolled'); END IF;

  -- Idempotent: already cancelled
  IF v_enroll.status = 'cancelled' THEN
    RETURN jsonb_build_object('status', 'cancelled', 'idempotent', true);
  END IF;

  IF v_enroll.status NOT IN ('confirmed', 'waitlist') THEN
    RETURN jsonb_build_object('error', 'not_active', 'enrollment_status', v_enroll.status);
  END IF;

  v_was_confirmed := (v_enroll.status = 'confirmed');

  UPDATE public.enrollments SET status = 'cancelled', position = NULL
  WHERE slot_id = p_slot_id AND user_id = p_user_id;

  IF v_was_confirmed THEN
    SELECT * INTO v_waitlist_head FROM public.enrollments
    WHERE slot_id = p_slot_id AND status = 'waitlist'
    ORDER BY position ASC LIMIT 1;

    IF FOUND THEN
      v_promoted_user := v_waitlist_head.user_id;

      UPDATE public.enrollments SET status = 'confirmed', position = v_enroll.position
      WHERE id = v_waitlist_head.id;

      UPDATE public.enrollments SET position = position - 1
      WHERE slot_id = p_slot_id AND status = 'waitlist' AND position > 1;

      -- Outbox: email promoted user
      SELECT * INTO v_promoted_profile FROM public.profiles WHERE id = v_waitlist_head.user_id;
      SELECT * INTO v_room FROM public.rooms WHERE id = v_slot.room_id;
      INSERT INTO public.outbox (event_type, payload) VALUES (
        'waitlist_promoted',
        jsonb_build_object(
          'to_email',      v_promoted_profile.email,
          'to_name',       v_promoted_profile.name,
          'slot_id',       v_slot.id,
          'slot_type',     v_slot.type,
          'slot_topic',    v_slot.topic,
          'start_at',      v_slot.start_at,
          'end_at',        v_slot.end_at,
          'room_name',     v_room.name,
          'room_location', v_room.location,
          'share_slug',    v_slot.share_slug
        )
      );

      -- In-app: notify promoted user
      PERFORM public.create_notification(
        v_waitlist_head.user_id,
        'waitlist_promoted',
        'You''re off the waitlist!',
        'You''re now confirmed for: ' || v_slot.topic,
        '/slots/' || p_slot_id::text,
        jsonb_build_object(
          'slot_id',    p_slot_id,
          'slot_topic', v_slot.topic,
          'start_at',   v_slot.start_at
        )
      );

    ELSE
      -- No waitlist: genuinely free the seat
      v_seat_freed := true;
      UPDATE public.slots
      SET enrolled_count = enrolled_count - 1,
          status = CASE WHEN status = 'full' THEN 'open' ELSE status END,
          updated_at = now()
      WHERE id = p_slot_id;
    END IF;

  ELSIF v_enroll.status = 'waitlist' THEN
    UPDATE public.enrollments SET position = position - 1
    WHERE slot_id = p_slot_id AND status = 'waitlist' AND position > v_enroll.position;
  END IF;

  RETURN jsonb_build_object(
    'status',           'cancelled',
    'was_confirmed',    v_was_confirmed,
    'promoted_user_id', v_promoted_user,
    'seat_freed',       v_seat_freed
  );
END;
$$;

-- ── cancel_slot v4 ───────────────────────────────────────────────────────────
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
  SELECT * INTO v_slot FROM public.slots WHERE id = p_slot_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'slot_not_found'); END IF;

  IF auth.uid() IS DISTINCT FROM v_slot.host_id AND NOT public.can_manage_rooms() THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;

  -- Idempotent
  IF v_slot.status = 'cancelled' THEN
    RETURN jsonb_build_object('status', 'cancelled', 'idempotent', true);
  END IF;

  IF v_slot.status IN ('live', 'completed') THEN
    RETURN jsonb_build_object('error', 'slot_not_cancellable', 'slot_status', v_slot.status);
  END IF;

  -- Outbox + in-app notifications for all active enrollees
  INSERT INTO public.outbox (event_type, payload)
  SELECT 'slot_cancelled',
    jsonb_build_object(
      'to_email',   p.email,
      'to_name',    p.name,
      'slot_id',    v_slot.id,
      'slot_type',  v_slot.type,
      'slot_topic', v_slot.topic,
      'start_at',   v_slot.start_at
    )
  FROM public.enrollments e
  JOIN public.profiles p ON p.id = e.user_id
  WHERE e.slot_id = p_slot_id AND e.status IN ('confirmed', 'waitlist');

  INSERT INTO public.notifications (user_id, type, title, body, link, payload)
  SELECT
    e.user_id,
    'slot_cancelled',
    'Session cancelled',
    '"' || v_slot.topic || '" has been cancelled.',
    '/',
    jsonb_build_object('slot_id', p_slot_id, 'slot_topic', v_slot.topic)
  FROM public.enrollments e
  WHERE e.slot_id = p_slot_id AND e.status IN ('confirmed', 'waitlist');

  UPDATE public.enrollments SET status = 'cancelled', position = NULL
  WHERE slot_id = p_slot_id AND status IN ('confirmed', 'waitlist');
  GET DIAGNOSTICS v_cancelled = ROW_COUNT;

  UPDATE public.slots
  SET status = 'cancelled', version = version + 1, updated_at = now()
  WHERE id = p_slot_id;

  RETURN jsonb_build_object(
    'status',              'cancelled',
    'enrolments_released', v_cancelled
  );
END;
$$;

NOTIFY pgrst, 'reload schema';
