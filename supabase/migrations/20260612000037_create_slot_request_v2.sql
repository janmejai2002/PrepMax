-- Migration 037: add p_interviewer_count + p_function_tag to create_slot_request
CREATE OR REPLACE FUNCTION public.create_slot_request(
  p_location          text,
  p_preferred_at      timestamptz,
  p_background        text,
  p_description       text,
  p_interviewer_count int  DEFAULT 1,
  p_function_tag      text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_id   uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;
  IF length(trim(p_background)) < 5 THEN
    RETURN jsonb_build_object('error', 'background_required');
  END IF;
  IF length(trim(p_description)) < 10 THEN
    RETURN jsonb_build_object('error', 'description_required');
  END IF;
  IF p_interviewer_count NOT BETWEEN 1 AND 4 THEN
    RETURN jsonb_build_object('error', 'interviewer_count_invalid');
  END IF;

  INSERT INTO public.slot_requests
    (junior_id, location, preferred_at, background, description, interviewer_count, function_tag)
  VALUES
    (v_uid, p_location, p_preferred_at, p_background, p_description,
     COALESCE(p_interviewer_count, 1), p_function_tag)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('id', v_id, 'status', 'open');
END;
$$;
