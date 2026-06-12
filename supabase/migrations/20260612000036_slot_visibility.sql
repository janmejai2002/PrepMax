-- Migration 036: internal mentorship slot visibility
ALTER TABLE slots
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'public'
  CHECK (visibility IN ('public', 'mentees_only'));

COMMENT ON COLUMN slots.visibility IS
  'public = visible to all juniors; mentees_only = visible only to juniors whose mentor_id = host_id';

-- RPC: get open slots respecting visibility rules
DROP FUNCTION IF EXISTS get_open_slots(text);

CREATE OR REPLACE FUNCTION get_open_slots(
  p_type TEXT DEFAULT NULL
)
RETURNS TABLE (
  id             UUID,
  host_id        UUID,
  host_name      TEXT,
  host_year      TEXT,
  type           TEXT,
  room_id        UUID,
  room_name      TEXT,
  room_location  TEXT,
  capacity       INT,
  enrolled_count INT,
  start_at       TIMESTAMPTZ,
  visibility     TEXT,
  created_at     TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_mentor UUID;
BEGIN
  SELECT mentor_id INTO v_caller_mentor
  FROM   profiles WHERE id = auth.uid();

  RETURN QUERY
  SELECT
    s.id,
    s.host_id,
    p.name         AS host_name,
    p.year         AS host_year,
    s.type,
    s.room_id,
    r.name         AS room_name,
    r.location     AS room_location,
    s.capacity,
    s.enrolled_count,
    s.start_at,
    s.visibility,
    s.created_at
  FROM   slots s
  JOIN   profiles p ON p.id = s.host_id
  JOIN   rooms    r ON r.id = s.room_id
  WHERE  s.status IN ('open', 'full', 'live')
    AND  (p_type IS NULL OR s.type = p_type)
    AND  (
           s.visibility = 'public'
           OR (s.visibility = 'mentees_only' AND s.host_id = v_caller_mentor)
         )
  ORDER  BY s.start_at ASC;
END;
$$;
