-- Migration 018: rewrite doubts_feed for reliable PostgREST serialisation
--
-- Root cause: EXISTS subquery in a view with security_invoker caused two issues:
--   1. security_invoker=true: JOIN profiles filtered out cross-user rows (profiles RLS)
--   2. security_invoker=false: boolean EXISTS not serialised by PostgREST in all cases
-- Fix: default security context (postgres, bypasses RLS for profiles JOIN) + LEFT JOIN
-- instead of EXISTS so i_voted is a proper nullable column, not a subquery expression.

DROP VIEW IF EXISTS public.doubts_feed;

CREATE VIEW public.doubts_feed AS
SELECT
  d.id,
  d.author_id,
  d.question,
  d.function_tag,
  d.is_resolved,
  d.vote_count,
  d.answer_count,
  d.created_at,
  p.name                       AS author_name,
  (dv.user_id IS NOT NULL)     AS i_voted
FROM public.doubts d
JOIN  public.profiles    p  ON p.id         = d.author_id
LEFT JOIN public.doubt_votes dv ON dv.doubt_id = d.id
                                AND dv.user_id  = auth.uid();

GRANT SELECT ON public.doubts_feed TO authenticated, anon;

NOTIFY pgrst, 'reload schema';
