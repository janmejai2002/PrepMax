-- Migration 039: add p_visibility param to create_slot (default 'public')
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
  p_judge_ids    uuid[],
  p_visibility   text DEFAULT 'public'
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

  IF NOT (
    public.can_manage_rooms()
    OR (p_type = 'GD' AND v_caller.can_host_gd)
    OR (p_type = 'PI' AND v_caller.can_host_pi)
  ) THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;

  IF p_end_at <= p_start_at THEN
    RETURN jsonb_build_object('error', 'invalid_times');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.slots
    WHERE host_id = v_uid
      AND status NOT IN ('cancelled', 'completed')
      AND start_at < p_end_at
      AND end_at   > p_start_at
  ) THEN
    RETURN jsonb_build_object('error', 'host_time_conflict');
  END IF;

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
    description, gd_type_desc, visibility
  )
  VALUES (
    p_type, v_uid, p_topic, NULLIF(p_internship, ''), p_expert_areas,
    p_room_id, p_start_at, p_end_at, p_capacity,
    NULLIF(p_description, ''), NULLIF(p_gd_type_desc, ''),
    COALESCE(p_visibility, 'public')
  )
  RETURNING id INTO v_slot_id;

  IF array_length(p_judge_ids, 1) > 0 THEN
    INSERT INTO public.slot_judges (slot_id, judge_id)
    SELECT v_slot_id, unnest(p_judge_ids)
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT row_to_json(s)::jsonb INTO v_slot_row
  FROM public.slots s WHERE s.id = v_slot_id;

  RETURN jsonb_build_object('slot', v_slot_row);
END;
$$;
