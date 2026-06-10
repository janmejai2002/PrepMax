# PrepMax — Decisions Log

> Append-only. Every architectural decision lives here with date, rationale, and alternatives rejected.

---

## 2026-06-10 — Stack Choice

**Decision:** Next.js App Router + TypeScript + Tailwind + shadcn/ui + Supabase + Vercel + Resend

**Why:** Supabase gives us Postgres (atomic RPCs), Auth, RLS, Realtime, Storage, and Edge Functions in one platform with a generous free tier. Next.js App Router + Vercel = zero-config preview deploys that the human can review on his phone. shadcn/ui via MCP avoids hallucinated props. Resend for transactional email has the simplest API.

**Alternatives rejected:**
- Firebase: NoSQL makes atomic seat-claiming with FOR UPDATE impossible
- Google Sheets backend: race conditions under booking contention (exact failure mode PrepMax must solve)
- PlanetScale / Neon: Supabase bundles Auth + Realtime + Storage, reducing complexity
- Self-hosted backend: Vercel + Supabase = zero ops burden

---

## 2026-06-10 — Seat Counter Strategy: counter column vs COUNT(*) rows

**Decision:** Keep `enrolled_count` as a denormalized integer on the `slots` row, incremented/decremented inside the atomic RPC.

**Why:** Avoids a COUNT(*) query on every card render. Supabase Realtime broadcasts the slot row on change, so the live seat counter ("2 seats left") works without polling. The RPC owns the counter — no app-server logic can desync it.

**Alternatives rejected:**
- COUNT(*) on enrollments: N+1 on feed render, no Realtime push
- Separate counter table: extra join, extra lock surface

---

## 2026-06-10 — QR Direction: junior shows QR → judge scans (default)

**Decision:** Default direction = junior's phone shows their personal rotating QR; judge scans from the live-dashboard roster. Build token service direction-agnostic so CRISP can invert per session.

**Why:** Host has authoritative control over attendance; defeats proxies (you must have the phone). Large roster-less sessions can invert: room screen shows rotating QR, students self-scan.

**Alternatives rejected:**
- Static QR: screenshot-able, proxy-trivial
- Room screen only: works for big sessions but loses per-junior accountability for small PIs

---

## 2026-06-10 — No Google Sheets backend

**Decision:** Supabase Postgres only.

**Why:** Google Sheets has no row-level locking. Under concurrent seat claims (10 juniors hitting Join in the same second), Sheets would yield oversells. This is the central problem PrepMax must solve; the backend choice is non-negotiable.

---

## 2026-06-10 — Version Lock: Next.js 16 + React 19 + shadcn + @supabase/ssr

**Decision:** Lock the following versions as the Phase 1 baseline.

| Package | Pinned version | Notes |
|---|---|---|
| `next` | `16.2.9` | Latest stable as of 2026-06-10; peer dep accepts React `^18.2.0 \|\| ^19.0.0` |
| `react` / `react-dom` | `19.2.4` | Required by Next.js 16; already installed |
| `shadcn` (CLI) | `^4.11.0` | Already installed; when adding components, accept `--legacy-peer-deps` if prompted |
| `@supabase/ssr` | latest at Phase 1 install | Requires `@supabase/supabase-js ^2.106.1`; install together |
| `@supabase/supabase-js` | `^2.106.1` | Minimum required by @supabase/ssr |

**Why:** Context7 confirms no blocking incompatibilities between these versions. shadcn has a known React 19 peer dep warning on some component packages — use `--legacy-peer-deps`; this does not affect runtime behaviour. `@supabase/ssr` is framework-agnostic and has no Next.js version constraint.

**Alternatives rejected:**
- Next.js 15: we're already on 16 (scaffold was created at latest stable); no reason to downgrade
- React 18: Next.js 16 supports it but shadcn 4.x targets React 19; mixing would create more peer dep noise, not less

---

## 2026-06-10 — SAC Role (Student Activities Council)

**Decision:** Add `is_sac boolean NOT NULL DEFAULT false` capability flag to profiles. SAC accounts can: add rooms, toggle is_live, allot rooms to slots, and trigger broadcast email to all seniors when rooms go live.

**Why:** Room management should belong to a student-government role (SAC), not the CRISP mentoring committee. Separating the two keeps CRISP focused on mentorship and SAC focused on logistics. Both SAC and CRISP admin can manage rooms (union permission via `can_manage_rooms()` helper).

**Alternatives rejected:**
- Merging SAC duties into is_crisp_admin: conflates logistics with mentoring; CRISP members don't need room keys
- Separate rooms_admin role: unnecessary — SAC is the real-world authority for room allocation at XLRI

---

## 2026-06-10 — Room 3-State Model

**Decision:** Rooms have three observable states: `offline` (is_live=false), `live_available` (is_live=true, no active slot), `live_occupied` (is_live=true, has a slot with status in open/full/live whose time window includes now). No new column needed — occupied is derived from the slots table at query time. Exposed via `room_status` view (Migration 003).

**Why:** Seniors need to see at a glance which live rooms are still free when choosing a room to host a session. The third state prevents double-booking from two hosts picking the same room simultaneously. The derived approach avoids denormalization and stays consistent without triggers.

**Implementation:** `room_status` view joins rooms → slots on current time window. Used by hosting form (Phase 2). Slot status column drives the occupied flag — no additional migration needed when slots table lands.

---

## 2026-06-10 — CRISP Redefined as Mentor Cohort System

**Decision:** CRISP accounts are dedicated mentor-cohort managers. A CRISP account selects a set of mentors from the senior pool, then has a 360° dashboard per mentee showing: sessions attended, feedback received, speaking stats, review scores. CRISP does NOT manage rooms (that's SAC).

**Why:** The original is_crisp_admin flag was used as a catch-all admin. Splitting it out makes roles clear and avoids CRISP members accidentally toggling rooms offline. The mentee-management dashboard is a Phase 5 feature.

**Phase placement:**
- `is_sac` flag + room RLS: Migration 003 (done)
- SAC room management UI (allot room to slot): Phase 2
- Broadcast email to seniors when room goes live: Phase 4 (outbox pattern, Iron Rule #4)
- CRISP mentee selection + 360° dashboard: Phase 5

---

## Open Decisions (to surface at the relevant phase)

1. **Auth domain restriction** (Phase 1): Restrict signups to institute Google domain? → Ask Janmejai
2. **Waitlist promotion** (Phase 2): Automatic vs host-approves? → Recommendation: automatic
3. **Fairness mode** (Phase 2): Lottery window on/off by default per slot type? → Recommendation: OFF
4. **No-show penalty** (Phase 6): Visibility-only vs cooldown? → Ask Janmejai
5. **Review release cadence** (Phase 6): Weekly batch vs N≥3 threshold? → Ask Janmejai
6. **Speaking-time tally** (Phase 3): Keep or cut after first real GD? → Ask Janmejai
