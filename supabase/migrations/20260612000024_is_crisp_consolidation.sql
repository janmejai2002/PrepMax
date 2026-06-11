-- Migration 024: Consolidate is_mentor + is_crisp_member + is_crisp_admin + is_committee → is_crisp
--
-- Before: 4 overlapping flags (mentor, crisp_member, crisp_admin, committee)
-- After:  1 flag (is_crisp = true means "CRISP-committee member", full senior access + monitoring)
--
-- SAC keeps is_sac only. GD/PI hosting stays as can_host_gd / can_host_pi.

-- ── 1. Add the new flag ────────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN is_crisp boolean NOT NULL DEFAULT false;

-- ── 2. Migrate existing data ───────────────────────────────────────────────────
UPDATE public.profiles
SET is_crisp = (is_mentor OR is_crisp_member OR is_crisp_admin OR is_committee);

-- ── 3. Update helper functions that reference old columns ─────────────────────

-- is_crisp_admin() is used by rooms RLS + profile policies — rename semantics to is_crisp
CREATE OR REPLACE FUNCTION public.is_crisp_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT p.is_crisp FROM public.profiles p WHERE p.id = auth.uid()),
    false
  )
$$;

-- get_capability_flags() is used by profiles_update_own_basic policy
CREATE OR REPLACE FUNCTION public.get_capability_flags(p_user_id uuid)
RETURNS TABLE(
  can_host_gd boolean,
  can_host_pi boolean,
  is_crisp    boolean,
  is_sac      boolean
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT p.can_host_gd, p.can_host_pi, p.is_crisp, p.is_sac
  FROM public.profiles p
  WHERE p.id = p_user_id
$$;

-- ── 4. Recreate profiles RLS policies (drop old ones referencing old columns) ──
DROP POLICY IF EXISTS "profiles_update_own_basic" ON public.profiles;
DROP POLICY IF EXISTS "profiles_crisp_read_all"   ON public.profiles;
DROP POLICY IF EXISTS "profiles_crisp_update_all" ON public.profiles;

-- Users can update their own profile but cannot escalate their own capabilities
CREATE POLICY "profiles_update_own_basic"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND can_host_gd = (SELECT f.can_host_gd FROM public.get_capability_flags(auth.uid()) f)
    AND can_host_pi = (SELECT f.can_host_pi FROM public.get_capability_flags(auth.uid()) f)
    AND is_crisp    = (SELECT f.is_crisp    FROM public.get_capability_flags(auth.uid()) f)
    AND is_sac      = (SELECT f.is_sac      FROM public.get_capability_flags(auth.uid()) f)
  );

-- CRISP members and admins can read all profiles
CREATE POLICY "profiles_crisp_read_all"
  ON public.profiles FOR SELECT
  USING (public.is_crisp_admin());

-- CRISP members can update all profiles (for role management)
CREATE POLICY "profiles_crisp_update_all"
  ON public.profiles FOR UPDATE
  USING (public.is_crisp_admin());

-- ── 5. Recreate mentor_directory view using is_crisp ──────────────────────────
DROP VIEW IF EXISTS public.mentor_directory;

CREATE OR REPLACE VIEW public.mentor_directory
WITH (security_invoker = off) AS
SELECT
  p.id,
  p.name,
  p.year
FROM public.profiles p
WHERE p.is_crisp;

REVOKE ALL ON public.mentor_directory FROM anon, public;
GRANT SELECT ON public.mentor_directory TO authenticated;

-- ── 6. Update can_manage_rooms() ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.can_manage_rooms()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_crisp OR is_sac FROM public.profiles WHERE id = auth.uid()),
    false
  )
$$;

-- ── 7. join_slot v5: use is_crisp instead of old flags ────────────────────────
CREATE OR REPLACE FUNCTION public.join_slot(p_slot_id uuid, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slot          public.slots%ROWTYPE;
  v_caller        public.profiles%ROWTYPE;
  v_existing      public.enrollments%ROWTYPE;
  v_enroll_status text;
  v_position      int;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;

  SELECT * INTO v_caller FROM public.profiles WHERE id = p_user_id;

  -- Seniors (hosts) are judges/evaluators, not participants
  IF v_caller.can_host_gd OR v_caller.can_host_pi THEN
    RETURN jsonb_build_object('error', 'seniors_cannot_join');
  END IF;

  -- CRISP members and SAC cannot join as participants
  IF v_caller.is_sac OR v_caller.is_crisp THEN
    RETURN jsonb_build_object('error', 'seniors_cannot_join');
  END IF;

  SELECT * INTO v_slot
  FROM public.slots
  WHERE id = p_slot_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'slot_not_found');
  END IF;

  IF v_slot.status NOT IN ('open', 'full') THEN
    RETURN jsonb_build_object('error', 'slot_not_joinable', 'slot_status', v_slot.status);
  END IF;

  IF v_slot.confirmed_at IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'lineup_confirmed');
  END IF;

  -- Block juniors with an overlapping confirmed enrollment
  IF EXISTS (
    SELECT 1
    FROM public.enrollments e
    JOIN public.slots s ON s.id = e.slot_id
    WHERE e.user_id    = p_user_id
      AND e.status     = 'confirmed'
      AND e.slot_id   != p_slot_id
      AND s.start_at   < v_slot.end_at
      AND s.end_at     > v_slot.start_at
  ) THEN
    RETURN jsonb_build_object('error', 'time_conflict');
  END IF;

  SELECT * INTO v_existing
  FROM public.enrollments
  WHERE slot_id = p_slot_id AND user_id = p_user_id;

  IF FOUND THEN
    IF v_existing.status IN ('confirmed', 'waitlisted') THEN
      RETURN jsonb_build_object(
        'status',   v_existing.status,
        'position', v_existing.position,
        'idempotent', true
      );
    END IF;
    UPDATE public.enrollments
    SET status = CASE WHEN v_slot.enrolled_count < v_slot.capacity THEN 'confirmed' ELSE 'waitlisted' END,
        updated_at = now()
    WHERE slot_id = p_slot_id AND user_id = p_user_id
    RETURNING status, position INTO v_enroll_status, v_position;
  ELSE
    IF v_slot.enrolled_count < v_slot.capacity THEN
      v_enroll_status := 'confirmed';
      INSERT INTO public.enrollments (slot_id, user_id, status)
      VALUES (p_slot_id, p_user_id, 'confirmed')
      RETURNING position INTO v_position;
    ELSE
      v_enroll_status := 'waitlisted';
      INSERT INTO public.enrollments (slot_id, user_id, status)
      VALUES (p_slot_id, p_user_id, 'waitlisted')
      RETURNING position INTO v_position;
    END IF;
  END IF;

  IF v_enroll_status = 'confirmed' THEN
    UPDATE public.slots
    SET enrolled_count = enrolled_count + 1,
        status = CASE WHEN enrolled_count + 1 >= capacity THEN 'full' ELSE 'open' END,
        version = version + 1
    WHERE id = p_slot_id;
  END IF;

  RETURN jsonb_build_object('status', v_enroll_status, 'position', v_position);
END;
$$;

-- ── 8. get_all_juniors: check is_crisp ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_all_juniors()
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

  IF NOT (SELECT is_crisp FROM public.profiles WHERE id = v_uid) THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;

  RETURN jsonb_build_object(
    'juniors', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'id',        p.id,
          'name',      p.name,
          'email',     p.email,
          'batch',     p.batch,
          'section',   p.section,
          'mentor_id', p.mentor_id
        ) ORDER BY p.name
      ), '[]'::jsonb)
      FROM public.profiles p
      WHERE p.year = 'first'
    )
  );
END;
$$;

-- ── 9. assign_mentee: check is_crisp ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.assign_mentee(p_junior_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_caller public.profiles%ROWTYPE;
  v_junior public.profiles%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;

  SELECT * INTO v_caller FROM public.profiles WHERE id = v_uid;
  IF NOT v_caller.is_crisp THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;

  IF (SELECT count(*) FROM public.profiles WHERE mentor_id = v_uid) >= 30 THEN
    RETURN jsonb_build_object('error', 'mentor_limit_reached');
  END IF;

  SELECT * INTO v_junior FROM public.profiles WHERE id = p_junior_id AND year = 'first';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'junior_not_found');
  END IF;

  UPDATE public.profiles SET mentor_id = v_uid WHERE id = p_junior_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ── 10. unassign_mentee: check is_crisp ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.unassign_mentee(p_junior_id uuid)
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

  IF NOT (SELECT is_crisp FROM public.profiles WHERE id = v_uid) THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;

  UPDATE public.profiles
  SET mentor_id = NULL
  WHERE id = p_junior_id AND mentor_id = v_uid;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ── 11. create_knowledge_post: check is_crisp OR is_sac ──────────────────────
CREATE OR REPLACE FUNCTION public.create_knowledge_post(
  p_title        text,
  p_body         text,
  p_tags         text[]   DEFAULT '{}',
  p_function_tag text     DEFAULT NULL,
  p_is_pinned    bool     DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_post_id uuid;
BEGIN
  SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid();
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'unauthorized'); END IF;
  IF NOT (v_profile.is_crisp OR v_profile.is_sac) THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;

  INSERT INTO public.knowledge_posts (author_id, title, body, tags, function_tag, is_pinned)
  VALUES (auth.uid(), p_title, p_body, p_tags, p_function_tag, p_is_pinned)
  RETURNING id INTO v_post_id;

  RETURN jsonb_build_object('id', v_post_id, 'status', 'created');
END;
$$;

-- ── 12. Update knowledge_posts RLS policies ───────────────────────────────────
DROP POLICY IF EXISTS "knowledge_posts_insert" ON public.knowledge_posts;
DROP POLICY IF EXISTS "knowledge_posts_update" ON public.knowledge_posts;
DROP POLICY IF EXISTS "knowledge_posts_delete" ON public.knowledge_posts;

CREATE POLICY "knowledge_posts_insert" ON public.knowledge_posts
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = author_id
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND (is_crisp OR is_sac)
    )
  );

CREATE POLICY "knowledge_posts_update" ON public.knowledge_posts
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = author_id
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (is_crisp OR is_sac))
  );

CREATE POLICY "knowledge_posts_delete" ON public.knowledge_posts
  FOR DELETE TO authenticated
  USING (
    auth.uid() = author_id
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (is_crisp OR is_sac))
  );

-- ── 13. Update doubts RLS policy ──────────────────────────────────────────────
DROP POLICY IF EXISTS "doubts_update_own" ON public.doubts;

CREATE POLICY "doubts_update_own" ON public.doubts
  FOR UPDATE TO authenticated
  USING (auth.uid() = author_id OR EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (is_crisp OR is_sac)
  ));

-- ── 14. Drop old role columns ─────────────────────────────────────────────────
ALTER TABLE public.profiles DROP COLUMN is_mentor;
ALTER TABLE public.profiles DROP COLUMN is_crisp_member;
ALTER TABLE public.profiles DROP COLUMN is_crisp_admin;
ALTER TABLE public.profiles DROP COLUMN is_committee;
