# PrepMax — Living State Document

> **Update this at the end of every session.** This file is what makes multi-session vibe coding work.

---

## Current Phase
**Phase 6 — Complete + Attendance Hardened + Junior-Request Flow + Navigation Performance + Committee Gating + SAC Notify. All phases 1-6 shipped. 145/145 tests green.**

## Status

| Item | Status | Notes |
|---|---|---|
| CLAUDE.md | ✅ Done | Project root |
| docs/SPEC.md | ✅ Done | Permanent spec |
| docs/STATE.md | ✅ Done | This file |
| docs/DECISIONS.md | ✅ Done | 5 decisions logged incl. version lock |
| .mcp.json | ✅ Done | 4 servers (supabase, shadcn, playwright, context7) |
| Supabase project | ✅ Done | `fzohmolumyfupffkbxug` · ap-south-1 (Mumbai) |
| .env.local | ✅ Done | URL + anon key + service role key + exception emails |
| Migration 001-003 | ✅ Done | profiles + rooms + RLS + is_sac |
| Migration 004-007 | ✅ Done | slots + enrollments + join/leave/cancel/edit RPCs |
| Migration 008 | ✅ Done | mentor_id + confirmed_at + confirm_slot RPC |
| Migration 009 | ✅ Done | attendance_tokens + start_slot + rotate_token + check_in + finalize_slot |
| Migration 010 | ✅ Done | feedback table + submit_feedback RPC + my_received_feedback view |
| Migration 011 | ✅ Done | outbox + notification_log + updated join/leave/cancel/edit with outbox writes |
| Migration 012 | ✅ Done | knowledge_posts + create_knowledge_post RPC |
| Migration 013 | ✅ Done | doubts + doubt_answers + doubt_votes + post/answer/vote/accept RPCs + doubts_feed view |
| Migration 014 | ✅ Done | reviews table (NO user_id — Iron Rule #7), dedup_hash, batch release (≥3), submit_review + get_my_slot_reviews RPCs |
| Migration 015 | ✅ Done | junior_profile_360 view + daily_stats view + room_now view |
| Migration 016 | ✅ Done | BEFORE INSERT trigger: b25NNN → year=second (senior), b26NNN → year=first (junior) |
| Migration 017 | ✅ Done | bio field + is_crisp_member flag + year nullable (committee) + get_public_profile RPC + @xlri.ac.in trigger |
| Migration 018 | ✅ Done | Fix doubts_feed: LEFT JOIN replaces EXISTS subquery so i_voted serialises correctly in PostgREST |
| Migration 019 | ✅ Done | Attendance hardening: app_config (server-side HMAC key), used_checkin_tokens (replay prevention), generate_checkin_token, mark_attended_by_token, mark_attended_direct RPCs; check_in disabled |
| Migration 020 | ✅ Done | Fix pgcrypto search_path: add `extensions` to SET search_path so hmac/digest functions resolve |
| Migration 021 | ✅ Done | slot_requests + interests tables; 7 RPCs: create/cancel/express_interest/retract_interest/confirm_match/get_open_requests/get_my_requests |
| /profile/[id] | ✅ Done | Public profile page: juniors show stats, seniors show hosting stats + open slots with join links |
| /login | ✅ Done | Google OAuth + magic link |
| /onboarding | ✅ Done | Name/phone/whatsapp/year/batch/section/roll/mentor |
| /admin/rooms | ✅ Done | CRISP-admin-only room management |
| /admin/stats | ✅ Done | CRISP daily stats grid + Room-Now realtime board |
| /slots/[id] | ✅ Done | Full slot detail, join/leave/confirm/start/cancel, roster, review box |
| /cockpit/[slotId] | ✅ Done | Host cockpit: QR code, rotating tokens (55s), realtime attendance roster, feedback drawer |
| /checkin | ✅ Done | Now redirects to /myqr/[slotId] — self-check-in permanently disabled |
| /myqr/[slotId] | ✅ Done | Junior personal QR page: HMAC-signed token, 90s TTL, auto-rotates |
| /requests | ✅ Done | Senior-only anonymous practice request feed; "I'm available" toggle |
| /my-requests | ✅ Done | Junior request management: post request, see interested seniors, WhatsApp intro, confirm match |
| /profile | ✅ Done | Profile info + received feedback aggregates + per-session cards |
| /mentor | ✅ Done | Mentor dashboard: assigned juniors with 360° stats |
| /knowledge | ✅ Done | Committee-published prep content feed with function filters, expandable posts, post form |
| /doubts | ✅ Done | Q&A feed with upvotes, answers, accept answer, resolved filter, function filters |
| /s/[slug] | ✅ Done | Public share page with OG metadata for WhatsApp/iMessage previews |
| /dev-login | ✅ Done | Gated by ALLOW_DEV_LOGIN=true env flag (set in Vercel); live at https://prep-max-alpha.vercel.app/dev-login |
| Edge Function drain-notifications | ✅ Done | Drains outbox, sends via Resend, logs to notification_log |
| dev seed users | ✅ Done | 4 test accounts via `npx tsx scripts/seed-dev-users.ts` |
| Vercel deploy | ✅ Done | https://prep-max-alpha.vercel.app |
| GitHub repo | ✅ Done | https://github.com/janmejai2002/PrepMax |
| Tests | ✅ Done | 145/145 passing (13 new committee-gating tests; fileParallelism=false prevents auth rate-limit flakes) |
| lib/email-role.ts | ✅ Done | inferYearFromEmail + isCommitteeEmail + isSacEmail + isCrispEmail |
| Committee gating | ✅ Done | @xlri.ac.in accounts redirected from /, /requests, /my-requests, /doubts → /knowledge |
| SAC notify button | ✅ Done | "Notify CRISP" button on /admin/rooms (SAC-only); server action inserts outbox events for all is_committee members |
| BottomNav gating | ✅ Done | isCommittee prop: committee sees Knowledge+Profile only; committee admin adds Admin tab |
| lib/supabase/service.ts | ✅ Done | Service-role client for cached server queries (outside request scope) |
| Navigation perf | ✅ Done | loading.tsx on 8 routes + Promise.all parallel queries + knowledge 60s cache; ~5s→instant skeleton |

## Dev Test Credentials

Run `npx tsx scripts/seed-dev-users.ts` to create these accounts (idempotent).

| Email | Type | Password |
|---|---|---|
| `b26001@astra.xlri.ac.in` | Junior (first-year, no flags) | `PrepMax@dev1` |
| `b25001@astra.xlri.ac.in` | Senior (can host GD+PI, is_mentor) | `PrepMax@dev1` |
| `crisp@xlri.ac.in` | CRISP committee shared login (is_committee, year=null) | `PrepMax@dev1` |
| `sacdelhi@xlri.ac.in` | SAC shared login (is_committee + is_sac, year=null) | `PrepMax@dev1` |

Dev login URL (local): http://localhost:3000/dev-login
Dev login URL (prod): https://prep-max-alpha.vercel.app/dev-login (ALLOW_DEV_LOGIN=true set in Vercel)

## One action still needed from Janmejai

**Google OAuth** — to sign in with Google (not just magic link), add credentials to Supabase:
1. `console.cloud.google.com` → Credentials → OAuth 2.0 Client ID (Web)
2. Authorized redirect URI: `https://fzohmolumyfupffkbxug.supabase.co/auth/v1/callback`
   Also add: `https://prep-max-alpha.vercel.app/auth/callback` to Supabase's redirect allow-list
3. `supabase.com/dashboard/project/fzohmolumyfupffkbxug/auth/providers` → Enable Google → paste Client ID + Secret

**Resend email** — to send actual notification emails:
1. Create account at resend.com, add domain `prepmax.xlri.ac.in`
2. Get API key
3. Set `RESEND_API_KEY` in Supabase Edge Function secrets
4. Set `APP_URL=https://prep-max-alpha.vercel.app` in Edge Function secrets
5. Schedule `drain-notifications` Edge Function to run every minute (Supabase cron)

Magic link works right now without any extra config.

## Known Issues / Logged Bugs
- **Seed counter display bug**: `seed.ts` logs "0 fake profiles seeded" due to closure quirk — all 202 rows confirmed in DB. Non-blocking.
- **Supabase Auth rate limiting in tests**: `confirm_slot.test.ts` occasionally hits Supabase auth rate limit on CI — run with JWT caching like stress-test does if this becomes a problem.

## What's Complete (all phases)

**Phase 1** — Slot hosting + feed (hosting form, GD/PI cards, search/filter, realtime seat counts)
**Phase 2** — Joining + enrollment (join/waitlist/leave/cancel/edit/confirm, My Slots toggle, host Gmail invite)
**Phase 3** — Attendance + cockpit (QR tokens, rotating every 55s, check-in, finalize, live feedback drawer)
**Phase 4** — Comms loop (transactional outbox, Resend Edge Function, share page with OG metadata)
**Phase 5** — Knowledge + Doubts (committee feed with filters, Q&A with upvotes/answers/accept)
**Phase 6** — Reviews + Dashboards (anonymous reviews with k-anonymity, mentor 360° dashboard, CRISP stats, Room-Now board)

## Exact Next Step (open this at the start of the next session)

1. **Phone-based Playwright E2E** — run `/ship-check` (the canonical journey: host creates slot → junior joins under contention → QR check-in → finalized feedback on profile → review posted) at 390×844 viewport with Playwright. Fix any regressions found. This is the last formal gate before the app can go live with real users.
2. **Domain-based home redirect** — when SAC/CRISP logs in, redirect them straight to `/admin/rooms` or `/knowledge` instead of the slots feed (committee members don't need the junior GD/PI feed as their landing page). One `if (isCommittee) redirect(...)` in `app/page.tsx`.
3. **Phase 7 Hardening** (see SPEC.md Part D) — RLS audit, Lighthouse mobile pass, Sentry stub, RUNBOOK.md.

## Possible Future Enhancements (V2)
- No-show penalty: 24h booking cooldown after 2 no-shows in 7 days (config-flagged — data path already built)
- Review release: weekly batch cadence (currently N≥3)
- Push notifications (browser Push API or WhatsApp Business API)
- Calendar integration: auto-cancel/update invite when slot edited/cancelled
- Sentry error monitoring (add Sentry MCP when live with real users)

## Session Log
| Date | What happened |
|---|---|
| 2026-06-10 | Session 0: full bootstrap. Next.js 16 + shadcn + Vitest + Playwright + GitHub repo. |
| 2026-06-10 | Session 1: Supabase MCP auth. GitHub MCP. Phase 0 → 100%. |
| 2026-06-10 | Session 2 (Phase 1): Supabase project, migrations 001+002, auth flow, /onboarding, /admin/rooms, 202 seed rows, Vercel live. |
| 2026-06-10 | Session 3: Edit room feature. SAC role + room 3-state model. Migration 003 written. |
| 2026-06-10 | Session 4: Migration 003 applied. Phase 2 begins. Migration 004+005 (slots/enrollments/join_slot/host_directory). Slots feed UI shipped + verified Playwright. |
| 2026-06-11 | Session 5: Migrations 006+007 (leave_slot, cancel_slot, edit_slot). Hosting form shipped. /stress PASSED. |
| 2026-06-11 | Session 6: /stress load test 100-concurrent pass. Iron Rule #1 confirmed. |
| 2026-06-11 | Session 7: Migration 008 (confirm_slot). My Slots toggle + host Gmail invite + mentor field. 36/36 tests. |
| 2026-06-11 | Session 8: Phase 3 (attendance + cockpit) — migrations 009+010, slot detail view, cockpit with QR tokens, check-in page, feedback drawer, profile feedback section, dev-login. 58/58 tests. |
| 2026-06-11 | Session 9: Phase 4+5+6 — outbox/notifications (migration 011, Edge Function), share page, knowledge feed, doubts Q&A (migrations 012+013), anonymous reviews (014), analytics views (015), mentor dashboard, admin stats + Room-Now board. 58/58 tests. Product complete. |
| 2026-06-11 | Session 10: Email→role mapping. Migration 016 (BEFORE INSERT trigger). lib/email-role.ts. Onboarding form locks year for b25/b26 emails. Dev seed + dev-login updated to b25/b26 addresses. 63/63 tests. |
| 2026-06-11 | Session 11: A) 23 K+D integration tests — found + fixed doubts_feed i_voted bug (EXISTS→LEFT JOIN, migration 018). B) /profile/[id] public profile page (migration 017 get_public_profile RPC). C) Committee role model: year nullable, is_crisp_member flag, @xlri.ac.in trigger, isCommitteeEmail, crisp@/sacdelhi@ dev accounts. 93/93 tests. |
| 2026-06-11 | Session 12: Attendance hardening (migrations 019+020). THREAT MODEL: junior cannot self-check-in. NEW: generate_checkin_token (HMAC-SHA256, 90s TTL, per-junior) + mark_attended_by_token (host-only, HMAC verify + replay prevention) + mark_attended_direct (host taps roster). check_in() disabled. /myqr/[slotId] junior QR page. Cockpit "Mark present" buttons. 19 fraud-path tests. 112/112 tests. |
| 2026-06-11 | Session 13: Junior-request flow (migration 021). slot_requests + interests tables. 7 RPCs: create/cancel_slot_request, express/retract_interest, confirm_match, get_open_requests, get_my_requests. /requests senior feed (anonymous, "I'm available" toggle). /my-requests junior page (post form, interested seniors list, WhatsApp intro, confirm match). BottomNav updated with Requests tab (seniors→/requests, juniors→/my-requests). fileParallelism=false in vitest.config. 20 new tests. 132/132 tests. |
| 2026-06-11 | Session 14: Navigation perf. Root causes: no loading.tsx on 8 routes (blank white screen), serial Supabase waterfall queries (3× round-trips), knowledge posts re-fetched every request. Fixes: loading.tsx for 8 routes (skeleton appears <50ms), Promise.all parallel queries on 5 pages, unstable_cache(60s) on knowledge posts via service client. lib/supabase/service.ts. Before: ~5s blank screen. After: instant skeleton, data in ~1-2s. 132/132 tests green. |
| 2026-06-11 | Session 15: Committee gating audit + SAC notify. Gated /, /requests, /my-requests, /doubts from @xlri.ac.in accounts → redirect /knowledge. BottomNav isCommittee prop: committee sees Knowledge+Profile; +Admin tab for crisp_admin/sac. SAC "Notify CRISP" button on /admin/rooms (server action app/admin/rooms/actions.ts → outbox). Fixed pre-existing formatSlotTime(x,x) TS bug in profile/[id]. 13 new committee-gating unit tests. 145/145 tests. |
| 2026-06-11 | Session 16: Shareable test deployment. Mirrored b25349 flags → b25426 in Supabase (can_host_gd/pi, is_mentor, is_committee, is_crisp_admin, is_sac). Re-gated /dev-login behind ALLOW_DEV_LOGIN=true env flag (export const dynamic='force-dynamic' + .trim() for robustness). Fixed pre-existing onboarding-form zodResolver TS error (blocked Vercel build). Seeded 4 dev accounts against prod Supabase. Live: https://prep-max-alpha.vercel.app/dev-login. 145/145 tests. |
