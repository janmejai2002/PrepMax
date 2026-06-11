-- Migration 008: mentor field + host "Confirm & notify" lineup
--
-- Adds:
--   profiles.mentor_id    — each student's CRISP mentor (another profile)
--   slots.confirmed_at    — when the host marked the lineup final
--   mentor_directory      — public-safe list of mentors (for the onboarding picker)
--   confirm_slot()        — host/admin marks lineup final + returns email recipients
--   join_slot()           — recreated with a "lineup confirmed → no new joins" guard
--
-- The host emails the confirmed students from THEIR OWN Gmail (a client-side
-- compose deep link), so there is no server mailer and Iron Rule #4 doesn't apply.
-- But a regular host is not a CRISP admin, and profiles RLS is self-read-only, so
-- the recipient list (student + mentor emails) must come from a SECURITY DEFINER
-- RPC scoped to that slot's host — same pattern as join_slot.

-- ── 1. Schema additions ───────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN mentor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX profiles_mentor_id_idx ON public.profiles(mentor_id);

ALTER TABLE public.slots
  ADD COLUMN confirmed_at timestamptz;   -- null = lineup not yet finalised

-- ── 2. mentor_directory view ──────────────────────────────────────────────────
-- Mirror of host_directory (migration 005): profiles RLS is self-read-only, so we
-- expose ONLY public-safe fields of mentors via an owner-rights view. Email is NOT
-- exposed here — it's only ever read inside confirm_slot's authz boundary.
CREATE OR REPLACE VIEW public.mentor_directory
WITH (security_invoker = off) AS
SELECT
  p.id,
  p.name,
  p.year
FROM public.profiles p
WHERE p.is_mentor;

REVOKE ALL ON public.mentor_directory FROM anon, public;
GRANT SELECT ON public.mentor_directory TO authenticated;

-- ── 3. join_slot — recreated with a lineup-confirmed guard ────────────────────
-- Based on migration 006 (re-join-after-leave support) plus one added check: a
-- finalised lineup (confirmed_at set) accepts no new joiners. Default-null means
-- every existing join/leave/stress test still passes unchanged.
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
BEGIN
  -- Caller must be joining for themselves
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RETURN jsonb_build_object('error', 'unauthorized');
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

  -- Lineup finalised by the host: no new joiners (existing enrolments unaffected)
  IF v_slot.confirmed_at IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'lineup_confirmed');
  END IF;

  -- Inspect any prior enrolment for this user
  SELECT * INTO v_existing
  FROM public.enrollments
  WHERE slot_id = p_slot_id AND user_id = p_user_id;

  IF FOUND THEN
    -- Idempotency: an active enrolment is returned unchanged
    IF v_existing.status IN ('confirmed', 'waitlist') THEN
      RETURN jsonb_build_object(
        'status',     v_existing.status,
        'position',   v_existing.position,
        'idempotent', true
      );
    -- Terminal states cannot be re-joined
    ELSIF v_existing.status IN ('no_show', 'attended') THEN
      RETURN jsonb_build_object('error', 'enrollment_closed', 'enrollment_status', v_existing.status);
    END IF;
    -- status = 'cancelled' falls through: the user is re-joining
  END IF;

  -- Claim a confirmed seat or join the waitlist. The upsert reactivates a prior
  -- cancelled row (UNIQUE (slot_id, user_id)) or inserts a fresh one; created_at
  -- is bumped so a re-joiner goes to the back of the relevant queue.
  IF v_slot.enrolled_count < v_slot.capacity THEN
    v_enroll_status := 'confirmed';
    v_position      := v_slot.enrolled_count + 1;

    INSERT INTO public.enrollments (slot_id, user_id, status, position, created_at)
    VALUES (p_slot_id, p_user_id, 'confirmed', v_position, now())
    ON CONFLICT (slot_id, user_id)
    DO UPDATE SET status = 'confirmed', position = v_position, created_at = now();

    UPDATE public.slots
    SET enrolled_count = enrolled_count + 1,
        status         = CASE
                           WHEN enrolled_count + 1 >= capacity THEN 'full'
                           ELSE 'open'
                         END,
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

-- ── 4. confirm_slot — mark lineup final + return email recipients ─────────────
-- Returns everything the client needs to build the host's Gmail compose URL:
-- slot details, the confirmed students, and the To/CC email lists.
CREATE OR REPLACE FUNCTION public.confirm_slot(p_slot_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slot     public.slots%ROWTYPE;
  v_slot_obj jsonb;
  v_students jsonb;
  v_to       text[];
  v_cc       text[];
BEGIN
  SELECT * INTO v_slot FROM public.slots WHERE id = p_slot_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'slot_not_found');
  END IF;

  -- Only the host or a room-manager (SAC/CRISP) may confirm + see emails
  IF auth.uid() IS DISTINCT FROM v_slot.host_id AND NOT public.can_manage_rooms() THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;

  IF v_slot.status IN ('cancelled', 'completed') THEN
    RETURN jsonb_build_object('error', 'slot_not_confirmable', 'slot_status', v_slot.status);
  END IF;

  -- Confirmed students → To list
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object('name', stu.name, 'email', stu.email)
                       ORDER BY stu.name), '[]'::jsonb),
    COALESCE(array_agg(stu.email ORDER BY stu.name), '{}')
  INTO v_students, v_to
  FROM public.enrollments e
  JOIN public.profiles stu ON stu.id = e.user_id
  WHERE e.slot_id = p_slot_id AND e.status = 'confirmed';

  -- Refuse to finalise an empty lineup — that would just lock out new joiners
  IF array_length(v_to, 1) IS NULL THEN
    RETURN jsonb_build_object('error', 'no_confirmed_students');
  END IF;

  -- Stamp the lineup as final on first confirm; re-sends keep the original time
  UPDATE public.slots
  SET confirmed_at = now(), updated_at = now()
  WHERE id = p_slot_id AND confirmed_at IS NULL;

  -- Slot details for the email body + calendar link
  SELECT jsonb_build_object(
    'id',            s.id,
    'type',          s.type,
    'topic',         s.topic,
    'internship',    s.internship,
    'start_at',      s.start_at,
    'end_at',        s.end_at,
    'gd_type_desc',  s.gd_type_desc,
    'description',   s.description,
    'room_name',     r.name,
    'room_location', r.location,
    'host_name',     h.name
  )
  INTO v_slot_obj
  FROM public.slots s
  JOIN public.rooms    r ON r.id = s.room_id
  JOIN public.profiles h ON h.id = s.host_id
  WHERE s.id = p_slot_id;

  -- Their mentors' emails → CC list (distinct, non-null)
  SELECT COALESCE(array_agg(DISTINCT m.email), '{}')
  INTO v_cc
  FROM public.enrollments e
  JOIN public.profiles stu ON stu.id = e.user_id
  JOIN public.profiles m   ON m.id  = stu.mentor_id
  WHERE e.slot_id = p_slot_id AND e.status = 'confirmed' AND m.email IS NOT NULL;

  RETURN jsonb_build_object(
    'slot',     v_slot_obj,
    'students', v_students,
    'to',       to_jsonb(v_to),
    'cc',       to_jsonb(v_cc)
  );
END;
$$;
