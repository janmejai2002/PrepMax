-- Migration 013: Doubts Q&A (crowd-sourced peer learning)

-- ── doubts ────────────────────────────────────────────────────────────────────
CREATE TABLE public.doubts (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id    uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  question     text        NOT NULL CHECK (char_length(question) BETWEEN 5 AND 500),
  function_tag text,
  is_resolved  bool        NOT NULL DEFAULT false,
  vote_count   int         NOT NULL DEFAULT 0,
  answer_count int         NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX doubts_created_idx   ON public.doubts(created_at DESC);
CREATE INDEX doubts_votes_idx     ON public.doubts(vote_count DESC);
CREATE INDEX doubts_function_idx  ON public.doubts(function_tag) WHERE function_tag IS NOT NULL;

ALTER TABLE public.doubts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "doubts_select" ON public.doubts FOR SELECT TO authenticated USING (true);
CREATE POLICY "doubts_insert" ON public.doubts
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = author_id);
CREATE POLICY "doubts_update_own" ON public.doubts
  FOR UPDATE TO authenticated
  USING (auth.uid() = author_id OR EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (is_crisp_admin OR is_sac)
  ));

-- ── doubt_answers ─────────────────────────────────────────────────────────────
CREATE TABLE public.doubt_answers (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  doubt_id    uuid        NOT NULL REFERENCES public.doubts(id) ON DELETE CASCADE,
  author_id   uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  body        text        NOT NULL CHECK (char_length(body) >= 5),
  is_accepted bool        NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX doubt_answers_doubt_idx ON public.doubt_answers(doubt_id, created_at);

ALTER TABLE public.doubt_answers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "doubt_answers_select" ON public.doubt_answers FOR SELECT TO authenticated USING (true);
CREATE POLICY "doubt_answers_insert" ON public.doubt_answers
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = author_id);
CREATE POLICY "doubt_answers_update_own" ON public.doubt_answers
  FOR UPDATE TO authenticated
  USING (auth.uid() = author_id OR EXISTS (
    SELECT 1 FROM public.doubts WHERE id = doubt_id AND author_id = auth.uid()
  ));

-- ── doubt_votes ───────────────────────────────────────────────────────────────
CREATE TABLE public.doubt_votes (
  doubt_id uuid NOT NULL REFERENCES public.doubts(id) ON DELETE CASCADE,
  user_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  PRIMARY KEY (doubt_id, user_id)
);

ALTER TABLE public.doubt_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "doubt_votes_select" ON public.doubt_votes FOR SELECT TO authenticated USING (true);
CREATE POLICY "doubt_votes_insert" ON public.doubt_votes
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "doubt_votes_delete" ON public.doubt_votes
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ── RPCs ──────────────────────────────────────────────────────────────────────

-- post_doubt
CREATE OR REPLACE FUNCTION public.post_doubt(
  p_question     text,
  p_function_tag text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('error', 'unauthorized'); END IF;
  INSERT INTO public.doubts (author_id, question, function_tag)
  VALUES (auth.uid(), p_question, p_function_tag)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('id', v_id, 'status', 'created');
END;
$$;

-- post_answer
CREATE OR REPLACE FUNCTION public.post_answer(
  p_doubt_id uuid,
  p_body     text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('error', 'unauthorized'); END IF;
  IF NOT EXISTS (SELECT 1 FROM public.doubts WHERE id = p_doubt_id) THEN
    RETURN jsonb_build_object('error', 'doubt_not_found');
  END IF;

  INSERT INTO public.doubt_answers (doubt_id, author_id, body)
  VALUES (p_doubt_id, auth.uid(), p_body)
  RETURNING id INTO v_id;

  UPDATE public.doubts SET answer_count = answer_count + 1 WHERE id = p_doubt_id;

  RETURN jsonb_build_object('id', v_id, 'status', 'created');
END;
$$;

-- toggle_doubt_vote (upvote / un-upvote)
CREATE OR REPLACE FUNCTION public.toggle_doubt_vote(p_doubt_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existed bool;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('error', 'unauthorized'); END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.doubt_votes WHERE doubt_id = p_doubt_id AND user_id = auth.uid()
  ) INTO v_existed;

  IF v_existed THEN
    DELETE FROM public.doubt_votes WHERE doubt_id = p_doubt_id AND user_id = auth.uid();
    UPDATE public.doubts SET vote_count = GREATEST(vote_count - 1, 0) WHERE id = p_doubt_id;
    RETURN jsonb_build_object('voted', false);
  ELSE
    INSERT INTO public.doubt_votes (doubt_id, user_id) VALUES (p_doubt_id, auth.uid());
    UPDATE public.doubts SET vote_count = vote_count + 1 WHERE id = p_doubt_id;
    RETURN jsonb_build_object('voted', true);
  END IF;
END;
$$;

-- accept_answer (only the doubt's author can accept)
CREATE OR REPLACE FUNCTION public.accept_answer(p_answer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_answer public.doubt_answers%ROWTYPE;
  v_doubt  public.doubts%ROWTYPE;
BEGIN
  SELECT * INTO v_answer FROM public.doubt_answers WHERE id = p_answer_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'answer_not_found'); END IF;

  SELECT * INTO v_doubt FROM public.doubts WHERE id = v_answer.doubt_id;
  IF v_doubt.author_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;

  UPDATE public.doubt_answers SET is_accepted = false WHERE doubt_id = v_answer.doubt_id;
  UPDATE public.doubt_answers SET is_accepted = true  WHERE id = p_answer_id;
  UPDATE public.doubts SET is_resolved = true WHERE id = v_answer.doubt_id;

  RETURN jsonb_build_object('status', 'accepted');
END;
$$;

-- Helper view: doubts with vote status for current user
CREATE OR REPLACE VIEW public.doubts_feed AS
SELECT
  d.*,
  p.name AS author_name,
  EXISTS (
    SELECT 1 FROM public.doubt_votes v WHERE v.doubt_id = d.id AND v.user_id = auth.uid()
  ) AS i_voted
FROM public.doubts d
JOIN public.profiles p ON p.id = d.author_id;
