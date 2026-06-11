# PrepMax — Living State Document

> **Update this at the end of every session.** This file is what makes multi-session vibe coding work.

---

## Current Phase
**Phase 2 — Crown Jewel — IN PROGRESS. All seat RPCs done (join/leave/cancel/edit) + slots feed UI + hosting form + UI wiring + /stress PASSED. Remaining: proxy.ts rename + nice-to-haves.**

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
| Migration 001 | ✅ Done | profiles + rooms tables |
| Migration 002 | ✅ Done | RLS recursion fix — SECURITY DEFINER helper functions |
| Migration 003 | ✅ Done | `is_sac` flag + `can_manage_rooms()` helper + room RLS rewired — applied. `room_status` view deferred to migration 004 (needs slots table) |
| RLS policies | ✅ Done | 9 policies; `is_crisp_admin()` + `get_capability_flags()` + `can_manage_rooms()` helpers |
| RLS tests | ✅ Done | 7/7 passing (`npm run test:rls`) — includes SAC room-management test |
| Supabase Auth | ⚠️ Partial | Magic link ready. Google OAuth needs Client ID/Secret in Supabase dashboard |
| Seed data | ✅ Done | 202 profiles (2 test + 200 Faker) · 5 rooms |
| /login page | ✅ Done | Google OAuth button + magic-link fallback |
| /auth/callback | ✅ Done | Domain check (astra.xlri.ac.in) + exception list + onboarding redirect |
| Proxy (was Middleware) | ✅ Done | `proxy.ts` (Next.js 16 convention); auth guard on all routes; domain enforcement |
| /onboarding | ✅ Done | Name/phone/whatsapp/year/batch/section/roll → upsert → home |
| /admin/rooms | ✅ Done | CRISP-admin-only; list rooms; toggle is_live; add room |
| Vercel deploy | ✅ Done | https://prep-max-alpha.vercel.app |
| Vercel env vars | ✅ Done | NEXT_PUBLIC_SUPABASE_URL, ANON_KEY, ALLOWED_EXCEPTION_EMAILS, SERVICE_ROLE_KEY |
| GitHub repo | ✅ Done | https://github.com/janmejai2002/PrepMax — preview deploys on every push |
| Migration 004 | ✅ Done | slots + slot_judges + enrollments + room_status view + join_slot RPC — applied |
| Migration 005 | ✅ Done | host_directory view (public host info for feed) + slots in realtime publication — applied |
| join_slot RPC | ✅ Done | Atomic SELECT…FOR UPDATE; 8/8 Vitest tests. Migration 006 added re-join-after-leave support (upsert reactivates cancelled rows) |
| Migration 006 | ✅ Done | `leave_slot` RPC (atomic seat release + waitlist auto-promotion) + `join_slot` re-join support — applied |
| leave_slot RPC | ✅ Done | Confirmed leaver promotes waitlist head atomically; no-waitlist frees seat (full→open); waitlist leaver closes queue; positions re-sequenced contiguous; idempotent/not_enrolled/unauthorized guards. 8/8 Vitest tests |
| Migration 007 | ✅ Done | `cancel_slot` + `edit_slot` RPCs — applied |
| cancel_slot RPC | ✅ Done | Host or `can_manage_rooms()` (SAC/CRISP) cancels whole slot; all active enrolments → cancelled; version bump; idempotent. 4/4 Vitest tests |
| edit_slot RPC | ✅ Done | Optimistic lock on `version` (stale → version_conflict, no write); patch any subset of fields; capacity raise auto-promotes waitlist heads; capacity < enrolled rejected; host/admin only. 5/5 Vitest tests (26/26 total) |
| Hosting form | ✅ Done | "Host a slot" FAB (capable seniors only) → mobile sheet: type GD/PI (capability-gated), topic, company, focus-area tags, room picker (shadcn Select, from `room_status`, offline rooms hidden), datetime, seats, GD format note, description, **co-judges multi-select** (from `host_directory`, self excluded). Inserts slot (RLS-guarded) + slot_judges, prepends to feed. Verified end-to-end at 390px with Playwright (slot + co-judge persisted in DB). `scripts/dev-session.ts` added to mint an authed session for headless Playwright runs. Room Select needs `items` value→label map on the root or the trigger shows the id. |
| Slots feed UI | ✅ Done | Home page: GD/PI cards, search, All/GD/PI filter, join + waitlist, WhatsApp deep link, realtime seat counts, skeletons, empty states. Verified at 390px with Playwright incl. live join + waitlist + realtime test |
| Design tokens | ✅ Done | GD=indigo, PI=amber, success/warn, tinted dark palette, pulse-dot animation — in globals.css |
| Bottom tab bar | ✅ Done | Slots/Knowledge/Doubts/Profile (+Admin for CRISP/SAC), glassy blur, safe-area aware |
| Stub pages | ✅ Done | /knowledge, /doubts (coming-soon), /profile (real data + sign out) |
| Demo slots | ✅ Done | 7 seeded slots (4 GD + 3 PI), varied fill states, clean IST evening times |
| Supabase Site URL | ✅ Done | Fixed by Janmejai — Vercel magic links no longer redirect to localhost |
| /stress load test | ✅ Done | `scripts/stress-test.ts`: 100 concurrent `join_slot` → exactly 6 confirmed, 94 waitlisted, 0 oversell, 0 duplicates, positions contiguous, slot→full. Race wall-time ~1s. All 10 assertions pass. Caches JWTs to `.tmp-stress-sessions.json` (gitignored) to dodge auth rate limit on reruns |

## Test accounts
| Email | Year | Flags | Purpose |
|---|---|---|---|
| `killgod.obsidian@gmail.com` | first | none | Junior test account |
| `b25349@astra.xlri.ac.in` | second | all ON (host GD/PI, mentor, committee, crisp_admin, **is_sac**) | Senior/admin test account |

## One action still needed from Janmejai
**Google OAuth** — to sign in with Google (not just magic link), add credentials to Supabase:
1. `console.cloud.google.com` → Credentials → OAuth 2.0 Client ID (Web)
2. Authorized redirect URI: `https://fzohmolumyfupffkbxug.supabase.co/auth/v1/callback`
   Also add: `https://prep-max-alpha.vercel.app/auth/callback` to Supabase's redirect allow-list
3. `supabase.com/dashboard/project/fzohmolumyfupffkbxug/auth/providers` → Enable Google → paste Client ID + Secret

Magic link works right now without any extra config.

## Known Issues / Logged Bugs
- ~~**Middleware deprecation warning**~~ — RESOLVED. Renamed `middleware.ts` → `proxy.ts` and the exported function `middleware` → `proxy` (Next.js 16 convention). Build is clean; route table shows `ƒ Proxy (Middleware)`. Runtime is nodejs-only (no edge), which is fine — we use no edge features.
- **Seed counter display bug**: `seed.ts` logs "0 fake profiles seeded" due to a closure quirk in parallel batches, but all 202 rows are confirmed in the DB. Non-blocking.

## Exact Next Step for Claude — Phase 2 (remaining)
All seat-management RPCs done (join/leave/cancel/edit, 26/26 tests) + hosting form + UI wiring (leave/cancel/edit) shipped & verified + `/stress` load test PASSED (zero oversell under 100 concurrent joins) + `proxy.ts` rename done (build clean). Remaining:
1. Nice-to-have: slot detail view, "My slots" section/tab showing joined + waitlisted slots.

## Session Log
| Date | What happened |
|---|---|
| 2026-06-10 | Session 0: full bootstrap. Next.js 16 + shadcn + Vitest + Playwright + GitHub repo. |
| 2026-06-10 | Session 1: Supabase MCP auth. GitHub MCP (user scope). Version lock confirmed. Phase 0 → 100%. |
| 2026-06-10 | Session 2 (Phase 1): Supabase project created (Mumbai). Migrations 001+002 applied. Auth flow (Google + magic link, domain-restricted). /onboarding, /admin/rooms. 202 seed rows. 6/6 RLS tests passing. Vercel live at https://prep-max-alpha.vercel.app. |
| 2026-06-10 | Session 3: Edit room feature added to /admin/rooms. SAC role + room 3-state model designed. Migration 003 written (is_sac, can_manage_rooms, room_status view) — awaits apply. DECISIONS.md updated with SAC, 3-state model, CRISP clarification. |
| 2026-06-10 | Session 4: Migration 003 applied (is_sac + can_manage_rooms + rewired room RLS). room_status view deferred to 004 (needs slots). b25349 seeded with is_sac=true. RLS tests 7/7. Phase 2 slots work begins. |
| 2026-06-10 | Session 4 (cont.): Migration 004 (slots/enrollments/join_slot) + 005 (host_directory + realtime). 15/15 tests. Playwright UI audit found Supabase Site URL bug (localhost redirect) — Janmejai fixed in dashboard. **Slots feed UI shipped**: premium dark design, GD-indigo/PI-amber tokens, search + filter, join/waitlist flows verified live in browser, realtime seat counts confirmed, bottom tab bar, profile page, stub tabs. 7 demo slots seeded. |
| 2026-06-11 | Session 5: Migration 006 — `leave_slot` RPC (atomic seat release + waitlist auto-promotion + contiguous position re-sequencing) and `join_slot` re-join-after-leave support (upsert reactivates cancelled rows). 8 new Vitest tests; suite 17/17 green. UI "Leave" action still to wire. |
| 2026-06-11 | Session 5 (cont.): Migration 007 — `cancel_slot` (host/admin cancels whole slot, all enrolments released, version bump) + `edit_slot` (optimistic version lock; capacity-raise auto-promotes waitlist; capacity-below-enrolled rejected). 9 new Vitest tests; suite 26/26 green. All seat RPCs complete. Next: hosting form + wiring leave/cancel/edit into the UI. |
| 2026-06-11 | Session 5 (cont.): **Hosting form shipped** — "Host a slot" FAB + mobile sheet (type/topic/company/tags/room/time/seats/format/description/co-judges). Inserts slot + slot_judges, prepends to feed. Verified end-to-end at 390px via Playwright (authed with new `scripts/dev-session.ts` helper); slot + co-judge confirmed in DB then cleaned up. Recorded UI-registry priority preference to memory (shadcn → Origin UI → Shadcnblocks → Magic UI → Charts; install via `npx shadcn add`). |
| 2026-06-11 | Session 6: **`/stress` load test PASSED** — 100 concurrent `join_slot` calls on a 6-seat slot → exactly 6 confirmed, 94 waitlisted, 0 oversell, 0 duplicates, contiguous positions, slot→full (race ~1s). Iron Rule #1 holds under load. Fixed latent bug in `scripts/stress-test.ts`: the burst+spacing+JWT-cache auth design described in the header comments was never wired in, so sign-ins tripped Supabase's auth rate limit; now caches JWTs to `.tmp-stress-sessions.json` (gitignored). |
