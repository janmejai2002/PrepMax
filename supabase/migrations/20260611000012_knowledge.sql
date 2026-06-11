-- Migration 012: Knowledge posts (committee-published prep content)

CREATE TABLE public.knowledge_posts (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id    uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  title        text        NOT NULL CHECK (char_length(title) BETWEEN 3 AND 200),
  body         text        NOT NULL CHECK (char_length(body) >= 10),
  tags         text[]      NOT NULL DEFAULT '{}',
  function_tag text,  -- NULL means 'All functions'
  is_pinned    bool        NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX knowledge_posts_created_idx   ON public.knowledge_posts(created_at DESC);
CREATE INDEX knowledge_posts_function_idx  ON public.knowledge_posts(function_tag) WHERE function_tag IS NOT NULL;
CREATE INDEX knowledge_posts_pinned_idx    ON public.knowledge_posts(is_pinned DESC, created_at DESC);

ALTER TABLE public.knowledge_posts ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read
CREATE POLICY "knowledge_posts_select" ON public.knowledge_posts
  FOR SELECT TO authenticated USING (true);

-- Only committee/admin can create/update/delete
CREATE POLICY "knowledge_posts_insert" ON public.knowledge_posts
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = author_id
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND (is_committee OR is_crisp_admin OR is_sac)
    )
  );

CREATE POLICY "knowledge_posts_update" ON public.knowledge_posts
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = author_id
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (is_crisp_admin OR is_sac))
  );

CREATE POLICY "knowledge_posts_delete" ON public.knowledge_posts
  FOR DELETE TO authenticated
  USING (
    auth.uid() = author_id
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (is_crisp_admin OR is_sac))
  );

-- RPC: create_knowledge_post (committee/admin only)
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
  IF NOT (v_profile.is_committee OR v_profile.is_crisp_admin OR v_profile.is_sac) THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;

  INSERT INTO public.knowledge_posts (author_id, title, body, tags, function_tag, is_pinned)
  VALUES (auth.uid(), p_title, p_body, p_tags, p_function_tag, p_is_pinned)
  RETURNING id INTO v_post_id;

  RETURN jsonb_build_object('id', v_post_id, 'status', 'created');
END;
$$;
