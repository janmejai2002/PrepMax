-- Migration 022: New outbox event types + 30-min slot reminders
--
-- Adds:
--   slots.reminder_sent_at         — tracks whether the 30-min reminder has been sent
--   insert_slot_reminders()        — queues slot_reminder_30m outbox rows (called by drain-notifications cron)
--   express_interest (updated)     — writes interest_expressed to outbox (notifies junior)
--   confirm_match (updated)        — writes match_confirmed to outbox for both junior and senior

-- ── 1. Add reminder tracking to slots ─────────────────────────────────────────
ALTER TABLE public.slots ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz;

-- ── 2. insert_slot_reminders: called by drain-notifications at top of each run ─
CREATE OR REPLACE FUNCTION public.insert_slot_reminders()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int := 0;
BEGIN
  -- Insert outbox rows for confirmed enrollees of slots starting in 25-35 min
  WITH due_slots AS (
    SELECT s.id AS slot_id, s.type, s.topic, s.start_at, s.end_at,
           r.name AS room_name, r.location AS room_location
    FROM public.slots s
    JOIN public.rooms r ON r.id = s.room_id
    WHERE s.status IN ('open', 'full')
      AND s.start_at BETWEEN now() + interval '25 minutes'
                         AND now() + interval '35 minutes'
      AND s.reminder_sent_at IS NULL
  ),
  inserted AS (
    INSERT INTO public.outbox (event_type, payload)
    SELECT
      'slot_reminder_30m',
      jsonb_build_object(
        'to_email',      p.email,
        'to_name',       p.name,
        'slot_id',       ds.slot_id,
        'slot_type',     ds.type,
        'slot_topic',    ds.topic,
        'start_at',      ds.start_at,
        'end_at',        ds.end_at,
        'room_name',     ds.room_name,
        'room_location', ds.room_location
      )
    FROM due_slots ds
    JOIN public.enrollments e ON e.slot_id = ds.slot_id AND e.status = 'confirmed'
    JOIN public.profiles p ON p.id = e.user_id
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_count FROM inserted;

  -- Mark all due slots as reminded, even if they had zero confirmed enrollees
  UPDATE public.slots
  SET reminder_sent_at = now()
  WHERE status IN ('open', 'full')
    AND start_at BETWEEN now() + interval '25 minutes'
               AND now() + interval '35 minutes'
    AND reminder_sent_at IS NULL;

  RETURN v_count;
END;
$$;

-- ── 3. express_interest (updated): write interest_expressed to outbox ──────────
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
  IF NOT (v_prof.can_host_gd OR v_prof.can_host_pi OR v_prof.is_committee OR v_prof.is_crisp_admin) THEN
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

  -- Outbox: notify junior only on a genuinely new interest (not idempotent repeat)
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

-- ── 4. confirm_match (updated): write match_confirmed to outbox for both parties
CREATE OR REPLACE FUNCTION public.confirm_match(
  p_request_id uuid,
  p_senior_id  uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_req    public.slot_requests%ROWTYPE;
  v_sen    public.profiles%ROWTYPE;
  v_junior public.profiles%ROWTYPE;
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

  IF NOT EXISTS (
    SELECT 1 FROM public.interests
    WHERE request_id = p_request_id AND senior_id = p_senior_id
  ) THEN
    RETURN jsonb_build_object('error', 'senior_not_interested');
  END IF;

  SELECT * INTO v_sen FROM public.profiles WHERE id = p_senior_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'senior_not_found');
  END IF;

  SELECT * INTO v_junior FROM public.profiles WHERE id = v_uid;

  UPDATE public.slot_requests
  SET status = 'matched', matched_senior_id = p_senior_id, matched_at = now()
  WHERE id = p_request_id;

  -- Outbox: notify junior (match confirmation)
  INSERT INTO public.outbox (event_type, payload) VALUES (
    'match_confirmed',
    jsonb_build_object(
      'to_email',        v_junior.email,
      'to_name',         v_junior.name,
      'recipient',       'junior',
      'request_id',      p_request_id,
      'location',        v_req.location,
      'preferred_at',    v_req.preferred_at,
      'senior_name',     v_sen.name,
      'senior_whatsapp', COALESCE(v_sen.whatsapp, v_sen.phone, '')
    )
  );

  -- Outbox: notify senior (they were selected; junior contact revealed post-match)
  INSERT INTO public.outbox (event_type, payload) VALUES (
    'match_confirmed',
    jsonb_build_object(
      'to_email',        v_sen.email,
      'to_name',         v_sen.name,
      'recipient',       'senior',
      'request_id',      p_request_id,
      'location',        v_req.location,
      'preferred_at',    v_req.preferred_at,
      'junior_name',     v_junior.name,
      'junior_whatsapp', COALESCE(v_junior.whatsapp, v_junior.phone, '')
    )
  );

  RETURN jsonb_build_object(
    'status',          'matched',
    'senior_id',       p_senior_id,
    'senior_name',     v_sen.name,
    'senior_whatsapp', COALESCE(v_sen.whatsapp, v_sen.phone, ''),
    'senior_phone',    COALESCE(v_sen.phone, '')
  );
END;
$$;

NOTIFY pgrst, 'reload schema';
