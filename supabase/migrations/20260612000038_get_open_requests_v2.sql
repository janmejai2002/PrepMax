-- Migration 038: expose function_tag + interviewer_count in get_open_requests
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
        sr.function_tag,
        sr.interviewer_count,
        sr.confirmed_count,
        COUNT(i.id)::int AS interest_count,
        EXISTS (
          SELECT 1 FROM public.interests i2
          WHERE i2.request_id = sr.id AND i2.senior_id = v_uid
        ) AS i_am_interested
      FROM public.slot_requests sr
      LEFT JOIN public.interests i ON i.request_id = sr.id
      WHERE sr.status = 'open'
        AND sr.preferred_at > now() - interval '1 hour'
      GROUP BY sr.id
      ORDER BY sr.created_at DESC
    ) t
  );
END;
$$;
