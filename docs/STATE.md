# PrepMax — Living State Document

> **Update this at the end of every session.** This file is what makes multi-session vibe coding work.

---

## Current Phase
**Phase 6 — Complete. All phases 1-6 shipped. 58/58 tests green. Product is functionally complete.**

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
| /login | ✅ Done | Google OAuth + magic link |
| /onboarding | ✅ Done | Name/phone/whatsapp/year/batch/section/roll/mentor |
| /admin/rooms | ✅ Done | CRISP-admin-only room management |
| /admin/stats | ✅ Done | CRISP daily stats grid + Room-Now realtime board |
| /slots/[id] | ✅ Done | Full slot detail, join/leave/confirm/start/cancel, roster, review box |
| /cockpit/[slotId] | ✅ Done | Host cockpit: QR code, rotating tokens (55s), realtime attendance roster, feedback drawer |
| /checkin | ✅ Done | QR check-in landing page (attended/already/error states) |
| /profile | ✅ Done | Profile info + received feedback aggregates + per-session cards |
| /mentor | ✅ Done | Mentor dashboard: assigned juniors with 360° stats |
| /knowledge | ✅ Done | Committee-published prep content feed with function filters, expandable posts, post form |
| /doubts | ✅ Done | Q&A feed with upvotes, answers, accept answer, resolved filter, function filters |
| /s/[slug] | ✅ Done | Public share page with OG metadata for WhatsApp/iMessage previews |
| /dev-login | ✅ Done | Dev-only login page (disabled in production) |
| Edge Function drain-notifications | ✅ Done | Drains outbox, sends via Resend, logs to notification_log |
| dev seed users | ✅ Done | 4 test accounts via `npx tsx scripts/seed-dev-users.ts` |
| Vercel deploy | ✅ Done | https://prep-max-alpha.vercel.app |
| GitHub repo | ✅ Done | https://github.com/janmejai2002/PrepMax |
| Tests | ✅ Done | 58/58 passing |

## Dev Test Credentials

Run `npx tsx scripts/seed-dev-users.ts` to create these accounts (idempotent):

| Email | Type | Password |
|---|---|---|
| `dev.junior@astra.xlri.ac.in` | Junior (first-year, no flags) | `PrepMax@dev1` |
| `dev.senior@astra.xlri.ac.in` | Senior (can host GD+PI, is_mentor) | `PrepMax@dev1` |
| `dev.crisp@astra.xlri.ac.in` | CRISP Admin (all flags + is_crisp_admin) | `PrepMax@dev1` |
| `dev.sac@astra.xlri.ac.in` | SAC Admin (all flags + is_crisp_admin + is_sac) | `PrepMax@dev1` |

Dev login URL (local): http://localhost:3000/dev-login
Dev login URL (prod): N/A — disabled in production

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
