-- Migration 021: slot_requests + interests
-- Junior-initiated anonymous practice requests; seniors browse and mark interest;
-- junior picks a senior → WhatsApp intro → confirm match.

-- ───────────────────────── SLOT REQUESTS ─────────────────────────

CREATE TABLE public.slot_requests (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  junior_id         uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  location          text        NOT NULL,       -- 'Common Room' | 'Library' | 'Nescafe Corner' | 'Other'
  preferred_at      timestamptz NOT NULL,       -- when the junior wants to practice
  background        text        NOT NULL,       -- anonymous background (junior writes, seniors see)
  description       text        NOT NULL,       -- what they want to practice / specific requirements
  status            text        NOT NULL DEFAULT 'open'
                                CHECK (status IN ('open', 'matched', 'cancelled')),
  matched_senior_id uuid        REFERENCES public.profiles(id),
  matched_at        timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.slot_requests ENABLE ROW LEVEL SECURITY;

-- Junior can read their own requests (full row, including junior_id)
CREATE POLICY "slot_requests_own_read"
  ON public.slot_requests FOR SELECT
  USING (auth.uid() = junior_id);

-- Junior can insert their own request
CREATE POLICY "slot_requests_own_insert"
  ON public.slot_requests FOR INSERT
  WITH CHECK (auth.uid() = junior_id);

-- ───────────────────────── INTERESTS ─────────────────────────────

CREATE TABLE public.interests (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id  uuid        NOT NULL REFERENCES public.slot_requests(id) ON DELETE CASCADE,
  senior_id   uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(request_id, senior_id)
);

ALTER TABLE public.interests ENABLE ROW LEVEL SECURITY;

-- Senior can read their own interests
CREATE POLICY "interests_own_read"
  ON public.interests FOR SELECT
  USING (auth.uid() = senior_id);

-- Senior can insert interest
CREATE POLICY "interests_own_insert"
  ON public.interests FOR INSERT
  WITH CHECK (auth.uid() = senior_id);

-- Senior can delete (retract) their own interest
CREATE POLICY "interests_own_delete"
  ON public.interests FOR DELETE
  USING (auth.uid() = senior_id);

-- ───────────────────────── RPCs ──────────────────────────────────

-- create_slot_request: any authenticated user (first-year) posts a request
CREATE OR REPLACE FUNCTION public.create_slot_request(
  p_location     text,
  p_preferred_at timestamptz,
  p_background   text,
  p_description  text
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

  INSERT INTO public.slot_requests (junior_id, location, preferred_at, background, description)
  VALUES (v_uid, p_location, p_preferred_at, p_background, p_description)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('id', v_id, 'status', 'open');
END;
$$;

-- cancel_slot_request: junior cancels their own open request
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

  UPDATE public.slot_requests SET status = 'cancelled' WHERE id = p_request_id;
  RETURN jsonb_build_object('status', 'cancelled');
END;
$$;

-- express_interest: senior marks interest in an open request
CREATE OR REPLACE FUNCTION public.express_interest(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_req public.slot_requests%ROWTYPE;
  v_prof public.profiles%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;

  SELECT * INTO v_prof FROM public.profiles WHERE id = v_uid;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;
  -- Must be a senior (can host) or committee
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

  RETURN jsonb_build_object('status', 'interested');
END;
$$;

-- retract_interest: senior removes their interest
CREATE OR REPLACE FUNCTION public.retract_interest(p_request_id uuid)
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

  DELETE FROM public.interests
  WHERE request_id = p_request_id AND senior_id = v_uid;

  RETURN jsonb_build_object('status', 'retracted');
END;
$$;

-- confirm_match: junior picks a specific senior → marks request as matched
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
  v_uid  uuid := auth.uid();
  v_req  public.slot_requests%ROWTYPE;
  v_sen  public.profiles%ROWTYPE;
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

  -- Verify that this senior actually expressed interest
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

  UPDATE public.slot_requests
  SET status = 'matched', matched_senior_id = p_senior_id, matched_at = now()
  WHERE id = p_request_id;

  RETURN jsonb_build_object(
    'status',          'matched',
    'senior_id',       p_senior_id,
    'senior_name',     v_sen.name,
    'senior_whatsapp', COALESCE(v_sen.whatsapp, v_sen.phone, ''),
    'senior_phone',    COALESCE(v_sen.phone, '')
  );
END;
$$;

-- get_open_requests: seniors browse open requests (junior identity hidden)
CREATE OR REPLACE FUNCTION public.get_open_requests()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_prof public.profiles%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;

  SELECT * INTO v_prof FROM public.profiles WHERE id = v_uid;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;

  RETURN (
    SELECT jsonb_agg(row_to_json(t))
    FROM (
      SELECT
        sr.id,
        sr.location,
        sr.preferred_at,
        sr.background,
        sr.description,
        sr.created_at,
        -- junior_id intentionally omitted (anonymous feed)
        COUNT(i.id)::int AS interest_count,
        EXISTS (
          SELECT 1 FROM public.interests i2
          WHERE i2.request_id = sr.id AND i2.senior_id = v_uid
        ) AS i_am_interested
      FROM public.slot_requests sr
      LEFT JOIN public.interests i ON i.request_id = sr.id
      WHERE sr.status = 'open'
        AND sr.preferred_at > now() - interval '1 hour'  -- not stale
      GROUP BY sr.id
      ORDER BY sr.created_at DESC
    ) t
  );
END;
$$;

-- get_my_requests: junior sees their requests + interested seniors
CREATE OR REPLACE FUNCTION public.get_my_requests()
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

  RETURN (
    SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.created_at DESC), '[]'::jsonb)
    FROM (
      SELECT
        sr.id,
        sr.location,
        sr.preferred_at,
        sr.background,
        sr.description,
        sr.status,
        sr.matched_senior_id,
        sr.matched_at,
        sr.created_at,
        -- Interested seniors with contact info revealed to the junior
        COALESCE(
          (
            SELECT jsonb_agg(jsonb_build_object(
              'senior_id',   p.id,
              'name',        p.name,
              'whatsapp',    COALESCE(p.whatsapp, p.phone, ''),
              'phone',       COALESCE(p.phone, ''),
              'interested_at', i.created_at
            ) ORDER BY i.created_at)
            FROM public.interests i
            JOIN public.profiles p ON p.id = i.senior_id
            WHERE i.request_id = sr.id
          ),
          '[]'::jsonb
        ) AS interested_seniors
      FROM public.slot_requests sr
      WHERE sr.junior_id = v_uid
    ) t
  );
END;
$$;

NOTIFY pgrst, 'reload schema';
