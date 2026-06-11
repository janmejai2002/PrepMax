-- Migration 011: Transactional Outbox + Notification infrastructure (Iron Rule #4)
--
-- Pattern: side effects fire AFTER commit via outbox table, never inside booking.
-- A Supabase Edge Function (`drain-notifications`) polls/is-triggered and sends emails.
--
-- Adds:
--   outbox             — event queue; Edge Function drains it
--   notification_log   — audit trail of every send attempt
--   Updated RPCs:      join_slot, leave_slot (waitlist-promotion path), cancel_slot,
--                      edit_slot — all now write to outbox in the same transaction

-- ── 1. outbox ─────────────────────────────────────────────────────────────────
CREATE TABLE public.outbox (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type    text        NOT NULL,
  payload       jsonb       NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now(),
  processed_at  timestamptz,
  last_error    text,
  attempt_count int         NOT NULL DEFAULT 0
);
CREATE INDEX outbox_unprocessed_idx ON public.outbox(created_at) WHERE processed_at IS NULL;
ALTER TABLE public.outbox ENABLE ROW LEVEL SECURITY;
-- Outbox is service-role/Edge Function only; clients cannot access
CREATE POLICY "outbox_no_client" ON public.outbox FOR ALL TO authenticated USING (false);

-- ── 2. notification_log ───────────────────────────────────────────────────────
CREATE TABLE public.notification_log (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  outbox_id   uuid        REFERENCES public.outbox(id) ON DELETE SET NULL,
  event_type  text        NOT NULL,
  to_email    text        NOT NULL,
  status      text        NOT NULL DEFAULT 'sent',  -- 'sent' | 'failed'
  provider_id text,                                  -- Resend message id
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notification_log_no_client" ON public.notification_log FOR ALL TO authenticated USING (false);

-- ── 3. join_slot — with outbox event ─────────────────────────────────────────
-- Same logic as migration 008 (lineup_confirmed guard + re-join support).
-- Adds: outbox INSERT for 'slot_joined' at end of successful confirmed join.
CREATE OR REPLACE FUNCTION public.join_slot(p_slot_id uuid, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slot          public.slots%ROWTYPE;
  v_existing      public.enrollments%ROWTYPE;
  v_enroll_status text;
  v_position      int;
  v_room          public.rooms%ROWTYPE;
  v_profile       public.profiles%ROWTYPE;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;

  SELECT * INTO v_slot FROM public.slots WHERE id = p_slot_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'slot_not_found'); END IF;

  IF v_slot.status NOT IN ('open', 'full') THEN
    RETURN jsonb_build_object('error', 'slot_not_joinable', 'slot_status', v_slot.status);
  END IF;

  IF v_slot.confirmed_at IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'lineup_confirmed');
  END IF;

  SELECT * INTO v_existing FROM public.enrollments WHERE slot_id = p_slot_id AND user_id = p_user_id;

  IF FOUND THEN
    IF v_existing.status IN ('confirmed', 'waitlist') THEN
      RETURN jsonb_build_object('status', v_existing.status, 'position', v_existing.position, 'idempotent', true);
    ELSIF v_existing.status IN ('no_show', 'attended') THEN
      RETURN jsonb_build_object('error', 'enrollment_closed', 'enrollment_status', v_existing.status);
    END IF;
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
        status = CASE WHEN enrolled_count + 1 >= capacity THEN 'full' ELSE 'open' END,
        updated_at = now()
    WHERE id = p_slot_id;

    -- Outbox: notify confirmed joiner
    SELECT * INTO v_profile FROM public.profiles WHERE id = p_user_id;
    SELECT * INTO v_room    FROM public.rooms    WHERE id = v_slot.room_id;
    INSERT INTO public.outbox (event_type, payload) VALUES (
      'slot_joined',
      jsonb_build_object(
        'to_email',      v_profile.email,
        'to_name',       v_profile.name,
        'slot_id',       v_slot.id,
        'slot_type',     v_slot.type,
        'slot_topic',    v_slot.topic,
        'slot_internship', v_slot.internship,
        'start_at',      v_slot.start_at,
        'end_at',        v_slot.end_at,
        'room_name',     v_room.name,
        'room_location', v_room.location,
        'position',      v_position
      )
    );
  ELSE
    v_enroll_status := 'waitlist';
    SELECT COALESCE(MAX(position), 0) + 1 INTO v_position
    FROM public.enrollments WHERE slot_id = p_slot_id AND status = 'waitlist';

    INSERT INTO public.enrollments (slot_id, user_id, status, position, created_at)
    VALUES (p_slot_id, p_user_id, 'waitlist', v_position, now())
    ON CONFLICT (slot_id, user_id)
    DO UPDATE SET status = 'waitlist', position = v_position, created_at = now();
  END IF;

  RETURN jsonb_build_object('status', v_enroll_status, 'position', v_position);
END;
$$;

-- ── 4. leave_slot — with outbox event for promoted user ───────────────────────
CREATE OR REPLACE FUNCTION public.leave_slot(p_slot_id uuid, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slot         public.slots%ROWTYPE;
  v_enroll       public.enrollments%ROWTYPE;
  v_waitlist_head public.enrollments%ROWTYPE;
  v_seat_freed   bool := false;
  v_room         public.rooms%ROWTYPE;
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

  SELECT * INTO v_enroll FROM public.enrollments WHERE slot_id = p_slot_id AND user_id = p_user_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_enrolled'); END IF;
  IF v_enroll.status NOT IN ('confirmed', 'waitlist') THEN
    RETURN jsonb_build_object('error', 'not_active', 'enrollment_status', v_enroll.status);
  END IF;

  UPDATE public.enrollments SET status = 'cancelled' WHERE slot_id = p_slot_id AND user_id = p_user_id;

  IF v_enroll.status = 'confirmed' THEN
    -- Try to promote the waitlist head
    SELECT * INTO v_waitlist_head FROM public.enrollments
    WHERE slot_id = p_slot_id AND status = 'waitlist'
    ORDER BY position ASC LIMIT 1;

    IF FOUND THEN
      UPDATE public.enrollments SET status = 'confirmed', position = v_enroll.position
      WHERE id = v_waitlist_head.id;

      UPDATE public.enrollments SET position = position - 1
      WHERE slot_id = p_slot_id AND status = 'waitlist' AND position > 1;

      -- Outbox: notify promoted user
      SELECT * INTO v_promoted_profile FROM public.profiles WHERE id = v_waitlist_head.user_id;
      SELECT * INTO v_room FROM public.rooms WHERE id = v_slot.room_id;
      INSERT INTO public.outbox (event_type, payload) VALUES (
        'waitlist_promoted',
        jsonb_build_object(
          'to_email',   v_promoted_profile.email,
          'to_name',    v_promoted_profile.name,
          'slot_id',    v_slot.id,
          'slot_type',  v_slot.type,
          'slot_topic', v_slot.topic,
          'start_at',   v_slot.start_at,
          'end_at',     v_slot.end_at,
          'room_name',  v_room.name,
          'room_location', v_room.location,
          'share_slug', v_slot.share_slug
        )
      );
    ELSE
      -- No waitlist: free the seat
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

-- ── 5. cancel_slot — with outbox events for all affected ─────────────────────
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

  -- Notify all active enrollees before cancelling them
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

  UPDATE public.enrollments SET status = 'cancelled'
  WHERE slot_id = p_slot_id AND status IN ('confirmed', 'waitlist');

  UPDATE public.slots
  SET status = 'cancelled', version = version + 1, updated_at = now()
  WHERE id = p_slot_id;

  RETURN jsonb_build_object('status', 'cancelled');
END;
$$;

-- ── 6. edit_slot — with outbox events when time/room changes ──────────────────
CREATE OR REPLACE FUNCTION public.edit_slot(
  p_slot_id   uuid,
  p_version   int,
  p_topic     text    DEFAULT NULL,
  p_description text  DEFAULT NULL,
  p_start_at  timestamptz DEFAULT NULL,
  p_end_at    timestamptz DEFAULT NULL,
  p_capacity  int     DEFAULT NULL,
  p_gd_type_desc text DEFAULT NULL,
  p_room_id   uuid   DEFAULT NULL,
  p_expert_areas text[] DEFAULT NULL,
  p_internship text  DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slot        public.slots%ROWTYPE;
  v_new_capacity int;
  v_promoted    int := 0;
  v_time_changed bool;
  v_room_changed bool;
  v_new_room    public.rooms%ROWTYPE;
BEGIN
  SELECT * INTO v_slot FROM public.slots WHERE id = p_slot_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'slot_not_found'); END IF;

  IF auth.uid() IS DISTINCT FROM v_slot.host_id AND NOT public.can_manage_rooms() THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;

  IF v_slot.status IN ('cancelled', 'completed') THEN
    RETURN jsonb_build_object('error', 'slot_not_editable', 'slot_status', v_slot.status);
  END IF;

  IF v_slot.version != p_version THEN
    RETURN jsonb_build_object('error', 'version_conflict', 'current_version', v_slot.version);
  END IF;

  v_new_capacity := COALESCE(p_capacity, v_slot.capacity);
  IF v_new_capacity < v_slot.enrolled_count THEN
    RETURN jsonb_build_object('error', 'capacity_below_enrolled', 'enrolled', v_slot.enrolled_count);
  END IF;

  v_time_changed := p_start_at IS NOT NULL AND p_start_at != v_slot.start_at;
  v_room_changed := p_room_id  IS NOT NULL AND p_room_id  != v_slot.room_id;

  UPDATE public.slots
  SET
    topic        = COALESCE(p_topic,        topic),
    description  = COALESCE(p_description,  description),
    start_at     = COALESCE(p_start_at,     start_at),
    end_at       = COALESCE(p_end_at,       end_at),
    capacity     = v_new_capacity,
    gd_type_desc = COALESCE(p_gd_type_desc, gd_type_desc),
    room_id      = COALESCE(p_room_id,      room_id),
    expert_areas = COALESCE(p_expert_areas, expert_areas),
    internship   = COALESCE(p_internship,   internship),
    status       = CASE
                     WHEN v_new_capacity > enrolled_count AND status = 'full' THEN 'open'
                     WHEN v_new_capacity <= enrolled_count AND status = 'open' THEN 'full'
                     ELSE status
                   END,
    version      = version + 1,
    updated_at   = now()
  WHERE id = p_slot_id;

  -- Promote waitlist heads if capacity increased
  IF v_new_capacity > v_slot.capacity THEN
    WITH ranked AS (
      SELECT id, ROW_NUMBER() OVER (ORDER BY position ASC) AS rn
      FROM public.enrollments
      WHERE slot_id = p_slot_id AND status = 'waitlist'
      LIMIT v_new_capacity - v_slot.capacity
    )
    UPDATE public.enrollments e
    SET status = 'confirmed', position = v_slot.enrolled_count + ranked.rn
    FROM ranked WHERE e.id = ranked.id;
    GET DIAGNOSTICS v_promoted = ROW_COUNT;
  END IF;

  -- Outbox: notify confirmed enrollees of time/room change
  IF v_time_changed OR v_room_changed THEN
    SELECT * INTO v_new_room FROM public.rooms
    WHERE id = COALESCE(p_room_id, v_slot.room_id);

    INSERT INTO public.outbox (event_type, payload)
    SELECT 'slot_edited',
      jsonb_build_object(
        'to_email',     p.email,
        'to_name',      p.name,
        'slot_id',      p_slot_id,
        'slot_type',    v_slot.type,
        'slot_topic',   COALESCE(p_topic, v_slot.topic),
        'start_at',     COALESCE(p_start_at, v_slot.start_at),
        'end_at',       COALESCE(p_end_at,   v_slot.end_at),
        'room_name',    v_new_room.name,
        'room_location',v_new_room.location
      )
    FROM public.enrollments e
    JOIN public.profiles p ON p.id = e.user_id
    WHERE e.slot_id = p_slot_id AND e.status = 'confirmed';
  END IF;

  RETURN jsonb_build_object('status', 'updated', 'promoted', v_promoted);
END;
$$;
