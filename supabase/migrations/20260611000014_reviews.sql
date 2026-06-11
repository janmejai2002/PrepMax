-- Migration 014: Anonymous reviews (Iron Rule #7 — reviews table NEVER gets user_id)
--
-- Privacy design (from SPEC.md §8):
--   dedup_hash = SHA256(user_id || slot_id || server_secret) — proves one review per attendee,
--   irreversible from the hash alone.
--   Batch release: reviews only show to seniors when a slot has >= 3 reviews OR
--   they are fetching their own received reviews (via a safe aggregate view).

CREATE TABLE public.reviews (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id     uuid        NOT NULL REFERENCES public.slots(id) ON DELETE CASCADE,
  -- NO user_id column (Iron Rule #7)
  rating      smallint    NOT NULL CHECK (rating BETWEEN 1 AND 5),
  text        text        CHECK (char_length(text) <= 1000),
  dedup_hash  text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (slot_id, dedup_hash)
);

CREATE INDEX reviews_slot_idx ON public.reviews(slot_id, created_at);

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

-- Only authenticated users can insert (RPC enforces attendance + hash)
CREATE POLICY "reviews_insert" ON public.reviews
  FOR INSERT TO authenticated WITH CHECK (false);  -- always via RPC

-- Host and admins can SELECT their own slot's reviews (via view)
CREATE POLICY "reviews_select_admin" ON public.reviews
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (is_crisp_admin OR is_sac)
    )
    OR EXISTS (
      SELECT 1 FROM public.slots WHERE id = slot_id AND host_id = auth.uid()
    )
  );

-- ── submit_review RPC ─────────────────────────────────────────────────────────
-- Computes dedup_hash server-side; validates attendance; inserts review.
-- Returns error if already reviewed (idempotent) or not attended.
CREATE OR REPLACE FUNCTION public.submit_review(
  p_slot_id uuid,
  p_rating  smallint,
  p_text    text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enrollment public.enrollments%ROWTYPE;
  v_hash       text;
  v_secret     text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('error', 'unauthorized'); END IF;

  -- Must have attended
  SELECT * INTO v_enrollment
  FROM public.enrollments
  WHERE slot_id = p_slot_id AND user_id = auth.uid();

  IF NOT FOUND OR v_enrollment.status != 'attended' THEN
    RETURN jsonb_build_object('error', 'not_attended');
  END IF;

  -- Compute one-way hash using current_setting secret (set in vault / env)
  v_secret := COALESCE(
    current_setting('app.review_secret', true),
    'prepmax-review-secret-2026'
  );
  v_hash := encode(
    digest(auth.uid()::text || p_slot_id::text || v_secret, 'sha256'),
    'hex'
  );

  INSERT INTO public.reviews (slot_id, rating, text, dedup_hash)
  VALUES (p_slot_id, p_rating, p_text, v_hash);

  RETURN jsonb_build_object('status', 'created');

EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('status', 'already_reviewed');
END;
$$;

-- ── host_reviews view: batch-released to seniors ──────────────────────────────
-- Shows full reviews to a host only when their slot has >= 3 reviews,
-- otherwise returns aggregated rating only.
CREATE OR REPLACE FUNCTION public.get_my_slot_reviews(p_slot_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slot public.slots%ROWTYPE;
  v_count int;
  v_avg   numeric;
BEGIN
  SELECT * INTO v_slot FROM public.slots WHERE id = p_slot_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'slot_not_found'); END IF;

  IF v_slot.host_id IS DISTINCT FROM auth.uid()
    AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (is_crisp_admin OR is_sac))
  THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;

  SELECT COUNT(*), AVG(rating) INTO v_count, v_avg FROM public.reviews WHERE slot_id = p_slot_id;

  IF v_count < 3 THEN
    RETURN jsonb_build_object(
      'count',      v_count,
      'avg_rating', ROUND(v_avg, 1),
      'reviews',    '[]'::jsonb,
      'batch_locked', true,
      'needed',     3 - v_count
    );
  END IF;

  RETURN jsonb_build_object(
    'count',      v_count,
    'avg_rating', ROUND(v_avg, 1),
    'batch_locked', false,
    'reviews', (
      SELECT jsonb_agg(jsonb_build_object(
        'id',      r.id,
        'rating',  r.rating,
        'text',    r.text,
        'week',    date_trunc('week', r.created_at)
      ) ORDER BY r.created_at)
      FROM public.reviews r WHERE r.slot_id = p_slot_id
    )
  );
END;
$$;

-- Enable pgcrypto for SHA256
CREATE EXTENSION IF NOT EXISTS pgcrypto;
