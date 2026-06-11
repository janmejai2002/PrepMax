-- Migration 028: edit_slot — add host time-conflict check on time changes
--
-- create_slot already guards against host self-overlap, but edit_slot (v3 in
-- migration 026) only checks room double-booking. Add the symmetric check so a
-- senior can't edit a slot's time into a window where they're already hosting.

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
  v_new_room       public.rooms%ROWTYPE;
  v_time_changed   bool;
  v_room_changed   bool;
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

  v_time_changed := (p_patch ? 'start_at' OR p_patch ? 'end_at');
  v_room_changed := (p_patch ? 'room_id' AND (p_patch->>'room_id')::uuid IS DISTINCT FROM v_slot.room_id);

  -- Host self-overlap: reject if the new time clashes with another slot the host is running
  IF v_time_changed AND EXISTS (
    SELECT 1 FROM public.slots
    WHERE host_id = v_slot.host_id
      AND id != p_slot_id
      AND status NOT IN ('cancelled', 'completed')
      AND start_at < v_end
      AND end_at   > v_start
  ) THEN
    RETURN jsonb_build_object('error', 'host_time_conflict');
  END IF;

  -- Room double-booking check when time or room changes
  IF (v_time_changed OR v_room_changed) AND EXISTS (
    SELECT 1 FROM public.slots
    WHERE room_id = COALESCE((p_patch->>'room_id')::uuid, v_slot.room_id)
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
    RETURN jsonb_build_object(
      'error', 'capacity_below_enrolled',
      'enrolled_count', v_slot.enrolled_count
    );
  END IF;

  IF v_new_capacity > v_slot.enrolled_count THEN
    WITH heads AS (
      SELECT id
      FROM public.enrollments
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

  IF v_time_changed OR v_room_changed THEN
    SELECT * INTO v_new_room FROM public.rooms
    WHERE id = COALESCE((p_patch->>'room_id')::uuid, v_slot.room_id);

    INSERT INTO public.outbox (event_type, payload)
    SELECT 'slot_edited',
      jsonb_build_object(
        'to_email',      p.email,
        'to_name',       p.name,
        'slot_id',       p_slot_id,
        'slot_type',     v_slot.type,
        'slot_topic',    COALESCE(p_patch->>'topic', v_slot.topic),
        'start_at',      v_start,
        'end_at',        v_end,
        'room_name',     v_new_room.name,
        'room_location', v_new_room.location
      )
    FROM public.enrollments e
    JOIN public.profiles p ON p.id = e.user_id
    WHERE e.slot_id = p_slot_id AND e.status = 'confirmed';

    INSERT INTO public.notifications (user_id, type, title, body, link, payload)
    SELECT
      e.user_id,
      'slot_edited',
      'Session updated',
      '"' || COALESCE(p_patch->>'topic', v_slot.topic) || '" has a new time or location.',
      '/slots/' || p_slot_id::text,
      jsonb_build_object('slot_id', p_slot_id)
    FROM public.enrollments e
    WHERE e.slot_id = p_slot_id AND e.status = 'confirmed';
  END IF;

  RETURN jsonb_build_object(
    'status',          'updated',
    'version',         v_slot.version + 1,
    'promoted_count',  v_promoted_count,
    'enrolled_count',  v_enrolled,
    'slot_status',     v_new_status
  );
END;
$$;

NOTIFY pgrst, 'reload schema';
