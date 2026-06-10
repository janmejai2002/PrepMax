# PrepMax — Living State Document

> **Update this at the end of every session.** This file is what makes multi-session vibe coding work.

---

## Current Phase
**Phase 2 — Crown Jewel — IN PROGRESS. join_slot RPC + slots feed UI done; leave/cancel/edit RPCs + hosting form + /stress remaining.**

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
| Middleware | ✅ Done | Auth guard on all routes; domain enforcement |
| /onboarding | ✅ Done | Name/phone/whatsapp/year/batch/section/roll → upsert → home |
| /admin/rooms | ✅ Done | CRISP-admin-only; list rooms; toggle is_live; add room |
| Vercel deploy | ✅ Done | https://prep-max-alpha.vercel.app |
| Vercel env vars | ✅ Done | NEXT_PUBLIC_SUPABASE_URL, ANON_KEY, ALLOWED_EXCEPTION_EMAILS, SERVICE_ROLE_KEY |
| GitHub repo | ✅ Done | https://github.com/janmejai2002/PrepMax — preview deploys on every push |
| Migration 004 | ✅ Done | slots + slot_judges + enrollments + room_status view + join_slot RPC — applied |
| Migration 005 | ✅ Done | host_directory view (public host info for feed) + slots in realtime publication — applied |
| join_slot RPC | ✅ Done | Atomic SELECT…FOR UPDATE; 8/8 Vitest tests (15/15 total) |
| Slots feed UI | ✅ Done | Home page: GD/PI cards, search, All/GD/PI filter, join + waitlist, WhatsApp deep link, realtime seat counts, skeletons, empty states. Verified at 390px with Playwright incl. live join + waitlist + realtime test |
| Design tokens | ✅ Done | GD=indigo, PI=amber, success/warn, tinted dark palette, pulse-dot animation — in globals.css |
| Bottom tab bar | ✅ Done | Slots/Knowledge/Doubts/Profile (+Admin for CRISP/SAC), glassy blur, safe-area aware |
| Stub pages | ✅ Done | /knowledge, /doubts (coming-soon), /profile (real data + sign out) |
| Demo slots | ✅ Done | 7 seeded slots (4 GD + 3 PI), varied fill states, clean IST evening times |
| Supabase Site URL | ✅ Done | Fixed by Janmejai — Vercel magic links no longer redirect to localhost |

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
- **Middleware deprecation warning** at build time: `"middleware" file convention is deprecated, use "proxy" instead` — this is a Next.js 16 cosmetic warning only; routing works correctly. Will rename to `proxy.ts` in Phase 2 if it becomes a blocker.
- **Seed counter display bug**: `seed.ts` logs "0 fake profiles seeded" due to a closure quirk in parallel batches, but all 202 rows are confirmed in the DB. Non-blocking.

## Exact Next Step for Claude — Phase 2 (remaining)
1. Build hosting form — sheet/drawer for capable seniors; uses `room_status` view (offline/live-available/live-occupied per room); add co-judges.
2. Implement `leave_slot` (auto-promote waitlist head atomically), `cancel_slot`, `edit_slot` (optimistic lock on version) RPCs + tests.
3. Run `/stress` load test: 100 concurrent joins on a 6-seat slot → exactly 6 confirmed, 94 waitlisted in order, 0 oversell.
4. Rename `middleware.ts` → `proxy.ts` (Next.js 16 convention) if it causes warnings in prod.
5. Nice-to-have: slot detail view, "My slots" section/tab showing joined + waitlisted slots.

## Session Log
| Date | What happened |
|---|---|
| 2026-06-10 | Session 0: full bootstrap. Next.js 16 + shadcn + Vitest + Playwright + GitHub repo. |
| 2026-06-10 | Session 1: Supabase MCP auth. GitHub MCP (user scope). Version lock confirmed. Phase 0 → 100%. |
| 2026-06-10 | Session 2 (Phase 1): Supabase project created (Mumbai). Migrations 001+002 applied. Auth flow (Google + magic link, domain-restricted). /onboarding, /admin/rooms. 202 seed rows. 6/6 RLS tests passing. Vercel live at https://prep-max-alpha.vercel.app. |
| 2026-06-10 | Session 3: Edit room feature added to /admin/rooms. SAC role + room 3-state model designed. Migration 003 written (is_sac, can_manage_rooms, room_status view) — awaits apply. DECISIONS.md updated with SAC, 3-state model, CRISP clarification. |
| 2026-06-10 | Session 4: Migration 003 applied (is_sac + can_manage_rooms + rewired room RLS). room_status view deferred to 004 (needs slots). b25349 seeded with is_sac=true. RLS tests 7/7. Phase 2 slots work begins. |
| 2026-06-10 | Session 4 (cont.): Migration 004 (slots/enrollments/join_slot) + 005 (host_directory + realtime). 15/15 tests. Playwright UI audit found Supabase Site URL bug (localhost redirect) — Janmejai fixed in dashboard. **Slots feed UI shipped**: premium dark design, GD-indigo/PI-amber tokens, search + filter, join/waitlist flows verified live in browser, realtime seat counts confirmed, bottom tab bar, profile page, stub tabs. 7 demo slots seeded. |
