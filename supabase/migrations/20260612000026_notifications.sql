-- Migration 026: In-app notification system (primary channel — works without Resend)
--
-- 1. notifications table   — per-user notification rows with read_at tracking
-- 2. RLS                   — user sees / updates own rows only; no client INSERT
-- 3. Realtime              — added to supabase_realtime publication
-- 4. Helper RPCs           — create_notification (SECURITY DEFINER helper), get_my_notifications,
--                            mark_notification_read, mark_all_notifications_read
-- 5. confirm_match (v3)    — + scheduling-conflict check + in-app notifications for junior,
--                            chosen senior, and all non-chosen seniors
-- 6. express_interest (v3) — + in-app notification for junior
-- 7. cancel_slot_request   — + in-app notifications for interested seniors
-- 8. leave_slot (v2)       — + in-app notification for promoted user (alongside existing outbox)
-- 9. cancel_slot (v2)      — + in-app notifications for enrollees (alongside existing outbox)
-- 10. edit_slot (v3)       — restore outbox writes (lost in 023) + add in-app notifications
-- 11. assign_mentee (v2)   — + in-app notification for assigned junior

-- ── 1. notifications table ────────────────────────────────────────────────────
CREATE TABLE public.notifications (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type       text        NOT NULL,
  title      text        NOT NULL,
  body       text        NOT NULL,
  link       text,
  payload    jsonb       NOT NULL DEFAULT '{}',
  read_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX notifications_user_created_idx ON public.notifications(user_id, created_at DESC);
CREATE INDEX notifications_user_unread_idx  ON public.notifications(user_id, created_at DESC)
  WHERE read_at IS NULL;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users can read their own notifications
CREATE POLICY "notifications_own_select"
  ON public.notifications FOR SELECT
  USING (auth.uid() = user_id);

-- Users can mark their own notifications as read (update read_at only; payload/type/etc immutable)
CREATE POLICY "notifications_own_update"
  ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- No INSERT policy for clients — only SECURITY DEFINER RPCs write notifications

-- ── 2. Realtime publication ───────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END
$$;

-- ── 3. create_notification — internal helper (SECURITY DEFINER) ───────────────
-- Called by all other RPCs in this migration. Never exposed directly to clients.
CREATE OR REPLACE FUNCTION public.create_notification(
  p_user_id uuid,
  p_type    text,
  p_title   text,
  p_body    text,
  p_link    text  DEFAULT NULL,
  p_payload jsonb DEFAULT '{}'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.notifications (user_id, type, title, body, link, payload)
  VALUES (p_user_id, p_type, p_title, p_body, p_link, p_payload)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- ── 4a. get_my_notifications ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_notifications()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;

  RETURN COALESCE(
    (SELECT jsonb_agg(
      jsonb_build_object(
        'id',         n.id,
        'type',       n.type,
        'title',      n.title,
        'body',       n.body,
        'link',       n.link,
        'payload',    n.payload,
        'read_at',    n.read_at,
        'created_at', n.created_at
      ) ORDER BY n.created_at DESC
    )
    FROM (
      SELECT * FROM public.notifications
      WHERE user_id = v_uid
      ORDER BY created_at DESC
      LIMIT 50
    ) n),
    '[]'::jsonb
  );
END;
$$;

-- ── 4b. mark_notification_read ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mark_notification_read(p_notification_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.notifications
  SET read_at = now()
  WHERE id = p_notification_id AND user_id = auth.uid() AND read_at IS NULL;
$$;

-- ── 4c. mark_all_notifications_read ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  UPDATE public.notifications
  SET read_at = now()
  WHERE user_id = auth.uid() AND read_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ── 5. confirm_match v3 ──────────────────────────────────────────────────────
-- Adds:
--   • Scheduling-conflict guard: reject if senior is hosting or confirmed in another
--     slot that overlaps preferred_at ± 90 min.
--   • In-app notification for junior (match confirmed)
--   • In-app notification for chosen senior (match confirmed)
--   • In-app notification for each non-chosen senior (request filled)
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
  v_window_start timestamptz;
  v_window_end   timestamptz;
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

  -- Scheduling-conflict check: does the senior have a slot (hosting or enrolled)
  -- within 90 min of preferred_at?
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

  -- Mark the request matched
  UPDATE public.slot_requests
  SET status = 'matched', matched_senior_id = p_senior_id, matched_at = now()
  WHERE id = p_request_id;

  -- Outbox: email junior
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

  -- Outbox: email senior
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

  -- In-app: notify junior
  PERFORM public.create_notification(
    v_uid,
    'match_confirmed',
    'You''re matched!',
    v_sen.name || ' will practice with you. Tap to send them a message.',
    '/my-requests',
    jsonb_build_object(
      'request_id',      p_request_id,
      'senior_name',     v_sen.name,
      'senior_whatsapp', COALESCE(v_sen.whatsapp, v_sen.phone, ''),
      'preferred_at',    v_req.preferred_at
    )
  );

  -- In-app: notify chosen senior
  PERFORM public.create_notification(
    p_senior_id,
    'match_confirmed',
    'You''ve been selected!',
    v_junior.name || ' confirmed your interest. Get in touch to prep together.',
    '/requests',
    jsonb_build_object(
      'request_id',      p_request_id,
      'junior_name',     v_junior.name,
      'junior_whatsapp', COALESCE(v_junior.whatsapp, v_junior.phone, ''),
      'preferred_at',    v_req.preferred_at
    )
  );

  -- In-app: notify non-chosen seniors (everyone else who expressed interest)
  INSERT INTO public.notifications (user_id, type, title, body, link, payload)
  SELECT
    i.senior_id,
    'non_chosen',
    'Request filled',
    'A practice request you were interested in has been filled.',
    '/requests',
    jsonb_build_object('request_id', p_request_id)
  FROM public.interests i
  WHERE i.request_id = p_request_id
    AND i.senior_id != p_senior_id;

  RETURN jsonb_build_object(
    'status',          'matched',
    'senior_id',       p_senior_id,
    'senior_name',     v_sen.name,
    'senior_whatsapp', COALESCE(v_sen.whatsapp, v_sen.phone, ''),
    'senior_phone',    COALESCE(v_sen.phone, '')
  );
END;
$$;

-- ── 6. express_interest v3 ────────────────────────────────────────────────────
-- Adds: in-app notification for junior when a senior shows interest.
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

  -- Only notify on a genuinely new interest (not idempotent repeat)
  IF v_rows_affected > 0 THEN
    SELECT * INTO v_junior_prof FROM public.profiles WHERE id = v_req.junior_id;
    SELECT COUNT(*)::int INTO v_interest_count
    FROM public.interests WHERE request_id = p_request_id;

    -- Outbox: email junior
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

    -- In-app: notify junior
    PERFORM public.create_notification(
      v_req.junior_id,
      'interest_expressed',
      'Someone wants to practice with you!',
      v_prof.name || ' is interested in your request (' || v_interest_count::text || ' total).',
      '/my-requests',
      jsonb_build_object(
        'request_id',     p_request_id,
        'senior_name',    v_prof.name,
        'interest_count', v_interest_count
      )
    );
  END IF;

  RETURN jsonb_build_object('status', 'interested');
END;
$$;

-- ── 7. cancel_slot_request — with notifications for interested seniors ─────────
CREATE OR REPLACE FUNCTION public.cancel_slot_request(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_req public.slot_requests%ROWTYPE;
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
  IF v_req.status = 'matched' THEN
    RETURN jsonb_build_object('error', 'already_matched');
  END IF;
  IF v_req.status = 'cancelled' THEN
    RETURN jsonb_build_object('status', 'already_cancelled');
  END IF;

  -- In-app: notify all seniors who expressed interest
  INSERT INTO public.notifications (user_id, type, title, body, link, payload)
  SELECT
    i.senior_id,
    'request_cancelled',
    'Request cancelled',
    'A practice request you were interested in has been cancelled.',
    '/requests',
    jsonb_build_object('request_id', p_request_id)
  FROM public.interests i
  WHERE i.request_id = p_request_id;

  UPDATE public.slot_requests SET status = 'cancelled' WHERE id = p_request_id;

  RETURN jsonb_build_object('status', 'cancelled');
END;
$$;

-- ── 8. leave_slot v3 — in-app notification for waitlist-promoted user ─────────
CREATE OR REPLACE FUNCTION public.leave_slot(p_slot_id uuid, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slot              public.slots%ROWTYPE;
  v_enroll            public.enrollments%ROWTYPE;
  v_waitlist_head     public.enrollments%ROWTYPE;
  v_seat_freed        bool := false;
  v_room              public.rooms%ROWTYPE;
  v_promoted_profile  public.profiles%ROWTYPE;
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
  IF v_enroll.status NOT IN ('confirmed', 'waitlist') THEN
    RETURN jsonb_build_object('error', 'not_active', 'enrollment_status', v_enroll.status);
  END IF;

  UPDATE public.enrollments SET status = 'cancelled'
  WHERE slot_id = p_slot_id AND user_id = p_user_id;

  IF v_enroll.status = 'confirmed' THEN
    SELECT * INTO v_waitlist_head FROM public.enrollments
    WHERE slot_id = p_slot_id AND status = 'waitlist'
    ORDER BY position ASC LIMIT 1;

    IF FOUND THEN
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

  RETURN jsonb_build_object('seat_freed', v_seat_freed);
END;
$$;

-- ── 9. cancel_slot v3 — in-app notifications for all active enrollees ─────────
CREATE OR REPLACE FUNCTION public.cancel_slot(p_slot_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slot public.slots%ROWTYPE;
BEGIN
  SELECT * INTO v_slot FROM public.slots WHERE id = p_slot_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'slot_not_found'); END IF;

  IF auth.uid() IS DISTINCT FROM v_slot.host_id AND NOT public.can_manage_rooms() THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;

  IF v_slot.status = 'cancelled' THEN
    RETURN jsonb_build_object('status', 'already_cancelled');
  END IF;

  IF v_slot.status IN ('live', 'completed') THEN
    RETURN jsonb_build_object('error', 'slot_not_cancellable', 'slot_status', v_slot.status);
  END IF;

  -- Outbox + in-app notifications for all active enrollees (single pass each)
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

  UPDATE public.enrollments SET status = 'cancelled'
  WHERE slot_id = p_slot_id AND status IN ('confirmed', 'waitlist');

  UPDATE public.slots
  SET status = 'cancelled', version = version + 1, updated_at = now()
  WHERE id = p_slot_id;

  RETURN jsonb_build_object('status', 'cancelled');
END;
$$;

-- ── 10. edit_slot v3 — restore outbox writes + add in-app notifications ───────
-- The v2 in migration 023 dropped the outbox writes that were in migration 011.
-- This version restores them and also fires in-app notifications.
-- Uses the jsonb-patch signature (same as migration 023).
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

  -- Room double-booking check when time or room changes
  v_time_changed := (p_patch ? 'start_at' OR p_patch ? 'end_at');
  v_room_changed := (p_patch ? 'room_id' AND (p_patch->>'room_id')::uuid IS DISTINCT FROM v_slot.room_id);

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

  -- Outbox + in-app notifications when time or room changes
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

-- ── 11. assign_mentee v3 — in-app notification for assigned junior ─────────────
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
  IF NOT v_caller.is_crisp THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;

  IF (SELECT count(*) FROM public.profiles WHERE mentor_id = v_uid) >= 30 THEN
    RETURN jsonb_build_object('error', 'mentor_limit_reached');
  END IF;

  SELECT * INTO v_junior FROM public.profiles WHERE id = p_junior_id AND year = 'first';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'junior_not_found');
  END IF;

  UPDATE public.profiles SET mentor_id = v_uid WHERE id = p_junior_id;

  -- In-app: notify junior
  PERFORM public.create_notification(
    p_junior_id,
    'mentee_added',
    'You have a CRISP mentor!',
    v_caller.name || ' has been assigned as your CRISP mentor.',
    '/mentor',
    jsonb_build_object('mentor_id', v_uid, 'mentor_name', v_caller.name)
  );

  RETURN jsonb_build_object('ok', true);
END;
$$;

NOTIFY pgrst, 'reload schema';
