-- Migration 001: profiles + rooms tables with RLS
-- PrepMax Phase 1

-- ==================== PROFILES ====================

CREATE TABLE IF NOT EXISTS public.profiles (
  id             uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name           text        NOT NULL,
  email          text        NOT NULL UNIQUE,
  phone          text,
  whatsapp       text,
  year           text        NOT NULL CHECK (year IN ('first', 'second')),
  batch          text,
  section        text,
  roll           text,
  avatar_url     text,
  -- capability flags (only service role / crisp admin may change these)
  can_host_gd    boolean     NOT NULL DEFAULT false,
  can_host_pi    boolean     NOT NULL DEFAULT false,
  is_mentor      boolean     NOT NULL DEFAULT false,
  is_committee   boolean     NOT NULL DEFAULT false,
  is_crisp_admin boolean     NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- ==================== ROOMS ====================

CREATE TABLE IF NOT EXISTS public.rooms (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL UNIQUE,
  location   text,
  capacity   integer     NOT NULL DEFAULT 20,
  is_live    boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ==================== UPDATED_AT TRIGGER ====================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER rooms_updated_at
  BEFORE UPDATE ON public.rooms
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ==================== RLS: PROFILES ====================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Own profile: read
CREATE POLICY "profiles_read_own"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

-- CRISP admin: read all
CREATE POLICY "profiles_crisp_read_all"
  ON public.profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.is_crisp_admin = true
    )
  );

-- Own profile: insert (onboarding)
CREATE POLICY "profiles_insert_own"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Own profile: update basic fields only — capability flags must not change
CREATE POLICY "profiles_update_own_basic"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND can_host_gd    = (SELECT can_host_gd    FROM public.profiles WHERE id = auth.uid())
    AND can_host_pi    = (SELECT can_host_pi    FROM public.profiles WHERE id = auth.uid())
    AND is_mentor      = (SELECT is_mentor      FROM public.profiles WHERE id = auth.uid())
    AND is_committee   = (SELECT is_committee   FROM public.profiles WHERE id = auth.uid())
    AND is_crisp_admin = (SELECT is_crisp_admin FROM public.profiles WHERE id = auth.uid())
  );

-- CRISP admin: update any profile (including flags)
CREATE POLICY "profiles_crisp_update_all"
  ON public.profiles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.is_crisp_admin = true
    )
  );

-- ==================== RLS: ROOMS ====================

ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

-- Read: authenticated users see live rooms; CRISP admin sees all
CREATE POLICY "rooms_read"
  ON public.rooms FOR SELECT
  USING (
    is_live = true
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.is_crisp_admin = true
    )
  );

-- CRISP admin: insert
CREATE POLICY "rooms_crisp_insert"
  ON public.rooms FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.is_crisp_admin = true
    )
  );

-- CRISP admin: update (is_live toggle + edits)
CREATE POLICY "rooms_crisp_update"
  ON public.rooms FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.is_crisp_admin = true
    )
  );

-- CRISP admin: delete
CREATE POLICY "rooms_crisp_delete"
  ON public.rooms FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.is_crisp_admin = true
    )
  );
