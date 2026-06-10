# PrepMax — Living State Document

> **Update this at the end of every session.** This file is what makes multi-session vibe coding work.

---

## Current Phase
**Phase 1 — Auth + Identity + Rooms — COMPLETE. Ready for Phase 2.**

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
| RLS policies | ✅ Done | 9 policies; `is_crisp_admin()` + `get_capability_flags()` helpers |
| RLS tests | ✅ Done | 6/6 passing (`npm run test:rls`) |
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

## Test accounts
| Email | Year | Flags | Purpose |
|---|---|---|---|
| `killgod.obsidian@gmail.com` | first | none | Junior test account |
| `b25349@astra.xlri.ac.in` | second | all ON (host GD/PI, mentor, committee, crisp_admin) | Senior/admin test account |

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

## Exact Next Step for Claude — Phase 2
1. Rename `middleware.ts` → `proxy.ts` (Next.js 16 convention) if it causes warnings in prod.
2. Create migration 003: `slots`, `enrollments`, `slot_judges` tables + RLS.
3. Implement `join_slot` atomic Postgres RPC (Iron Rule #1: SELECT...FOR UPDATE, no app-side read-write).
4. Build slots feed UI (home page): GD/PI cards, segmented filter, real-time seat counts via Supabase Realtime.
5. Build hosting form.
6. Run `/stress` load test: 100 concurrent joins on a 6-seat slot → exactly 6 confirmed, 94 waitlisted, 0 oversell.
7. Leave `leave_slot`, `cancel_slot`, `edit_slot` RPCs for Phase 2 as well.

## Session Log
| Date | What happened |
|---|---|
| 2026-06-10 | Session 0: full bootstrap. Next.js 16 + shadcn + Vitest + Playwright + GitHub repo. |
| 2026-06-10 | Session 1: Supabase MCP auth. GitHub MCP (user scope). Version lock confirmed. Phase 0 → 100%. |
| 2026-06-10 | Session 2 (Phase 1): Supabase project created (Mumbai). Migrations 001+002 applied. Auth flow (Google + magic link, domain-restricted). /onboarding, /admin/rooms. 202 seed rows. 6/6 RLS tests passing. Vercel live at https://prep-max-alpha.vercel.app. |
