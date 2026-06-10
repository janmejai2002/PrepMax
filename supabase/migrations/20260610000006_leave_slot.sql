-- Migration 006: leave_slot RPC + join_slot re-join support
--
-- leave_slot()  — atomic seat-release with waitlist auto-promotion (Iron Rule #1)
--   • A confirmed leaver frees a seat → the waitlist head is promoted atomically.
--   • If no waitlist, the seat is returned (enrolled_count--, status full→open).
--   • A waitlist leaver simply drops out; the queue closes up behind them.
--   • Confirmed seats are re-sequenced 1..N and the waitlist 1..M (FIFO by created_at)
--     so positions stay contiguous and gap-free after any departure.
--
-- join_slot() is REPLACED here so a user who previously left (status 'cancelled')
-- can re-join: the idempotency guard only short-circuits ACTIVE enrolments, and
-- the claim now upserts on (slot_id, user_id), reactivating the cancelled row and
-- pushing them to the back of the line (created_at = now()).

-- ── leave_slot — atomic seat release + waitlist promotion ──────────────────────
CREATE OR REPLACE FUNCTION public.leave_slot(p_slot_id uuid, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slot          public.slots%ROWTYPE;
  v_enrollment    public.enrollments%ROWTYPE;
  v_promoted      public.enrollments%ROWTYPE;
  v_was_confirmed boolean;
  v_promoted_user uuid := NULL;
BEGIN
  -- Caller must be leaving for themselves
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;

  -- Lock the slot row — serialises against concurrent joins/leaves on this slot
  SELECT * INTO v_slot
  FROM public.slots
  WHERE id = p_slot_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'slot_not_found');
  END IF;

  -- Find this user's enrolment
  SELECT * INTO v_enrollment
  FROM public.enrollments
  WHERE slot_id = p_slot_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'not_enrolled');
  END IF;

  -- Idempotency: leaving an already-cancelled enrolment is a no-op
  IF v_enrollment.status = 'cancelled' THEN
    RETURN jsonb_build_object('status', 'cancelled', 'idempotent', true);
  END IF;

  -- Only active enrolments can be left; terminal states (no_show/attended) cannot
  IF v_enrollment.status NOT IN ('confirmed', 'waitlist') THEN
    RETURN jsonb_build_object('error', 'not_leavable', 'enrollment_status', v_enrollment.status);
  END IF;

  v_was_confirmed := (v_enrollment.status = 'confirmed');

  -- Release the enrolment
  UPDATE public.enrollments
  SET status = 'cancelled', position = NULL
  WHERE id = v_enrollment.id;

  IF v_was_confirmed THEN
    -- A confirmed seat opened up — promote the waitlist head if one exists
    SELECT * INTO v_promoted
    FROM public.enrollments
    WHERE slot_id = p_slot_id AND status = 'waitlist'
    ORDER BY position ASC
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
      v_promoted_user := v_promoted.user_id;
      UPDATE public.enrollments
      SET status = 'confirmed'
      WHERE id = v_promoted.id;
      -- enrolled_count unchanged (one out, one in); a full slot stays full
    ELSE
      -- No one waiting — the seat is genuinely returned
      UPDATE public.slots
      SET enrolled_count = enrolled_count - 1,
          status         = CASE WHEN status = 'full' THEN 'open' ELSE status END,
          updated_at     = now()
      WHERE id = p_slot_id;
    END IF;
  END IF;
  -- A waitlist leaver never touches enrolled_count.

  -- Re-sequence confirmed seats 1..N and the waitlist 1..M (FIFO) so positions
  -- stay contiguous after the departure / promotion.
  WITH ranked AS (
    SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn
    FROM public.enrollments
    WHERE slot_id = p_slot_id AND status = 'confirmed'
  )
  UPDATE public.enrollments e
  SET position = ranked.rn
  FROM ranked
  WHERE e.id = ranked.id;

  WITH ranked AS (
    SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn
    FROM public.enrollments
    WHERE slot_id = p_slot_id AND status = 'waitlist'
  )
  UPDATE public.enrollments e
  SET position = ranked.rn
  FROM ranked
  WHERE e.id = ranked.id;

  -- Outbox event (notify promoted user) will be added in Phase 4 (Iron Rule #4)

  RETURN jsonb_build_object(
    'status',           'cancelled',
    'was_confirmed',    v_was_confirmed,
    'promoted_user_id', v_promoted_user,
    'seat_freed',       (v_was_confirmed AND v_promoted_user IS NULL)
  );
END;
$$;

-- ── join_slot — REPLACED to support re-joining after a leave ───────────────────
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

    -- Safe: slot is FOR UPDATE locked, no concurrent waitlist inserts can race
    SELECT COALESCE(MAX(position), 0) + 1 INTO v_position
    FROM public.enrollments
    WHERE slot_id = p_slot_id AND status = 'waitlist';

    INSERT INTO public.enrollments (slot_id, user_id, status, position, created_at)
    VALUES (p_slot_id, p_user_id, 'waitlist', v_position, now())
    ON CONFLICT (slot_id, user_id)
    DO UPDATE SET status = 'waitlist', position = v_position, created_at = now();
  END IF;

  -- Outbox event will be added in Phase 4 (Iron Rule #4)

  RETURN jsonb_build_object('status', v_enroll_status, 'position', v_position);
END;
$$;
