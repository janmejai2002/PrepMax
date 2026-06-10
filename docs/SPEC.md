# PrepMax — Claude Code Operating Manual & Build Specification (v2)

> **READ THIS FIRST, CLAUDE CODE.** You are the sole builder of PrepMax. The human (Janmejai) is a product owner, not a programmer — he will direct via natural language ("vibe coding") across MANY sessions over several weeks. Your job in Session 0 is to set up your own environment, connectors, memory, and guardrails so that ANY future session can resume exactly where the last one stopped, with zero re-explanation. Then build in the phased order below. When this document and convenience conflict, this document wins.

---

# PART A — SESSION 0: BOOTSTRAP YOURSELF (do this before any feature code)

## A1. Install the MCP connector kit (exactly these five — no more)

Install at **project scope** (`.mcp.json` in repo root, committed to git) so every future session auto-loads them. Verify each with `/mcp` showing "connected" before proceeding. Do NOT install additional servers speculatively — each extra server eats context and degrades decision quality.

| # | Server | Why it's in the kit | Install |
|---|---|---|---|
| 1 | **Supabase MCP** (official, remote) | You manage the entire backend through it: create tables, write/apply migrations, execute SQL, inspect rows, manage RLS policies, fetch logs, generate TypeScript types — without the human touching a dashboard | `claude mcp add --transport http supabase https://mcp.supabase.com/mcp` then OAuth; scope it to the PrepMax project; keep **read-write in dev**, switch to `--read-only` flag before any production data exists |
| 2 | **shadcn MCP** (official) | Your UI quality engine. Browse/search/install real registry components and blocks instead of hallucinating props. ALWAYS pull from the registry before hand-writing a component | Add to `.mcp.json`: `{"shadcn": {"command": "npx", "args": ["shadcn@latest", "mcp"]}}` (requires `components.json` from `npx shadcn@latest init`) |
| 3 | **Context7** | Live, version-correct docs for Next.js / Supabase JS / Tailwind so you never code against a stale API surface | `claude mcp add --transport http context7 https://mcp.context7.com/mcp` |
| 4 | **Playwright MCP** (Microsoft) | Your eyes. After building any screen, open it in a real browser at mobile viewport (390×844), interact via accessibility tree, screenshot, and self-review. Also powers E2E tests | `claude mcp add playwright -- npx -y @playwright/mcp@latest` |
| 5 | **GitHub MCP** (official, remote) | Repo, commits, PRs, issues — you maintain the project's own history and use Issues as the feature tracker | `claude mcp add --transport http github https://api.githubcopilot.com/mcp/` then OAuth |

**Optional, later only:** Sentry MCP once the app is live with real users (production error triage). Vercel MCP if deploy debugging is needed. Do not install in Session 0.

**If any install fails:** tell the human exactly what one-time auth step they must perform (OAuth click-through, GitHub PAT), then continue with the rest. Never silently skip.

## A2. Write your own memory — CLAUDE.md (project root, committed)

Create `CLAUDE.md` with, at minimum:

```markdown
# PrepMax — Claude Code Project Memory
## What this is
Mobile-first placement-prep platform for a Tier-1 Indian B-school.
Seniors host GD/PI practice slots; juniors compete to join; CRISP committee admins.
Full spec: docs/SPEC.md (this handoff). Current state: docs/STATE.md. Decisions: docs/DECISIONS.md.

## Stack (do not change without updating docs/DECISIONS.md)
Next.js App Router + TypeScript + Tailwind + shadcn/ui • Supabase (Postgres, Auth, RLS,
Realtime, Storage, Edge Functions) • Vercel • Resend (email) • wa.me deep links (WhatsApp)

## Iron rules
1. Seat-claiming is ONE atomic Postgres function (SELECT...FOR UPDATE). Never read-then-write seats in JS.
2. All DB schema changes via migrations in supabase/migrations/ — never ad-hoc dashboard edits.
3. RLS ON for every table. Permissions live in the database, not the UI.
4. Side effects (email/notifications) fire AFTER commit via outbox table — never inside booking.
5. Mobile-first: build & verify every screen at 390px with Playwright before calling it done.
6. UI components come from shadcn registry via MCP first; hand-write only what the registry lacks.
7. reviews table NEVER gets a user_id column.
8. Every feature lands with its test (Vitest for RPCs, Playwright for flows).

## Workflow rules
- Start every session: read docs/STATE.md, run /mcp to verify connectors, run the test suite.
- Use Plan Mode (shift+tab) for any multi-file feature; show the plan before writing code.
- Commit small and often with conventional messages (feat:/fix:/test:/chore:).
- End every session: update docs/STATE.md (what's done, what's in flight, exact next step),
  commit everything, push.
- The human is non-technical. Explain choices in one plain sentence, never paragraphs of jargon.
- When the human's request conflicts with an Iron Rule, say so and propose the compliant version.
```

## A3. Create the continuity files

- **`docs/SPEC.md`** — paste this entire handoff. The permanent source of truth.
- **`docs/STATE.md`** — living status: ✅ done / 🔨 in progress / ⏭ next exact step / ⚠️ known issues. **Updating this at session end is mandatory** — it is what makes multi-session vibe coding work.
- **`docs/DECISIONS.md`** — append-only log: date, decision, why, alternatives rejected. Seed it with: stack choice, "no Google Sheets backend" (race conditions under booking contention), counter-vs-seat-rows choice, QR direction.

## A4. Custom slash commands (create in `.claude/commands/`)

- **/resume** — "Read docs/STATE.md and the last 5 git commits, verify MCP connections, run tests, summarize where we are in 5 lines, state the next step, await go-ahead." *(This is the human's session-opener.)*
- **/wrap** — "Run full test suite, fix or log failures, update docs/STATE.md, commit and push, summarize the session in plain English."
- **/ship-check** — "Run typecheck, lint, all tests, then Playwright-walk the core journey (browse → join → attend → feedback) at mobile viewport and report with screenshots."
- **/stress** — "Run the concurrency load script against join_slot on a fresh seeded slot and report confirmed/waitlist/oversell counts."
- **/ui-review** — "Open the named route at 390×844 via Playwright, screenshot, critique against the design system in docs/SPEC.md Part D, list concrete fixes, apply approved ones."

## A5. Hooks & permissions (`.claude/settings.json`)

- **PostToolUse hook** on file edits → run `tsc --noEmit` and ESLint on changed files; surface failures immediately instead of letting type errors pile up.
- **Pre-commit hook** (husky) → typecheck + lint + unit tests.
- Pre-approve safe commands (`npm test`, `npx tsc`, dev server, supabase CLI read ops) so flow isn't interrupted; keep confirmation for destructive ops (migrations on remote, deletes).

## A6. Project scaffold checklist (end of Session 0)

1. `create-next-app` (TypeScript, Tailwind, App Router) → `npx shadcn@latest init`.
2. Supabase project created via MCP; local dev via Supabase CLI; `.env.local` written; **transaction-mode pooler URL** used for all serverless DB access.
3. Vitest + Playwright installed and a trivial test of each passing.
4. GitHub repo created via MCP, first commit pushed, Vercel connected (preview deploys on every push — the human reviews on his phone via preview URLs).
5. CLAUDE.md, docs/, slash commands, hooks all committed.
6. Tell the human: "Bootstrap complete. From now on, open every session with /resume."

---

# PART B — THE PRODUCT (what you are building)

## B1. One paragraph

PrepMax serves first-year MBA students racing toward Summer Internship Placements. Second-year seniors post **GD (group discussion)** and **PI (personal interview)** practice slots in campus rooms; first-years compete — genuinely, within seconds — to claim seats; attendance is QR-verified; judges score live from a phone dashboard; structured feedback accumulates on each junior's profile; mentors track trajectories; committees publish prep content; juniors ask doubts (internal Quora) and leave anonymous reviews; and the **CRISP committee** administers rooms, sees live room occupancy, daily stats, and any junior's full history.

## B2. Identity model

`profiles.year` (`first`|`second`) drives default views. **Additive capability flags** — `can_host_gd`, `can_host_pi`, `is_mentor`, `is_committee`, `is_crisp_admin` — drive permissions. CRISP admin = superset. No rigid role tree.

## B3. Data model (Postgres; uuid PKs; timestamptz; RLS on everything)

- **profiles** — name, email, phone, whatsapp, year, batch, section, roll, avatar_url, capability flags.
- **rooms** — name, location, capacity, `is_live` (CRISP toggle; hosts can only book live rooms).
- **slots** — type (`GD`|`PI`), host_id, internship (nullable), expert_areas text[], room_id, start_at, end_at, topic, description, gd_type_desc, capacity, enrolled_count, status (`open`|`full`|`live`|`completed`|`cancelled`), share_slug (unique), version (int, for stale-edit protection).
- **slot_judges** — (slot_id, judge_id) PK; host adds 1–2 co-judges.
- **enrollments** — slot_id, user_id, status (`confirmed`|`waitlist`|`cancelled`|`no_show`|`attended`), position, attended_at. **UNIQUE(slot_id, user_id)** — the idempotency guarantee.
- **slot_requests** — junior-initiated group GD / custom PI requests: type, requested_by, member_ids uuid[], custom_requirements, preferred_window, status, accepted_by, resulting_slot_id.
- **attendance_tokens** — slot_id, token, expires_at (~30s rotating).
- **gd_feedback / pi_feedback** — slot_id, junior_id, judge_id, chips jsonb, speaking_seconds, notes, score, `finalized` bool. One row per judge×junior.
- **post_session_survey** — per judge per slot, jsonb fields.
- **reviews** — slot_id, type, rating, text, `dedup_hash`, created_at. **NO user_id. EVER.**
- **knowledge_posts** — committee_id, function_tag (`marketing`|`consulting`|`finance`|`pm`|`ops`|`general`), title, body, attachments jsonb.
- **doubts / doubt_answers** — internal Quora: title, body, image_url, function_tag, status; answers with upvotes.
- **mentor_assignments** — (mentor_id, junior_id) PK.
- **outbox** — see B5. **notification_log** — audit of every send.

## B4. The crown jewel — atomic booking (Iron Rule #1)

`join_slot(p_slot_id, p_user_id)` as a single Postgres function (RPC):

1. `SELECT ... FOR UPDATE` the slot row → serializes all concurrent claimers on that one row.
2. Reject if status ∉ {open, full}.
3. Insert enrollment: if `enrolled_count < capacity` → `confirmed`, increment counter, flip slot to `full` at capacity; else → `waitlist` with next position.
4. Duplicate insert hits UNIQUE(slot_id,user_id) → catch → return the existing enrollment (double-tap = no-op).
5. Insert outbox event. Return `{status, position}`.

Companions: `leave_slot` (free seat → auto-promote waitlist head → outbox event), `cancel_slot` (notify all confirmed+waitlist), `edit_slot` (optimistic-lock on `version`; time/room change → notify all confirmed).

## B5. How big companies solve PrepMax's problems — adopt these patterns

This section is the "deeper review." Each pattern below is mandatory design, not inspiration.

**1. The seat fight → ticketing-platform discipline (BookMyShow / Ticketmaster).** High-demand ticketing never lets app servers count seats; an atomic reservation at the data layer is the only authority, and the UI is designed for losing gracefully. So: the RPC above, plus a UI that *immediately* tells a loser "Slot full — you're #4 on the waitlist" rather than a spinner into an error. The fastest path to student trust is honest, instant failure with a consolation (waitlist position).

**2. Double-taps & retries → idempotency keys (Stripe).** Stripe makes every payment request safe to retry by keying it. Our UNIQUE(slot_id,user_id) constraint is exactly this for joins: a retry returns the same result instead of a second seat. Additionally rate-limit the join endpoint per-user (e.g. 5 req/10s, via Upstash Redis or a simple Postgres check) so tap-storms die before the DB.

**3. Notifications that must not block bookings → the Transactional Outbox pattern (Uber/Airbnb-style microservices).** Never call Resend inside the booking transaction. The RPC writes an event row to `outbox` in the SAME transaction (so it can't be lost); a Supabase Edge Function (cron, ~every minute, or DB webhook) drains the outbox, sends email, writes `notification_log`, marks processed. Email being slow or down can NEVER make joining slow or down, and no confirmation is ever silently lost.

**4. Waitlists → restaurant-tech model (OpenTable/Resy).** Ordered queue, auto-promotion on cancellation, instant notification to the promoted student with the slot URL. Promotion happens inside `leave_slot` atomically — no cron race where two people get the same freed seat.

**5. No-shows → accountability loops (OpenTable's strike system, Practo).** No-shows poison goodwill: seniors donate time and face empty chairs. Record `no_show` at session close (anyone confirmed but never scanned). V1: surface no-show counts on the CRISP dashboard and the junior's profile. V2 (config-flagged, CRISP decides): soft penalty like 24h booking cooldown after 2 no-shows in 7 days. Build the data path now, the penalty later.

**6. Proxy attendance → rotating-token check-in (Swiggy/Delhivery delivery OTPs, BookMyShow entry QRs).** A static QR is screenshot-able; delivery apps defeat this with short-lived server-signed codes. Attendance token = JWT signed server-side, TTL ~30s, encoding slot_id + nonce. Default direction: **junior's phone shows their personal rotating QR; the judge scans from the live-dashboard roster** (host has authoritative control; kills proxies). For large roster-less sessions, invert: room screen shows rotating QR, students self-scan within the time window. Build the token service direction-agnostic.

**7. Live judging → structured-rubric scorecards (Greenhouse / Lever interview kits).** Big hiring tools learned free-text notes are slow to write live and impossible to aggregate. The GD cockpit is therefore **chips-first**: per-junior tap-tags (Initiated, Strong content, Data point, Structured, Summarized, Interrupted, Dominated, Quiet) + optional tap-tally speaking timer + a small free-notes field. Chips give juniors comparable feedback across sessions and give CRISP aggregable analytics ("you've been tagged 'Quiet' in 4 of 5 GDs"). Feedback is draft until the post-GD **finalization window** where all judges sit, refine, and lock — only `finalized=true` rows appear on the junior's profile (Greenhouse's exact draft→submit model, prevents half-typed live notes leaking).

**8. Anonymous reviews → Glassdoor's k-anonymity thinking.** Anonymity isn't just dropping the name; it's defeating inference. (a) No user_id — spam control via one-way `dedup_hash = SHA256(user_id‖slot_id‖server_secret)` with a UNIQUE index: one review per attendee per slot, irreversible. (b) **Batched release:** if a PI had one attendee, an instant review outs them — so reviews display to seniors only in periodic batches and/or after N≥3 reviews accumulate for that senior, with timestamps coarsened to the week. (c) Gate submission on `attended`, discard identity before insert.

**9. Stale edits → optimistic locking (Google Docs lineage).** Two co-judges editing a slot simultaneously must not silently overwrite each other: `edit_slot` requires the `version` it read; mismatch → friendly "this slot changed, here's the latest" instead of lost data.

**10. Read-heavy feeds → denormalized counters + realtime (Instagram-style).** `enrolled_count` lives on the slot row (no COUNT(*) per card render); Supabase Realtime broadcasts slot-row changes so every browsing phone sees "2 seats left → FULL" live. This live scarcity is also honest UX during the fight.

**11. Stats & drill-downs → SQL views (every analytics team ever).** CRISP's daily stats (PIs per senior, no-show/completion rates, review summaries) and room-now view are Postgres views/materialized views, not app-side aggregation. The junior 360° profile is one well-indexed join.

**12. Fairness option (config flag, OFF by default) → IRCTC/Ticketmaster virtual waiting room.** Pure first-tap-wins rewards network speed. If CRISP ever wants fairness over speed: slots open with a 60-second "interest window," then random lottery among raisers, rest waitlisted in random order. Build the flag; let CRISP choose per-slot-type. (Document in DECISIONS.md either way.)

## B6. Module specs

**Slots feed (the home screen for first-years).** Cards sorted by start_at. GD and PI visually distinct (B7 tokens). Top: search + segmented **GD / PI / Both** filter. Card: type badge, host + internship, expert-area chips, room+time, topic, live seat state ("3/6 joined"), Join. Join states: confirmed ✅ / waitlist #n / full. Post-join: WhatsApp button → `wa.me/<host>?text=` prefilled: *"Hi, I am {name}. I've joined the {GD/PI} slot you posted for {time}. If any prep is needed, I'd like to come prepared."*

**Share cards.** Every slot has `/s/{share_slug}` — public page + generated OG image (next/og) so WhatsApp pastes show a rich card (type, topic, time, room, seats). Joining still requires login. This is the growth loop: students sharing slots in batch groups IS the distribution.

**Hosting.** Form: type, internship?, expert areas (multi-select + free type), room (only `is_live`), start/end, topic, description, GD-type desc, capacity (PI default 1). Add co-judges. Edit/cancel → outbox notifications.

**Slot requests.** Juniors group up (search-add members), submit custom GD request or solo custom-PI request with requirements + preferred window. Seniors see a request queue; accept → materializes a real slot with room → requesters auto-enrolled (atomically, same RPC) → notified.

**Live GD cockpit.** "Start GD" unlocks **server-computed** 5 min before start_at (never client clock). Roster of confirmed juniors with scan-in state. Per-junior chips + tap timer + notes (B5.7). Multi-judge: each judge their own canvas; Realtime syncs roster/attendance across judge phones. Then post-GD survey per judge + finalization window. **PI portal** = same skeleton, 1:1, PI-specific chips (Comm, Structure, Domain, CV-defense).

**Knowledge feed.** Committee accounts post with function_tag; recency feed; filter chips (Marketing/Consulting/Finance/PM/Ops/General); clean, minimal.

**Doubts.** Post with optional image (Supabase Storage, compressed client-side); seniors answer; upvotes; answered state; function-tag filters.

**Mentor & CRISP views.** Mentor: assigned juniors → 360° profile (GDs joined/attended, all finalized feedback, chip aggregates, PI history, attendance %, no-shows). CRISP: rooms CRUD + is_live toggle; **Room-Now** board (each room's current/next session — a Realtime-updating grid); **Daily stats** (PIs per senior, completed vs no-show, review digests); tap any junior → full profile.

## B7. Permissions matrix (enforce in RLS, mirror in UI)

| Action | 1st yr | 2nd yr host | Mentor | Committee | CRISP |
|---|---|---|---|---|---|
| Browse/join/request slots | ✅ | ✅ | ✅ | ✅ | ✅ |
| Host/edit/cancel; judge & feedback | ❌ | ✅ (own/judging) | — | — | ✅ |
| Post knowledge | ❌ | ❌ | ❌ | ✅ | ✅ |
| Answer doubts | ❌ | ✅ | ✅ | ✅ | ✅ |
| View junior profile | own only | ❌ | assigned only | ❌ | all |
| Rooms / stats / room-now | ❌ | ❌ | ❌ | ❌ | ✅ |
| Anonymous review | ✅ if attended | ✅ if attended | — | — | — |

RLS tests are part of done-ness: a first-year JWT must fail to insert a slot or read someone else's feedback.

---

# PART C — UI/UX SYSTEM (how to make it genuinely good, not AI-generic)

**C1. Component strategy.** shadcn/ui via the **shadcn MCP** — search the registry and install real components/blocks (card, sheet, dialog, tabs, badge, command, form, sonner toasts, skeleton) before hand-writing anything. Customize tokens, don't fork internals.

**C2. Design tokens — define once in Session 1, never improvise colors again.**
- Base: neutral background, generous whitespace, one font (Inter or Geist), 8-pt spacing grid.
- **GD identity = indigo** family; **PI identity = amber/orange** family — applied as a left border accent + badge on cards, calendar blocks, and cockpit headers, so type is recognizable at a glance and the feed stays calm (never full-bleed colored cards).
- Status colors: confirmed=green, waitlist=amber, full/cancelled=muted red, live=pulsing dot.
- Dark mode from day one (hostel-room night usage is the norm).

**C3. Mobile-first laws.**
- **Bottom tab bar** (thumb zone): Slots · Knowledge · Doubts · Profile (+ Admin tab when capable). Hosting/judging actions as floating button or within tabs.
- All primary actions in the bottom 40% of screen; touch targets ≥44px; one-handed flows.
- Sheets (bottom drawers) over modals for forms on mobile.
- Skeleton loaders, never spinners, on feeds; optimistic UI on join (instant "Joining…" → server-truth reconcile from the RPC result).
- The judge cockpit is a thumb-operable console: junior tiles, tap-to-expand chips, no typing required mid-GD.

**C4. The Playwright self-review loop (mandatory).** After building any screen: open at 390×844 → screenshot → critique against C2/C3 (hierarchy, spacing, tap targets, empty/loading/error states present?) → fix → re-screenshot. A screen isn't done until it survives this loop. The human will also review Vercel preview URLs on his actual phone — treat his screenshots/comments as the highest-priority bug reports.

**C5. Empty/edge states are designed, not default.** Every feed needs a friendly empty state ("No slots yet — seniors post around evenings 👀"); every error a human sentence + retry; full slots show the waitlist CTA, not a dead button.

---

# PART D — DELIVERY PLAN (phases = sessions; human steers with /resume → build → /wrap)

**Phase 0 — Bootstrap** (Part A entirely). Exit: `/mcp` all green, scaffold deployed to a Vercel preview, CI green, STATE.md alive.

**Phase 1 — Auth + identity + rooms.** Google OAuth via Supabase (institute accounts; magic-link fallback), profile completion, capability flags, rooms CRUD + is_live (CRISP), seed script (~200 Faker profiles, rooms, slots). RLS first pass + tests.

**Phase 2 — THE CROWN JEWEL.** join_slot / leave_slot / cancel_slot / edit_slot RPCs + migrations; slots feed UI (search, GD/PI/Both segmented filter, realtime seat counts); hosting form; **the /stress load test** (100 concurrent joins on a 6-seat slot → exactly 6 confirmed, 94 ordered waitlist, 0 oversell, 0 dupes — automated assertion, run on every later phase too).

**Phase 3 — Attendance + live cockpit.** Rotating-token QR service; judge-scans-junior flow; GD cockpit (roster, chips, timer, notes, multi-judge realtime); finalization window; post-session survey; PI portal variant; feedback lands on junior profile.

**Phase 4 — Comms loop.** Outbox + Edge Function drainer + Resend templates (join confirmation w/ URL, edit, cancel, waitlist promotion); WhatsApp deep-link buttons; share cards w/ OG images; slot-request flow (group GD + custom PI).

**Phase 5 — Knowledge + Doubts.** Committee posting, feed + filters; doubts with images, answers, upvotes.

**Phase 6 — Mentors + CRISP cockpit.** Mentor assignments + junior 360°; Room-Now board; daily stats views; no-show recording; anonymous reviews with dedup-hash + batched release.

**Phase 7 — Hardening.** Full Playwright E2E of the canonical journey (host creates → junior joins under contention → scans in → judged → finalized feedback on profile → review posted); rate limiting verified; RLS audit (attempt every forbidden action per role); Lighthouse mobile pass; load test rerun; Supabase MCP flipped read-only against prod; backup/export plan documented; ops runbook (`docs/RUNBOOK.md`) for the human: how to add a CRISP admin, toggle rooms, read stats, what to do if email stalls.

**Self-prep content module:** deferred by design — the human will research content separately; leave a stub tab.

---

# PART E — TESTING & DEFINITION OF DONE

Per-phase: unit tests for every RPC (Vitest against local Supabase), Playwright flow test for every screen, RLS negative tests, and the standing /stress run.

**The PoC is DONE when, proven by automated tests, not by hand:**
1. 6-seat GD + 100 concurrent joins → exactly 6 confirmed, 94 waitlisted in order, 0 oversell, 0 duplicate enrollments.
2. A junior can (on a 390px viewport): discover → join → show rotating QR → be scanned by the host → receive chip-based finalized feedback → see it on their profile.
3. A first-year token cannot create a slot, read another's feedback, or unmask any review (RLS-verified).
4. Killing the email worker mid-flow loses zero bookings and zero notifications (outbox drains on restart).
5. The whole journey survives a /ship-check with screenshots the human can review on his phone.

---

# PART F — OPEN DECISIONS (Claude Code: surface these to the human at the relevant phase, one plain-English question each, record answer in DECISIONS.md)

1. Auth: institute Google domain restriction on signups? (Phase 1)
2. Waitlist promotion: automatic (recommended) vs host-approves? (Phase 2)
3. Fairness mode (lottery window) per slot type: on/off default? (Phase 2)
4. No-show penalty: visibility-only vs cooldown? (Phase 6)
5. Review release cadence: weekly batch vs N≥3 threshold vs both? (Phase 6)
6. Speaking-time tally in cockpit: keep or cut after first real GD's feedback? (Phase 3)