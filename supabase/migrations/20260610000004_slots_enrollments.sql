-- Migration 004: slots + slot_judges + enrollments + room_status view + join_slot RPC
--
-- Implements the core data model for Phase 2 (The Crown Jewel):
--   slots        — what seniors post
--   slot_judges  — co-judges added by the host
--   enrollments  — who joined (confirmed / waitlist / …)
--   room_status  — view deferred from migration 003 (needed slots to compile)
--   join_slot()  — atomic seat-claiming RPC (Iron Rule #1)

-- ── 1. slots ──────────────────────────────────────────────────────────────────
CREATE TABLE public.slots (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  type           text        NOT NULL CHECK (type IN ('GD', 'PI')),
  host_id        uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  internship     text,
  expert_areas   text[]      NOT NULL DEFAULT '{}',
  room_id        uuid        NOT NULL REFERENCES public.rooms(id),
  start_at       timestamptz NOT NULL,
  end_at         timestamptz NOT NULL,
  topic          text        NOT NULL,
  description    text,
  gd_type_desc   text,
  capacity       int         NOT NULL CHECK (capacity >= 1),
  enrolled_count int         NOT NULL DEFAULT 0 CHECK (enrolled_count >= 0),
  status         text        NOT NULL DEFAULT 'open'
                   CHECK (status IN ('open', 'full', 'live', 'completed', 'cancelled')),
  share_slug     text        NOT NULL UNIQUE
                   DEFAULT substring(md5(gen_random_uuid()::text), 1, 10),
  version        int         NOT NULL DEFAULT 1,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT end_after_start CHECK (end_at > start_at)
);

-- ── 2. slot_judges ────────────────────────────────────────────────────────────
CREATE TABLE public.slot_judges (
  slot_id   uuid NOT NULL REFERENCES public.slots(id)   ON DELETE CASCADE,
  judge_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  PRIMARY KEY (slot_id, judge_id)
);

-- ── 3. enrollments ────────────────────────────────────────────────────────────
CREATE TABLE public.enrollments (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id     uuid        NOT NULL REFERENCES public.slots(id)    ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status      text        NOT NULL DEFAULT 'confirmed'
                CHECK (status IN ('confirmed', 'waitlist', 'cancelled', 'no_show', 'attended')),
  position    int,         -- seat number (confirmed) or waitlist queue position
  attended_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (slot_id, user_id)  -- idempotency guarantee (Iron Rule #1)
);

-- ── 4. Indexes ────────────────────────────────────────────────────────────────
CREATE INDEX slots_host_id_idx       ON public.slots(host_id);
CREATE INDEX slots_room_id_idx       ON public.slots(room_id);
CREATE INDEX slots_start_at_idx      ON public.slots(start_at);
CREATE INDEX slots_status_idx        ON public.slots(status);
CREATE INDEX enrollments_user_id_idx ON public.enrollments(user_id);
CREATE INDEX enrollments_slot_id_idx ON public.enrollments(slot_id);

-- ── 5. room_status view (deferred from migration 003) ─────────────────────────
CREATE OR REPLACE VIEW public.room_status AS
SELECT
  r.id,
  r.name,
  r.location,
  r.capacity,
  r.is_live,
  CASE
    WHEN NOT r.is_live THEN 'offline'
    WHEN EXISTS (
      SELECT 1 FROM public.slots s
      WHERE s.room_id = r.id
        AND s.status IN ('open', 'full', 'live')
        AND s.start_at <= now()
        AND s.end_at   >= now()
    ) THEN 'live_occupied'
    ELSE 'live_available'
  END AS status
FROM public.rooms r;

-- ── 6. RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE public.slots       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.slot_judges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;

-- slots: everyone reads; only capable hosts insert; host or admin updates/deletes
CREATE POLICY "slots_read" ON public.slots
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "slots_insert" ON public.slots
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = host_id AND (
      public.can_manage_rooms()
      OR (type = 'GD' AND COALESCE((SELECT can_host_gd FROM public.profiles WHERE id = auth.uid()), false))
      OR (type = 'PI' AND COALESCE((SELECT can_host_pi FROM public.profiles WHERE id = auth.uid()), false))
    )
  );

CREATE POLICY "slots_update" ON public.slots
  FOR UPDATE TO authenticated
  USING (auth.uid() = host_id OR public.can_manage_rooms());

CREATE POLICY "slots_delete" ON public.slots
  FOR DELETE TO authenticated
  USING (auth.uid() = host_id OR public.can_manage_rooms());

-- slot_judges: everyone reads; only host or admin inserts/deletes
CREATE POLICY "slot_judges_read" ON public.slot_judges
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "slot_judges_insert" ON public.slot_judges
  FOR INSERT TO authenticated
  WITH CHECK (
    public.can_manage_rooms()
    OR EXISTS (SELECT 1 FROM public.slots WHERE id = slot_id AND host_id = auth.uid())
  );

CREATE POLICY "slot_judges_delete" ON public.slot_judges
  FOR DELETE TO authenticated
  USING (
    public.can_manage_rooms()
    OR EXISTS (SELECT 1 FROM public.slots WHERE id = slot_id AND host_id = auth.uid())
  );

-- enrollments: user sees own; host/judge/admin see all for their slot
CREATE POLICY "enrollments_read" ON public.enrollments
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.can_manage_rooms()
    OR EXISTS (SELECT 1 FROM public.slots     WHERE id      = slot_id  AND host_id  = auth.uid())
    OR EXISTS (SELECT 1 FROM public.slot_judges WHERE slot_id = enrollments.slot_id AND judge_id = auth.uid())
  );

-- Direct inserts are guarded; the join_slot RPC (SECURITY DEFINER) bypasses RLS
CREATE POLICY "enrollments_insert" ON public.enrollments
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Attendance updates (no_show / attended) are done by host or admin
CREATE POLICY "enrollments_update" ON public.enrollments
  FOR UPDATE TO authenticated
  USING (
    public.can_manage_rooms()
    OR EXISTS (SELECT 1 FROM public.slots WHERE id = slot_id AND host_id = auth.uid())
  );

-- ── 7. join_slot — atomic seat-claiming RPC (Iron Rule #1) ───────────────────
-- Single Postgres function; SELECT…FOR UPDATE serialises all concurrent claimers
-- on the slot row so enrolled_count never oversells.
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

  -- Idempotency: if already enrolled, return the existing record unchanged
  SELECT * INTO v_existing
  FROM public.enrollments
  WHERE slot_id = p_slot_id AND user_id = p_user_id;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'status',     v_existing.status,
      'position',   v_existing.position,
      'idempotent', true
    );
  END IF;

  -- Claim a confirmed seat or join the waitlist
  IF v_slot.enrolled_count < v_slot.capacity THEN
    v_enroll_status := 'confirmed';
    v_position      := v_slot.enrolled_count + 1;

    INSERT INTO public.enrollments (slot_id, user_id, status, position)
    VALUES (p_slot_id, p_user_id, 'confirmed', v_position);

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

    INSERT INTO public.enrollments (slot_id, user_id, status, position)
    VALUES (p_slot_id, p_user_id, 'waitlist', v_position);
  END IF;

  -- Outbox event will be added in Phase 4 (Iron Rule #4)

  RETURN jsonb_build_object('status', v_enroll_status, 'position', v_position);
END;
$$;
