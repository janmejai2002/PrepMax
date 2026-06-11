-- Migration 010: Feedback system
--
-- Adds:
--   feedback table         — judges give structured feedback to attended students
--   submit_feedback()      — upsert RPC (host/co-judge/admin → participant)
--   my_feedback view       — student's aggregated feedback for their profile page
--
-- Note: Iron Rule #7 says the "reviews" table never gets a user_id column.
-- This table is named "feedback", not "reviews", so the rule doesn't apply here.

-- ── 1. feedback table ─────────────────────────────────────────────────────────
CREATE TABLE public.feedback (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id      uuid        NOT NULL REFERENCES public.slots(id) ON DELETE CASCADE,
  from_user_id uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  to_user_id   uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- scores: {clarity, content, confidence, structure} each 1-5
  scores       jsonb       NOT NULL DEFAULT '{}',
  -- tags: positive ("Strong opener", "Data-driven") or improvement ("Too verbose", etc.)
  tags         text[]      NOT NULL DEFAULT '{}',
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (slot_id, from_user_id, to_user_id),
  CONSTRAINT no_self_feedback CHECK (from_user_id != to_user_id)
);

CREATE INDEX feedback_to_user_idx ON public.feedback(to_user_id);
CREATE INDEX feedback_from_user_idx ON public.feedback(from_user_id);
CREATE INDEX feedback_slot_idx      ON public.feedback(slot_id);

ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

-- Judges (host/co-judge/admin) insert and update their own feedback
CREATE POLICY "feedback_insert" ON public.feedback
  FOR INSERT TO authenticated
  WITH CHECK (
    from_user_id = auth.uid()
    AND (
      public.can_manage_rooms()
      OR EXISTS (SELECT 1 FROM public.slots WHERE id = slot_id AND host_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.slot_judges WHERE slot_id = feedback.slot_id AND judge_id = auth.uid())
    )
  );

-- Givers can update for 30 min (correction window)
CREATE POLICY "feedback_update" ON public.feedback
  FOR UPDATE TO authenticated
  USING (
    from_user_id = auth.uid()
    AND created_at > now() - interval '30 minutes'
  );

-- Recipient, giver, and admin can read
CREATE POLICY "feedback_read" ON public.feedback
  FOR SELECT TO authenticated
  USING (
    to_user_id   = auth.uid()
    OR from_user_id = auth.uid()
    OR public.can_manage_rooms()
  );

-- ── 2. submit_feedback ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.submit_feedback(
  p_slot_id    uuid,
  p_to_user_id uuid,
  p_scores     jsonb,
  p_tags       text[],
  p_notes      text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slot public.slots%ROWTYPE;
BEGIN
  IF auth.uid() = p_to_user_id THEN
    RETURN jsonb_build_object('error', 'self_feedback_not_allowed');
  END IF;

  SELECT * INTO v_slot FROM public.slots WHERE id = p_slot_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'slot_not_found'); END IF;

  IF NOT (
    auth.uid() = v_slot.host_id
    OR public.can_manage_rooms()
    OR EXISTS (SELECT 1 FROM public.slot_judges WHERE slot_id = p_slot_id AND judge_id = auth.uid())
  ) THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.enrollments
    WHERE slot_id = p_slot_id AND user_id = p_to_user_id
      AND status IN ('attended', 'confirmed', 'no_show')
  ) THEN
    RETURN jsonb_build_object('error', 'participant_not_found');
  END IF;

  INSERT INTO public.feedback (slot_id, from_user_id, to_user_id, scores, tags, notes)
  VALUES (p_slot_id, auth.uid(), p_to_user_id, p_scores, p_tags, p_notes)
  ON CONFLICT (slot_id, from_user_id, to_user_id)
  DO UPDATE SET
    scores = p_scores,
    tags   = p_tags,
    notes  = p_notes;

  RETURN jsonb_build_object('status', 'ok');
END;
$$;

-- ── 3. my_received_feedback view ─────────────────────────────────────────────
-- Aggregated for profile display: slot context + scores + tags per session
CREATE OR REPLACE VIEW public.my_received_feedback
WITH (security_invoker = on) AS
SELECT
  f.id,
  f.slot_id,
  f.from_user_id,
  f.to_user_id,
  f.scores,
  f.tags,
  f.notes,
  f.created_at,
  s.type        AS slot_type,
  s.topic       AS slot_topic,
  s.start_at    AS slot_start_at,
  h.name        AS host_name
FROM public.feedback f
JOIN public.slots    s ON s.id = f.slot_id
JOIN public.host_directory h ON h.id = s.host_id
WHERE f.to_user_id = auth.uid();

REVOKE ALL ON public.my_received_feedback FROM anon, public;
GRANT SELECT ON public.my_received_feedback TO authenticated;
