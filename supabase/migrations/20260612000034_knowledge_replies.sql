-- Migration 034: knowledge threaded replies (max 2 levels)
CREATE TABLE IF NOT EXISTS knowledge_replies (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    UUID NOT NULL REFERENCES knowledge_posts(id) ON DELETE CASCADE,
  parent_id  UUID REFERENCES knowledge_replies(id) ON DELETE CASCADE,
  author_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  body       TEXT NOT NULL CHECK (length(trim(body)) >= 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS knowledge_replies_post_id_idx ON knowledge_replies(post_id);
CREATE INDEX IF NOT EXISTS knowledge_replies_parent_id_idx ON knowledge_replies(parent_id);

ALTER TABLE knowledge_replies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_read_replies" ON knowledge_replies
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth_create_reply" ON knowledge_replies
  FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid());

CREATE POLICY "delete_reply" ON knowledge_replies
  FOR DELETE TO authenticated
  USING (
    author_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM knowledge_posts kp
      JOIN   profiles pr ON pr.id = auth.uid()
      WHERE  kp.id = knowledge_replies.post_id
        AND  (pr.is_committee = true OR pr.is_crisp = true)
    )
  );

CREATE OR REPLACE FUNCTION add_knowledge_reply(
  p_post_id   UUID,
  p_parent_id UUID DEFAULT NULL,
  p_body      TEXT DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_reply_id UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM knowledge_posts WHERE id = p_post_id) THEN
    RETURN jsonb_build_object('error', 'Post not found');
  END IF;
  IF p_parent_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM knowledge_replies WHERE id = p_parent_id AND parent_id IS NOT NULL) THEN
      RETURN jsonb_build_object('error', 'Max reply depth (2) exceeded');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM knowledge_replies WHERE id = p_parent_id AND post_id = p_post_id) THEN
      RETURN jsonb_build_object('error', 'Parent reply not in this post');
    END IF;
  END IF;
  INSERT INTO knowledge_replies (post_id, parent_id, author_id, body)
  VALUES (p_post_id, p_parent_id, auth.uid(), trim(p_body))
  RETURNING id INTO v_reply_id;
  RETURN jsonb_build_object('ok', true, 'reply_id', v_reply_id);
END;
$$;

CREATE OR REPLACE FUNCTION get_post_replies(p_post_id UUID)
RETURNS TABLE (
  id          UUID,
  post_id     UUID,
  parent_id   UUID,
  author_id   UUID,
  author_name TEXT,
  author_year TEXT,
  body        TEXT,
  created_at  TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT
    r.id, r.post_id, r.parent_id, r.author_id,
    p.name AS author_name,
    p.year AS author_year,
    r.body, r.created_at
  FROM   knowledge_replies r
  JOIN   profiles p ON p.id = r.author_id
  WHERE  r.post_id = p_post_id
  ORDER  BY r.created_at ASC;
$$;
