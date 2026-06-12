-- Migration 042: domain enforcement
--   • express_interest v4: domain gate (must have ≥1 domain set) + PI match
--   • create_slot: domain gate for regular hosts (CRISP/SAC exempt)

-- ── express_interest v4 ───────────────────────────────────────────────────────
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

  -- Decision 11: seniors (non-admin) must have at least one domain set.
  -- CRISP members are exempt (they may help across all domains).
  IF NOT v_prof.is_crisp AND v_prof.domain_1 IS NULL AND v_prof.domain_2 IS NULL THEN
    RETURN jsonb_build_object('error', 'no_domains_set');
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

  -- Decisions 5+6: enforce domain match for requests with a function_tag.
  -- GDs (no function_tag) are open to all. CRISP members bypass this check.
  IF v_req.function_tag IS NOT NULL AND NOT v_prof.is_crisp THEN
    IF (v_prof.domain_1 IS DISTINCT FROM v_req.function_tag)
       AND (v_prof.domain_2 IS DISTINCT FROM v_req.function_tag) THEN
      RETURN jsonb_build_object('error', 'domain_mismatch', 'function_tag', v_req.function_tag);
    END IF;
  END IF;

  INSERT INTO public.interests (request_id, senior_id)
  VALUES (p_request_id, v_uid)
  ON CONFLICT (request_id, senior_id) DO NOTHING;
  GET DIAGNOSTICS v_rows_affected = ROW_COUNT;

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
