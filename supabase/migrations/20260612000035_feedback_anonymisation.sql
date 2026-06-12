-- Migration 035: feedback anonymisation
-- feedback table columns: id, slot_id, from_user_id, to_user_id, scores(jsonb), tags, notes, created_at
-- session_type derived from slots.type via JOIN

-- Junior-facing: own feedback with judge identity stripped
CREATE OR REPLACE FUNCTION get_my_feedback_anon()
RETURNS TABLE (
  id            UUID,
  slot_type     TEXT,
  slot_topic    TEXT,
  slot_start_at TIMESTAMPTZ,
  scores        JSONB,
  tags          TEXT[],
  notes         TEXT,
  created_at    TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT
    f.id,
    s.type     AS slot_type,
    s.topic    AS slot_topic,
    s.start_at AS slot_start_at,
    f.scores,
    f.tags,
    f.notes,
    f.created_at
  FROM   feedback f
  JOIN   slots s ON s.id = f.slot_id
  WHERE  f.to_user_id = auth.uid()
  ORDER  BY f.created_at DESC;
$$;

-- CRISP-facing: full feedback for a mentee with judge identity
CREATE OR REPLACE FUNCTION get_mentee_feedback_full(p_junior_id UUID)
RETURNS TABLE (
  id            UUID,
  slot_type     TEXT,
  slot_topic    TEXT,
  slot_start_at TIMESTAMPTZ,
  scores        JSONB,
  tags          TEXT[],
  notes         TEXT,
  from_user_id  UUID,
  judge_name    TEXT,
  created_at    TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_crisp = true) THEN
    RAISE EXCEPTION 'Forbidden: CRISP only';
  END IF;
  RETURN QUERY
  SELECT
    f.id,
    s.type     AS slot_type,
    s.topic    AS slot_topic,
    s.start_at AS slot_start_at,
    f.scores,
    f.tags,
    f.notes,
    f.from_user_id,
    p.name     AS judge_name,
    f.created_at
  FROM   feedback f
  JOIN   slots    s ON s.id = f.slot_id
  JOIN   profiles p ON p.id = f.from_user_id
  WHERE  f.to_user_id = p_junior_id
  ORDER  BY f.created_at DESC;
END;
$$;

-- Update view: remove from_user_id to protect judge identity for juniors
DROP VIEW IF EXISTS my_received_feedback;

CREATE VIEW my_received_feedback
WITH (security_invoker = on) AS
SELECT
  f.id,
  f.slot_id,
  f.to_user_id,
  f.scores,
  f.tags,
  f.notes,
  f.created_at,
  s.type     AS slot_type,
  s.topic    AS slot_topic,
  s.start_at AS slot_start_at,
  h.name     AS host_name
FROM feedback f
JOIN slots    s ON s.id = f.slot_id
JOIN profiles h ON h.id = s.host_id
WHERE f.to_user_id = auth.uid();

REVOKE ALL ON my_received_feedback FROM anon, public;
GRANT SELECT ON my_received_feedback TO authenticated;
