-- Migration 005: host_directory view + realtime on slots
--
-- Problem: profiles RLS is self-read-only (+ CRISP reads all), so juniors
-- browsing the feed cannot see host names. We expose ONLY the public-safe
-- fields of users who can host, via a view that runs with owner rights
-- (security_invoker = off → bypasses profiles RLS by design).
--
-- whatsapp is included deliberately: the post-join WhatsApp deep link is a
-- core product flow (spec B6). Only hosting-capable users are listed.

CREATE OR REPLACE VIEW public.host_directory
WITH (security_invoker = off) AS
SELECT
  p.id,
  p.name,
  p.year,
  p.whatsapp,
  p.can_host_gd,
  p.can_host_pi
FROM public.profiles p
WHERE p.can_host_gd OR p.can_host_pi OR p.is_crisp_admin;

-- Views aren't covered by RLS; restrict access explicitly.
REVOKE ALL ON public.host_directory FROM anon, public;
GRANT SELECT ON public.host_directory TO authenticated;

-- Realtime: broadcast slot-row changes (seat counts) to browsing phones.
ALTER PUBLICATION supabase_realtime ADD TABLE public.slots;
