-- Migration 015: Analytics views — junior 360° profile + daily stats

-- ── junior_profile_360 view ───────────────────────────────────────────────────
-- Returns a rich summary for a given junior user.
-- Used by: mentor dashboard, CRISP admin drill-down.
-- Called as a SELECT with security_invoker; access controlled at app level.
CREATE OR REPLACE VIEW public.junior_profile_360 WITH (security_invoker = on) AS
SELECT
  p.id                                                         AS user_id,
  p.name,
  p.email,
  p.batch,
  p.section,
  p.roll,
  p.mentor_id,
  -- Slot participation
  COUNT(DISTINCT e.slot_id) FILTER (WHERE e.status IN ('confirmed','attended','no_show'))
                                                               AS slots_joined,
  COUNT(DISTINCT e.slot_id) FILTER (WHERE e.status = 'attended')
                                                               AS slots_attended,
  COUNT(DISTINCT e.slot_id) FILTER (WHERE e.status = 'no_show')
                                                               AS no_shows,
  -- Breakdown by type
  COUNT(DISTINCT s.id) FILTER (WHERE e.status = 'attended' AND s.type = 'GD')
                                                               AS gd_attended,
  COUNT(DISTINCT s.id) FILTER (WHERE e.status = 'attended' AND s.type = 'PI')
                                                               AS pi_attended,
  -- Feedback averages (from received feedback)
  ROUND(AVG((fb.scores->>'clarity')::numeric)     FILTER (WHERE fb.id IS NOT NULL), 1)
                                                               AS avg_clarity,
  ROUND(AVG((fb.scores->>'content')::numeric)     FILTER (WHERE fb.id IS NOT NULL), 1)
                                                               AS avg_content,
  ROUND(AVG((fb.scores->>'confidence')::numeric)  FILTER (WHERE fb.id IS NOT NULL), 1)
                                                               AS avg_confidence,
  ROUND(AVG((fb.scores->>'structure')::numeric)   FILTER (WHERE fb.id IS NOT NULL), 1)
                                                               AS avg_structure,
  COUNT(fb.id)                                                 AS feedback_count
FROM public.profiles p
LEFT JOIN public.enrollments  e  ON e.user_id  = p.id
LEFT JOIN public.slots        s  ON s.id       = e.slot_id
LEFT JOIN public.feedback     fb ON fb.to_user_id = p.id
WHERE p.year = 'first'
GROUP BY p.id;

-- ── daily_stats view ─────────────────────────────────────────────────────────
-- For CRISP admin dashboard: stats for today (IST).
CREATE OR REPLACE VIEW public.daily_stats WITH (security_invoker = on) AS
SELECT
  COUNT(DISTINCT s.id)                                           AS total_slots,
  COUNT(DISTINCT s.id) FILTER (WHERE s.status = 'completed')    AS completed_slots,
  COUNT(DISTINCT s.id) FILTER (WHERE s.status = 'cancelled')    AS cancelled_slots,
  COUNT(DISTINCT s.id) FILTER (WHERE s.status = 'live')         AS live_slots,
  COUNT(DISTINCT e.user_id) FILTER (WHERE e.status = 'attended') AS total_attendees,
  COUNT(DISTINCT e.user_id) FILTER (WHERE e.status = 'no_show')  AS total_no_shows,
  COUNT(DISTINCT s.host_id)                                      AS active_hosts
FROM public.slots s
LEFT JOIN public.enrollments e ON e.slot_id = s.id
WHERE s.start_at::date = (now() AT TIME ZONE 'Asia/Kolkata')::date;

-- ── room_now view ─────────────────────────────────────────────────────────────
-- Shows each room's current/next session status. Used for the Room-Now board.
CREATE OR REPLACE VIEW public.room_now WITH (security_invoker = on) AS
SELECT
  r.id          AS room_id,
  r.name        AS room_name,
  r.location,
  r.is_live,
  -- Current session (live right now)
  cs.id         AS current_slot_id,
  cs.type       AS current_type,
  cs.topic      AS current_topic,
  cp.name       AS current_host,
  cs.end_at     AS current_ends_at,
  -- Next session (open/full, starting in next 4 hours)
  ns.id         AS next_slot_id,
  ns.type       AS next_type,
  ns.topic      AS next_topic,
  np.name       AS next_host,
  ns.start_at   AS next_starts_at
FROM public.rooms r
LEFT JOIN LATERAL (
  SELECT s.*, p.name AS host_name
  FROM public.slots s JOIN public.profiles p ON p.id = s.host_id
  WHERE s.room_id = r.id AND s.status = 'live'
  ORDER BY s.start_at DESC LIMIT 1
) cs ON true
LEFT JOIN public.profiles cp ON cp.id = cs.host_id
LEFT JOIN LATERAL (
  SELECT s.*, p.name AS host_name
  FROM public.slots s JOIN public.profiles p ON p.id = s.host_id
  WHERE s.room_id = r.id AND s.status IN ('open','full')
    AND s.start_at > now() AND s.start_at < now() + INTERVAL '4 hours'
  ORDER BY s.start_at ASC LIMIT 1
) ns ON true
LEFT JOIN public.profiles np ON np.id = ns.host_id;
