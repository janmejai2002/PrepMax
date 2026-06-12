-- Migration 041: get_my_requests v2 — include interest.status per senior
-- so junior can see who is pending vs confirmed and can retract confirmations.
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
        sr.interviewer_count,
        sr.confirmed_count,
        sr.function_tag,
        COALESCE(
          (
            SELECT jsonb_agg(jsonb_build_object(
              'senior_id',    p.id,
              'name',         p.name,
              'whatsapp',     COALESCE(p.whatsapp, p.phone, ''),
              'phone',        COALESCE(p.phone, ''),
              'interested_at', i.created_at,
              'status',       COALESCE(i.status, 'pending')
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
