-- Migration 031: multi-interviewer PI requests
ALTER TABLE slot_requests
  ADD COLUMN IF NOT EXISTS interviewer_count INT NOT NULL DEFAULT 1
    CHECK (interviewer_count BETWEEN 1 AND 4),
  ADD COLUMN IF NOT EXISTS confirmed_count   INT NOT NULL DEFAULT 0;

ALTER TABLE interests
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'declined'));

-- confirm_match v4: backwards-compatible + multi-interviewer support
-- Preserves all v3 error codes and return shape; adds confirmed_count/interviewer_count fields.
CREATE OR REPLACE FUNCTION public.confirm_match(
  p_request_id UUID,
  p_senior_id  UUID
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid          UUID := auth.uid();
  v_req          public.slot_requests%ROWTYPE;
  v_sen          public.profiles%ROWTYPE;
  v_junior       public.profiles%ROWTYPE;
  v_int_status   TEXT;
  v_new_confirmed INT;
  v_new_status   TEXT;
  v_window_start TIMESTAMPTZ;
  v_window_end   TIMESTAMPTZ;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;

  SELECT * INTO v_req FROM public.slot_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;
  IF v_req.junior_id != v_uid THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;
  IF v_req.status != 'open' THEN
    RETURN jsonb_build_object('error', 'request_not_open', 'status', v_req.status);
  END IF;

  SELECT status INTO v_int_status
  FROM public.interests
  WHERE request_id = p_request_id AND senior_id = p_senior_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'senior_not_interested');
  END IF;
  IF v_int_status = 'confirmed' THEN
    RETURN jsonb_build_object('error', 'already_confirmed');
  END IF;

  SELECT * INTO v_sen FROM public.profiles WHERE id = p_senior_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'senior_not_found');
  END IF;

  SELECT * INTO v_junior FROM public.profiles WHERE id = v_uid;

  v_window_start := v_req.preferred_at - interval '90 minutes';
  v_window_end   := v_req.preferred_at + interval '90 minutes';
  IF EXISTS (
    SELECT 1 FROM public.slots
    WHERE host_id = p_senior_id
      AND status NOT IN ('cancelled', 'completed')
      AND start_at < v_window_end
      AND end_at   > v_window_start
  ) OR EXISTS (
    SELECT 1 FROM public.enrollments e
    JOIN public.slots s ON s.id = e.slot_id
    WHERE e.user_id = p_senior_id
      AND e.status = 'confirmed'
      AND s.status NOT IN ('cancelled', 'completed')
      AND s.start_at < v_window_end
      AND s.end_at   > v_window_start
  ) THEN
    RETURN jsonb_build_object('error', 'senior_time_conflict');
  END IF;

  UPDATE public.interests SET status = 'confirmed'
  WHERE request_id = p_request_id AND senior_id = p_senior_id;

  v_new_confirmed := v_req.confirmed_count + 1;
  v_new_status := CASE
    WHEN v_new_confirmed >= v_req.interviewer_count THEN 'matched'
    ELSE 'open'
  END;

  UPDATE public.slot_requests
  SET confirmed_count   = v_new_confirmed,
      matched_senior_id = COALESCE(matched_senior_id, p_senior_id),
      matched_at        = COALESCE(matched_at, now()),
      status            = v_new_status
  WHERE id = p_request_id;

  INSERT INTO public.outbox (event_type, payload) VALUES (
    'match_confirmed',
    jsonb_build_object(
      'to_email', v_junior.email, 'to_name', v_junior.name,
      'recipient', 'junior', 'request_id', p_request_id,
      'location', v_req.location, 'preferred_at', v_req.preferred_at,
      'senior_name', v_sen.name,
      'senior_whatsapp', COALESCE(v_sen.whatsapp, v_sen.phone, ''),
      'confirmed_count', v_new_confirmed,
      'interviewer_count', v_req.interviewer_count
    )
  );

  INSERT INTO public.outbox (event_type, payload) VALUES (
    'match_confirmed',
    jsonb_build_object(
      'to_email', v_sen.email, 'to_name', v_sen.name,
      'recipient', 'senior', 'request_id', p_request_id,
      'location', v_req.location, 'preferred_at', v_req.preferred_at,
      'junior_name', v_junior.name,
      'junior_whatsapp', COALESCE(v_junior.whatsapp, v_junior.phone, '')
    )
  );

  PERFORM public.create_notification(
    v_uid, 'match_confirmed',
    'Interviewer confirmed: ' || v_sen.name,
    CASE WHEN v_new_status = 'matched'
      THEN v_sen.name || ' confirmed. Tap to coordinate on WhatsApp.'
      ELSE v_new_confirmed::text || ' of ' || v_req.interviewer_count::text || ' interviewers confirmed.'
    END,
    '/ask',
    jsonb_build_object(
      'request_id', p_request_id, 'senior_name', v_sen.name,
      'senior_whatsapp', COALESCE(v_sen.whatsapp, v_sen.phone, ''),
      'confirmed_count', v_new_confirmed, 'interviewer_count', v_req.interviewer_count
    )
  );

  PERFORM public.create_notification(
    p_senior_id, 'match_confirmed', 'You''ve been selected!',
    v_junior.name || ' confirmed you for their practice session.',
    '/requests',
    jsonb_build_object(
      'request_id', p_request_id,
      'junior_name', v_junior.name,
      'junior_whatsapp', COALESCE(v_junior.whatsapp, v_junior.phone, ''),
      'preferred_at', v_req.preferred_at
    )
  );

  IF v_new_status = 'matched' THEN
    INSERT INTO public.notifications (user_id, type, title, body, link, payload)
    SELECT i.senior_id, 'non_chosen', 'Request filled',
      'A practice request you were interested in has been filled.',
      '/requests', jsonb_build_object('request_id', p_request_id)
    FROM public.interests i
    WHERE i.request_id = p_request_id
      AND i.senior_id != p_senior_id
      AND (i.status IS NULL OR i.status = 'pending');
  END IF;

  RETURN jsonb_build_object(
    'status',            v_new_status,
    'senior_id',         p_senior_id,
    'senior_name',       v_sen.name,
    'senior_whatsapp',   COALESCE(v_sen.whatsapp, v_sen.phone, ''),
    'senior_phone',      COALESCE(v_sen.phone, ''),
    'confirmed_count',   v_new_confirmed,
    'interviewer_count', v_req.interviewer_count
  );
END;
$$;

-- retract_confirmation: junior un-confirms a senior
CREATE OR REPLACE FUNCTION public.retract_confirmation(
  p_request_id UUID,
  p_senior_id  UUID
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.slot_requests
    WHERE id = p_request_id AND junior_id = auth.uid()
  ) THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;

  UPDATE public.interests SET status = 'pending'
  WHERE request_id = p_request_id AND senior_id = p_senior_id AND status = 'confirmed';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'not_confirmed');
  END IF;

  UPDATE public.slot_requests
  SET confirmed_count = GREATEST(0, confirmed_count - 1),
      status          = 'open'
  WHERE id = p_request_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;
