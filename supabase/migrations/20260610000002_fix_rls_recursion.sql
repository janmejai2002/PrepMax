-- Migration 002: Fix infinite recursion in RLS policies
-- Root cause: policies that SELECT FROM profiles trigger the same policies → loop.
-- Fix: SECURITY DEFINER helper functions run as the owner (postgres), bypassing RLS.

-- Helper: is the current user a CRISP admin? (bypasses RLS — no recursion)
CREATE OR REPLACE FUNCTION public.is_crisp_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT p.is_crisp_admin FROM public.profiles p WHERE p.id = auth.uid()),
    false
  )
$$;

-- Helper: get capability flags for a user ID (bypasses RLS — no recursion)
CREATE OR REPLACE FUNCTION public.get_capability_flags(p_user_id uuid)
RETURNS TABLE(
  can_host_gd    boolean,
  can_host_pi    boolean,
  is_mentor      boolean,
  is_committee   boolean,
  is_crisp_admin boolean
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT p.can_host_gd, p.can_host_pi, p.is_mentor, p.is_committee, p.is_crisp_admin
  FROM public.profiles p
  WHERE p.id = p_user_id
$$;

-- ==================== FIX PROFILES POLICIES ====================

DROP POLICY IF EXISTS "profiles_crisp_read_all"     ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own_basic"    ON public.profiles;
DROP POLICY IF EXISTS "profiles_crisp_update_all"    ON public.profiles;

CREATE POLICY "profiles_crisp_read_all"
  ON public.profiles FOR SELECT
  USING (public.is_crisp_admin());

CREATE POLICY "profiles_update_own_basic"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND can_host_gd    = (SELECT f.can_host_gd    FROM public.get_capability_flags(auth.uid()) f)
    AND can_host_pi    = (SELECT f.can_host_pi    FROM public.get_capability_flags(auth.uid()) f)
    AND is_mentor      = (SELECT f.is_mentor      FROM public.get_capability_flags(auth.uid()) f)
    AND is_committee   = (SELECT f.is_committee   FROM public.get_capability_flags(auth.uid()) f)
    AND is_crisp_admin = (SELECT f.is_crisp_admin FROM public.get_capability_flags(auth.uid()) f)
  );

CREATE POLICY "profiles_crisp_update_all"
  ON public.profiles FOR UPDATE
  USING (public.is_crisp_admin());

-- ==================== FIX ROOMS POLICIES ====================

DROP POLICY IF EXISTS "rooms_read"         ON public.rooms;
DROP POLICY IF EXISTS "rooms_crisp_insert" ON public.rooms;
DROP POLICY IF EXISTS "rooms_crisp_update" ON public.rooms;
DROP POLICY IF EXISTS "rooms_crisp_delete" ON public.rooms;

CREATE POLICY "rooms_read"
  ON public.rooms FOR SELECT
  USING (is_live = true OR public.is_crisp_admin());

CREATE POLICY "rooms_crisp_insert"
  ON public.rooms FOR INSERT
  WITH CHECK (public.is_crisp_admin());

CREATE POLICY "rooms_crisp_update"
  ON public.rooms FOR UPDATE
  USING (public.is_crisp_admin());

CREATE POLICY "rooms_crisp_delete"
  ON public.rooms FOR DELETE
  USING (public.is_crisp_admin());
