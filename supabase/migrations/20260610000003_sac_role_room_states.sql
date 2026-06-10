-- Migration 003: SAC role + room management unification
--
-- Changes:
-- 1. Add is_sac capability flag to profiles
-- 2. Add can_manage_rooms() SECURITY DEFINER helper (is_sac OR is_crisp_admin)
-- 3. Rewire room RLS policies to use can_manage_rooms() so both SAC and
--    CRISP admin can toggle/add/edit/delete rooms
-- 4. Add room_status view that surfaces offline / live-available / live-occupied
--    (occupied = room has a slot currently open/full/live) — used by hosting form in Phase 2

-- ── 1. New capability flag ───────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_sac boolean NOT NULL DEFAULT false;

-- ── 2. Room management helper ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.can_manage_rooms()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT p.is_sac OR p.is_crisp_admin
     FROM public.profiles p
     WHERE p.id = auth.uid()),
    false
  )
$$;

-- ── 3. Update room RLS to use can_manage_rooms() ─────────────────────────────

-- Re-open read policy: keep is_live check, just update admin path
DROP POLICY IF EXISTS "rooms_read"         ON public.rooms;
DROP POLICY IF EXISTS "rooms_crisp_insert" ON public.rooms;
DROP POLICY IF EXISTS "rooms_crisp_update" ON public.rooms;
DROP POLICY IF EXISTS "rooms_crisp_delete" ON public.rooms;

CREATE POLICY "rooms_read"
  ON public.rooms FOR SELECT
  USING (is_live = true OR public.can_manage_rooms());

CREATE POLICY "rooms_insert"
  ON public.rooms FOR INSERT
  WITH CHECK (public.can_manage_rooms());

CREATE POLICY "rooms_update"
  ON public.rooms FOR UPDATE
  USING (public.can_manage_rooms());

CREATE POLICY "rooms_delete"
  ON public.rooms FOR DELETE
  USING (public.can_manage_rooms());

-- ── 4. room_status view ───────────────────────────────────────────────────────
-- Exposes three states for every room:
--   offline          is_live = false
--   live_available   is_live = true, no active slot right now
--   live_occupied    is_live = true, has a slot with status in (open, full, live)
--                    whose time window overlaps now
-- Used by the hosting form (Phase 2) so seniors can see at a glance which
-- rooms are actually free before booking.

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

-- Note: the slots table doesn't exist yet (Phase 2).
-- The view will compile fine once migration 004 creates it.
-- Until then, the CASE always resolves to offline/live_available.
