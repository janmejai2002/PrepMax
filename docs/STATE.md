# PrepMax — Living State Document

> **Update this at the end of every session.** This file is what makes multi-session vibe coding work.

---

## Current Phase
**Phase 8 v2 — ALL DONE. 163/163 Vitest. Migrations 030–039 applied. E2E tests updated. Pushed. Live: https://prep-max-alpha.vercel.app. Awaiting user action: activate Resend email + onboard real users.**

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
| /cockpit/[slotId] | ✅ Done | Host cockpit: QR code, rotating tokens (55s), realtime attendance roster, feedback drawer; token-reload fix; 2-step end-confirm; live feedback; feedback count |
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
| Tests | ✅ Done | 153/153 passing |
| Migration 026 | ✅ Done | notifications table + RLS + realtime + create_notification helper + get_my_notifications + mark_read + confirm_match v3 (±90min conflict) + express_interest v3 + cancel_slot_request + leave_slot v3 + cancel_slot v3 + edit_slot v3 + assign_mentee v3 |
| Migration 027 | ✅ Done | Fix leave_slot + cancel_slot return shapes to match test expectations |
| Migration 028 | ✅ Done | edit_slot v4: host self-overlap check on time-change (mirrors create_slot guard) |
| NotificationBell | ✅ Done | Header bell with unread count badge; Sheet panel; realtime postgres_changes subscription; mark-read on tap; mark-all-read |
| RoomScheduleSheet | ✅ Done | "See availability" in hosting flow; 3-day grid with booked/free slots interleaved; tap free window → fills start_at |
| Haptics | ✅ Done | navigator.vibrate on join (double-pulse), leave (30ms), confirm match (triple-pulse), express interest, post request, room live toggle |
| lib/email-role.ts | ✅ Done | inferYearFromEmail + isCommitteeEmail + isSacEmail + isCrispEmail |
| Committee gating | ✅ Done | @xlri.ac.in accounts redirected from /, /requests, /my-requests, /doubts → /knowledge |
| SAC notify button | ✅ Done | "Notify CRISP" button on /admin/rooms (SAC-only); server action inserts outbox events for all is_committee members |
| BottomNav gating | ✅ Done | isCommittee prop: committee sees Knowledge+Profile only; committee admin adds Admin tab |
| lib/supabase/service.ts | ✅ Done | Service-role client for cached server queries (outside request scope) |
| Navigation perf | ✅ Done | loading.tsx on 11 routes (added cockpit/myqr/s) + home page profile+feed now parallel (−1 serial hop) + cockpit queries parallel; ~5s→instant skeleton |
| Migration 022 | ✅ Done | slots.reminder_sent_at + insert_slot_reminders() + express_interest/confirm_match write outbox |
| Migration 023 | ✅ Done | join_slot v4 (senior block + junior time-conflict), edit_slot v2 (room double-booking), create_slot RPC (host+room overlap), get_all_juniors/assign_mentee/unassign_mentee |
| /crisp-monitor | ✅ Done | CRISP member mentee monitor: all juniors list + assign/unassign with search + filter |
| Role/View guards | ✅ Done | SAC→rooms-only nav+redirect; CRISP member→rooms+monitor tabs; seniors→canJoin=false; slot creation→create_slot RPC |
| Email: interest_expressed | ✅ Done | express_interest() writes outbox row → junior notified when senior marks interest (idempotent) |
| Email: match_confirmed | ✅ Done | confirm_match() writes 2 outbox rows → junior (match confirmation) + senior (selection + junior contact) |
| Email: slot_reminder_30m | ✅ Done | insert_slot_reminders() SQL function queued by drain-notifications at top of each run; dedup via reminder_sent_at |
| drain-notifications v2 | ✅ Done | Templates for interest_expressed + match_confirmed (junior/senior) + slot_reminder_30m; schedules reminders then drains |
| AppHeader | ✅ Done | Sticky 52px header; PrepMax wordmark left; role badge + avatar right; dropdown: My Profile + Sign out |
| BottomNav v2 | ✅ Done | Floating pill (bg-card/95, blur, rounded-2xl, border, shadow); active = gd-soft bg + gd colour; max 4 tabs/role: Junior/Senior=Feed·Requests·Knowledge·Doubts, CRISP=Feed·Requests·Knowledge·Admin, SAC=Rooms |
| seed-dev-feedback.ts | ✅ Done | Creates completed GD slot + attended junior + feedback row for cockpit UI testing; run npx tsx scripts/seed-dev-feedback.ts |

## Dev Test Credentials

Run `npx tsx scripts/seed-dev-users.ts` to create these accounts (idempotent).

All 5 personas are b25/b26 student accounts — no more shared @xlri.ac.in logins.

| Email | Persona | Password |
|---|---|---|
| `b26001@astra.xlri.ac.in` | Junior (first-year, no flags) | `PrepMax@dev1` |
| `b25001@astra.xlri.ac.in` | Senior (can host GD+PI, no special flags) | `PrepMax@dev1` |
| `b25002@astra.xlri.ac.in` | CRISP Senior (is_crisp=true + host) | `PrepMax@dev1` |
| `b25003@astra.xlri.ac.in` | SAC Senior (is_sac=true + host) | `PrepMax@dev1` |
| `b25004@astra.xlri.ac.in` | Committee Senior (is_committee=true + host) | `PrepMax@dev1` |

**b25349@astra.xlri.ac.in** is the max-permission developer account (all flags true: can_host_gd/pi + is_crisp + is_sac + is_committee). Use it to see everything.

Dev login URL (local): http://localhost:3000/dev-login
Dev login URL (prod): https://prep-max-alpha.vercel.app/dev-login (ALLOW_DEV_LOGIN=true set in Vercel)

## One action still needed from Janmejai

**Google OAuth** — to sign in with Google (not just magic link), add credentials to Supabase:
1. `console.cloud.google.com` → Credentials → OAuth 2.0 Client ID (Web)
2. Authorized redirect URI: `https://fzohmolumyfupffkbxug.supabase.co/auth/v1/callback`
   Also add: `https://prep-max-alpha.vercel.app/auth/callback` to Supabase's redirect allow-list
3. `supabase.com/dashboard/project/fzohmolumyfupffkbxug/auth/providers` → Enable Google → paste Client ID + Secret

**Resend email** — to send actual notification emails (all code is live; just needs secrets):
1. Create account at resend.com, add domain `prepmax.xlri.ac.in`
2. Get API key
3. Set `RESEND_API_KEY` in Supabase Edge Function secrets (`supabase.com/dashboard/project/fzohmolumyfupffkbxug/functions/drain-notifications/secrets`)
4. Set `APP_URL=https://prep-max-alpha.vercel.app` in Edge Function secrets
5. Schedule `drain-notifications` to run every minute via Supabase cron (`supabase.com/dashboard/project/fzohmolumyfupffkbxug/integrations/cron`) — this one function now handles both reminder scheduling and email draining

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

## MORNING REPORT — 2026-06-12

### What shipped overnight (backlog items 1–9, all done)

| # | Item | What was built |
|---|---|---|
| 6 | Host self-conflict guard | `edit_slot v4` (migration 028): host can't edit a slot into a time that conflicts with another slot they're already running |
| 7 | Performance pass | All serial Supabase waterfalls eliminated — every page's queries run in `Promise.all`. Dynamic imports for `HostSlotSheet` + `EditSlotSheet`. Knowledge posts server-cached 60s via `unstable_cache`. |
| 8 | QA / Playwright E2E | 32-test suite across all 4 roles at 390px mobile. Found and fixed the root crash (see below). All 32 green on live Vercel. |
| 9 | Haptics | `navigator.vibrate` on 6 interaction points: join (double pulse), leave (30ms), confirm match (triple), express interest, post request, room live toggle |
| — | Notification bell | In-app bell in header: unread count badge, Sheet panel, realtime subscription, mark-read / mark-all-read |
| — | 8 notification triggers | match_confirmed, interest_expressed, non_chosen, request_cancelled, waitlist_promoted, slot_cancelled, slot_edited, mentee_added |
| — | RoomScheduleSheet | 3-day availability grid in the slot hosting form — tap a free window to fill start_at |
| — | Critical bug fix | Every authenticated page was crashing with "This page couldn't load". Root cause: `profileToNavRole()` was exported from `app-header.tsx` (`'use client'`) and called directly by 13 server components — Next.js 16 throws an RSC boundary error for this. Fix: moved the function to `lib/nav-role.ts` (no directive), updated all 13 pages. |
| — | Cohesion fixes | SAC users visiting `/admin/stats`, `/admin/roles`, `/mentor` were shown the wrong bottom nav (CRISP tabs instead of Rooms-only). Fixed. `NotificationBell` wrapped in `dynamic({ssr:false})` as extra SSR guard. |

### Current status
- **Live URL**: https://prep-max-alpha.vercel.app
- **Unit tests**: 153/153 Vitest green
- **E2E tests**: 32/32 Playwright green (live Vercel, 390px mobile Chrome)
- **Build**: clean TypeScript, clean `next build`
- **Last commit**: `0cd2b77` (BottomNav cohesion fixes)

### Actions still required from YOU (Janmejai)

1. **Email notifications (non-blocking — magic link works now)**
   - Create account at resend.com, add domain `prepmax.xlri.ac.in`, get API key
   - Go to: `supabase.com/dashboard/project/fzohmolumyfupffkbxug/functions/drain-notifications/secrets`
   - Set `RESEND_API_KEY=re_xxxx` and `APP_URL=https://prep-max-alpha.vercel.app`
   - Schedule the cron at: `supabase.com/dashboard/project/fzohmolumyfupffkbxug/integrations/cron` → `drain-notifications` every 60s
   - This one function handles both email delivery AND 30-min slot reminders.

2. **Google OAuth (optional — magic link already works)**
   - `console.cloud.google.com` → Credentials → OAuth 2.0 Client ID
   - Authorized redirect URI: `https://fzohmolumyfupffkbxug.supabase.co/auth/v1/callback`
   - Add `https://prep-max-alpha.vercel.app/auth/callback` to Supabase redirect allow-list
   - `supabase.com/dashboard/project/fzohmolumyfupffkbxug/auth/providers` → Enable Google → paste Client ID + Secret

3. **Seed dev data for cockpit testing**
   - Run: `npx tsx scripts/seed-dev-users.ts` (idempotent — creates the 4 dev accounts)
   - Run: `npx tsx scripts/seed-dev-feedback.ts` (creates a completed slot + feedback rows for UI testing)

### Known limitations / deferred items

- **Web push notifications** — not built. The current system is in-app bell + email. Native push (PWA service worker + Push API) is a V2 item; the data plumbing is already there.
- **Sentry** — no error monitoring. If the app goes to real users, add Sentry (one `next.config.js` line + `SENTRY_DSN` env var).
- **Lighthouse mobile** — not formally audited. The 390px Playwright tests confirm routes load; a full Core Web Vitals pass hasn't been done.
- **RUNBOOK.md** — not written. Would document incident response, how to rotate the service-role key, etc.
- **Auth rate limit in CI** — `confirm_slot.test.ts` occasionally hits Supabase auth rate limit; non-blocking locally but may affect a dedicated CI runner.
- **Seed counter display bug** — `seed.ts` logs "0 fake profiles seeded" due to a JS closure quirk; the rows are actually in the DB.

### Suggested next steps (prioritized)

1. **Activate emails** (15-min user action, zero code): set Resend key + schedule cron as above — this is the highest-value thing not yet live.
2. **Onboard real users**: share the dev login at https://prep-max-alpha.vercel.app/dev-login with the CRISP committee first, then open to b25/b26 cohort.
3. **Lighthouse / performance audit**: run `npx lhci autorun` or use Chrome DevTools to measure INP/LCP on the home feed with real data.
4. **Sentry stub**: 1-hour task — add `@sentry/nextjs`, wrap in `withSentryConfig`, set `SENTRY_DSN`. Good insurance before real users.
5. **RUNBOOK.md**: document key rotation, how to add a room, how to reset a dev account, incident escalation path.
6. **Web push (V2)**: browser Push API + service worker for on-device notifications even when the app is closed.

## Exact Next Step (open this at the start of the next session)

**DECISION NEEDED from Janmejai (see Part C review):**
Should base seniors (no committee flag) see the Knowledge tab in their nav?
- Recommendation: YES — Knowledge is prep content, everyone should read it. Only the Post button is gated.
- Alternative: NO — remove Knowledge from senior base nav (3 tabs: Feed/Requests/Doubts). Confirm to implement.

After that decision: activate email notifications (15-min Supabase dashboard task — see "Actions still required" above). Then onboard the CRISP committee as first real users.

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
| 2026-06-11 | Session 17: User feedback fixes. BLOCKING: @xlri.ac.in login blocked by domain check in login-client.tsx + auth/callback — fixed both to allow @xlri.ac.in. Dev-login link now shows on /login when ALLOW_DEV_LOGIN=true. Committee feed: removed redirect-to-knowledge from / and /doubts so committee (and senior+committee hybrids like b25349) can browse Slots feed read-only + Doubts. Committee BottomNav: Feed|Knowledge|Doubts|[Admin]|Profile. BottomNav: Mentor/Admin now adds as 6th tab (Profile always kept). Role Management Portal: /admin/roles with 7-flag toggles per user (CRISP-admin/SAC gated). Admin nav: Roles tab added to rooms+stats pages. Perf: loading.tsx for /admin/rooms and /admin/roles. canCreateSlot separated from canManageRooms. Push notifications plan delivered (item 6). 145/145 tests. |
| 2026-06-12 | Session 18: Email path complete. Migration 022: slots.reminder_sent_at + insert_slot_reminders() SQL function + express_interest/confirm_match updated to write outbox. drain-notifications v2: templates for interest_expressed, match_confirmed (junior+senior), slot_reminder_30m; calls insert_slot_reminders() at top of each run. Perf: loading.tsx added to cockpit/myqr/s routes; home page collapsed profile+feed queries into single parallel Promise.all (−1 serial hop); cockpit queries parallelised. 153/153 tests. User must add RESEND_API_KEY + schedule drain cron to activate emails. BUGFIX: proxy.ts (Next.js 16 middleware layer) was missing @xlri.ac.in in isEmailAllowed — committee accounts were being signed out on every request. Fixed + deployed. |
| 2026-06-12 | Session 19: Role/view reconciliation + scheduling clash detection + mentee monitor. Migration 023: join_slot v4 (seniors blocked + junior time-conflict check), edit_slot v2 (room double-booking on time-change), create_slot RPC (host-overlap + room-overlap checks, co-judges bundled), get_all_juniors/assign_mentee/unassign_mentee RPCs. BottomNav: SAC→single Rooms tab, CRISP member→Rooms+Monitor tabs. SAC redirected from / to /admin/rooms. Senior join button hidden (canJoin prop thread through SlotsFeed→SlotCard + me.isSenior in slot-detail-client). /admin/rooms now accessible to is_crisp_member. New /crisp-monitor page: mentee list with search/filter, assign/unassign buttons. host-slot-sheet.tsx migrated from direct INSERT to create_slot RPC. 153/153 tests. |
| 2026-06-12 | Session 20: is_crisp consolidation. Migration 024: collapsed is_mentor+is_crisp_member+is_crisp_admin+is_committee → single is_crisp boolean. 4-role model: JUNIOR (b26), SENIOR (b25), SENIOR+CRISP (is_crisp), SAC (is_sac). Migration 025: fixed join_slot v6 (v5 had NULL position + wrong 'waitlisted' status) + fixed express_interest (referenced dropped columns). Validation fixes: knowledge post (title≥3/body≥10) and doubts (min 5 chars) now validate client-side with friendly errors. All 20 app pages, BottomNav, scripts, all 13 test files updated. committee-gating tests rewritten for new model. 152/152 tests. |
| 2026-06-12 | Session 21: Task 1 (analysis) confirm_match traced end-to-end + 5 bugs/gaps documented. Task 2: AppHeader (sticky 52px, role badge+avatar, dropdown sign-out/profile) + BottomNav redesigned as floating pill (bg-card/95 blur, active=gd-soft bg+icon+label, inactive=50% muted) + Profile tab removed from all roles + CRISP capped at 4 tabs (Feed/Requests/Knowledge/Admin) + all 12 pages updated (missing name selects fixed). Task 3: Cockpit hardened (token-reload fix, 2-step end-confirm, live feedback, feedback count stat, feedback summary strip, clearer QR text, better pre-start card) + seed-dev-feedback.ts (completed slot + attended enrollment + feedback rows). No schema changes. 152/152 tests. |
| 2026-06-12 | Session 22: In-app notification system (migration 026): notifications table + RLS + realtime, NotificationBell component (header bell + unread badge + Sheet panel + realtime subscription). Confirm_match v3: ±90min host scheduling conflict guard. All 8 notification triggers wired (match_confirmed, interest_expressed, non_chosen, request_cancelled, waitlist_promoted, slot_cancelled, slot_edited, mentee_added). Migration 027: fixed leave_slot + cancel_slot return shapes. Migration 028: edit_slot v4 host self-overlap check. RoomScheduleSheet: 3-day availability grid in hosting flow. Haptics: navigator.vibrate on join/leave/confirm-match/interest/post-request/room-toggle. 153/153 tests. |
| 2026-06-12 | Session 23: Performance pass (item 7) + haptics (item 9). All serial DB waterfalls collapsed to Promise.all on all pages. Dynamic imports for HostSlotSheet + EditSlotSheet. navigator.vibrate on 6 interaction points. 153/153 tests. |
| 2026-06-12 | Session 24: QA/E2E (item 8) COMPLETE. Playwright test suite: 32/32 passing on live Vercel site at 390px mobile. Root cause of ALL page crashes found via Vercel logs: `profileToNavRole` was exported from `app-header.tsx` ('use client') and called directly by 13 server components — Next.js 16 throws "Attempted to call profileToNavRole() from the server but profileToNavRole is on the client." Fix: moved `profileToNavRole` + `NavRole` type to `lib/nav-role.ts` (no directive), updated all 13 server pages. Also: NotificationBell dynamic-imported with ssr:false; try-catch on createServiceClient() in /knowledge + /admin/roles; dev-senior profile data bug (is_crisp=true) fixed via SQL. 153/153 Vitest + 32/32 Playwright. |
| 2026-06-12 | Session 25: Additive permission model. Part A: SAC/CRISP flags now ADD to senior nav instead of replacing it. Removed `if (is_sac) redirect('/admin/rooms')` from app/page.tsx and removed `if (is_crisp \|\| is_sac) redirect('/knowledge')` from requests/my-requests pages. New BottomNav: Junior=Feed/Requests/Knowledge/Doubts; Senior=Feed/Requests/Doubts/Knowledge; +CRISP=Feed/Requests/Doubts/Admin; +SAC=Feed/Requests/Doubts/Rooms; +Committee=same as senior with Post button. Part B: Migration 029 adds is_committee flag. b25349 promoted to all-flags dev account. Old crisp@/sacdelhi@ shared logins deleted. 5 new dev personas (b25002 CRISP, b25003 SAC, b25004 Committee). /dev-login updated. Role portal shows is_committee chip. Part C: Full Mermaid architecture diagram + permission matrix delivered in session. Key flags: Knowledge tab ambiguity for base seniors (user decision pending); /mentor access inconsistency; SAC can't discover stats. 163/163 Vitest. E2E tests updated for new personas (not re-run against live yet — Vercel deploying). |
| 2026-06-12 | Session 26 (Phase 8 v2 — autonomous build): 12 sprints, 10 migrations, fully autonomously built. Migrations 030–039 applied. 163/163 Vitest throughout. Key features: profile enrichment (ug_degree/domain_1/domain_2), multi-interviewer PI requests (up to 4 interviewers, progress dots), Junior IA rework (/ask + /crisp-net + new BottomNav), CRISP Mentees hub (/mentees + /mentees/[id] with 360 stats + full feedback), Tasks CRUD (create_task RPC + mentees sheet), Knowledge threaded replies (add_knowledge_reply + get_post_replies), SAC occupancy view (host/WhatsApp strip on room cards), domain enforcement (function_tag on requests + My Domains filter chip), feedback anonymisation UI (get_my_feedback_anon + get_mentee_feedback_full), internal mentorship slots (visibility toggle in host sheet), E2E tests updated for Phase 8 nav. Pushed to GitHub. |
