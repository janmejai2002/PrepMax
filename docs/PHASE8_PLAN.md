# PrepMax Phase 8 (v2) — Full Plan

> Written 2026-06-12. Decisions on all ambiguities made autonomously per instructions.
> This file is the single source of truth for the v2 build.

---

## Vision Summary

| Role | What the app is for them |
|---|---|
| **Junior** | Get help from CRISP mentors + committee + seniors. Practice interviews, receive mentor tasks, read prep content. |
| **Senior** | Help juniors via GD/PI slots. Domain-constrained: can only host/take slots in their 2 chosen domains. |
| **CRISP Senior** | Everything a senior does + full mentee management (per-junior dashboard, task assignment, internal mentorship slots). |
| **SAC** | Rooms admin: toggle live/offline + see who's currently in each room (host name + WhatsApp contact). Nothing else. |
| **Committee** | Post and manage knowledge content + moderate threaded replies from juniors. |

---

## Information Architecture

### Junior — 4 bottom-nav tabs

```
[Ask a Senior]  [Domain]  [CRISPNet]  [My Profile]
```

| Tab | Route | Content |
|---|---|---|
| Ask a Senior | `/ask` | Sub-tabs: **Practice** (post/manage PI-GD requests, see interested seniors, multi-confirm) + **Q&A** (doubts feed — ask seniors questions) |
| Domain | `/knowledge` | Read-only committee posts + threaded 2-level comment system per post |
| CRISPNet | `/crisp-net` | Sub-tabs: **Feedback** (past GD/PI with anonymised judge scores) + **Tasks** (CRISP-assigned to-dos with status controls) |
| My Profile | `/profile` | UG degree + short description + 2 domain-of-interest fields + existing info |

### Senior — 4 tabs

```
[Feed]  [Requests]  [Q&A]  [My Profile]
```

- **Feed** (`/`): Slot feed filtered to own domains by default (toggle to see all). Host-a-slot FAB domain-constrained.
- **Requests** (`/requests`): Junior PI/GD requests filtered to senior's domains.
- **Q&A** (`/doubts`): Answer junior questions.
- **My Profile** (`/profile`): Same as junior + domains.

> Knowledge tab **removed** from senior nav — committee-only.

### CRISP Senior — 4 tabs

```
[Feed]  [Requests]  [Q&A]  [Mentees]
```

- Same Feed/Requests/Q&A as senior.
- **Mentees** (`/mentees`): Mentee list → per-junior detail → task creation. Admin pages (stats/rooms/roles) accessible from header sub-nav link inside the Mentees hub.

> **Decision A1**: Admin tab dropped in favour of Mentees. Stats/rooms/roles still accessible via links inside `/mentees` header, not via bottom nav. Rationale: mentee management is the primary CRISP workflow.

### SAC — 1 view

- **Rooms** (`/admin/rooms`): Live/offline toggle + occupancy column showing current slot host name + WhatsApp link. No stats link, no role management.

### Committee — 2 tabs

```
[Knowledge]  [My Profile]
```

---

## Data Model Changes

### Migration 030 — Profile enrichment

```sql
ALTER TABLE profiles
  ADD COLUMN ug_degree  TEXT,          -- "B.Tech CS, IIT Delhi" (free text)
  ADD COLUMN domain_1   TEXT,          -- FUNCTION_TAGS value
  ADD COLUMN domain_2   TEXT;          -- FUNCTION_TAGS value
-- Existing `bio` column keeps its name; UI label changes to "Short description"
```

**Decision A2**: Keep `bio` column as-is; rename the UI label to "Short description". No column rename to avoid migration complexity.

### Migration 031 — Multi-interviewer PI requests

```sql
ALTER TABLE slot_requests
  ADD COLUMN interviewer_count INT NOT NULL DEFAULT 1 CHECK (interviewer_count BETWEEN 1 AND 4),
  ADD COLUMN confirmed_count   INT NOT NULL DEFAULT 0;

ALTER TABLE interests
  ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'
  CHECK (status IN ('pending', 'confirmed', 'declined'));
```

- `confirm_match` v4: sets `interests.status = 'confirmed'`, increments `confirmed_count`. Request stays `'open'` until `confirmed_count >= interviewer_count`, then becomes `'matched'`.
- WhatsApp intro sent on **each** confirmation (not just final). **Decision A3.**
- Junior **can** retract a confirmed senior via `retract_confirmation` RPC (sets `interests.status = 'pending'`, decrements count). **Decision A4.**
- `matched_senior_id` on slot_requests is kept as legacy (= first confirmed senior's ID).

### Migration 032 — Domain tags on requests

```sql
ALTER TABLE slot_requests
  ADD COLUMN function_tag TEXT;  -- domain for PI requests; NULL = any (for GDs)
```

**Domain enforcement rules** (Decisions A5, A6):
- Enforcement triggers **only when a `function_tag` is set** on the slot/request (Option A).
- For **PI slots**: if host has `domain_1`/`domain_2` set, `create_slot` RPC requires slot's `function_tag` to match one of them.
- For **PI requests**: `express_interest` RPC checks caller's domains against request's `function_tag`.
- **GD slots**: no domain enforcement — GDs are open to all seniors.
- If a senior has **not set their domains**: UI shows a prompt to set them on profile, but the RPC soft-blocks with an error message (not a hard DB constraint). This gives 30 days of grace-period flexibility at rollout.

### Migration 033 — CRISP task system

```sql
CREATE TABLE tasks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id   UUID NOT NULL REFERENCES profiles(id),
  title        TEXT NOT NULL CHECK (length(title) >= 3),
  description  TEXT,
  deadline     TIMESTAMPTZ NOT NULL,
  scope        TEXT NOT NULL DEFAULT 'all' CHECK (scope IN ('all', 'specific')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE task_assignments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  junior_id  UUID NOT NULL REFERENCES profiles(id),
  status     TEXT NOT NULL DEFAULT 'not_started'
             CHECK (status IN ('not_started', 'in_process', 'completed')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (task_id, junior_id)
);
```

- **`scope = 'all'`**: assigned to all current mentees of the creator at creation time. New mentees added later do NOT get the task automatically. **Decision A7.**
- **Deadline**: full datetime (TIMESTAMPTZ). **Decision A8.**
- RLS: juniors can only read/update their own assignments; CRISP can read all assignments for tasks they created.

### Migration 034 — Knowledge threaded replies

```sql
CREATE TABLE knowledge_replies (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    UUID NOT NULL REFERENCES knowledge_posts(id) ON DELETE CASCADE,
  parent_id  UUID REFERENCES knowledge_replies(id) ON DELETE CASCADE,
  author_id  UUID NOT NULL REFERENCES profiles(id),
  body       TEXT NOT NULL CHECK (length(body) >= 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

- **Max depth: 2 levels** (top-level comment + one reply). Enforced in RPC. **Decision A9.**
- Any authenticated user can reply. Author can delete their own reply.
- Committee members can delete any reply on their post.

### Migration 035 — Feedback anonymisation

- No schema change. The `feedback` table keeps `from_user_id`.
- **New function** `get_my_feedback_anon()`: returns junior's received feedback with `from_user_id` and judge name **stripped** — scores/tags/notes only.
- **New function** `get_mentee_feedback_full(p_junior_id UUID)`: CRISP-only, returns full rows with judge names.
- The existing `my_received_feedback` view (used on `/profile`) is updated to hide `from_user_id`.

### Migration 036 — Internal mentorship slots

```sql
ALTER TABLE slots
  ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public'
  CHECK (visibility IN ('public', 'mentees_only'));
```

- `mentees_only` slots appear in feed queries **only** for juniors whose `mentor_id = slot.host_id`.
- Room still required. **Decision A10.**
- CRISP can toggle this when creating a slot via the Host-a-slot sheet.

---

## Ambiguity Decisions Log

| # | Question | Decision |
|---|---|---|
| A1 | CRISP admin tab placement | Folded into Mentees hub header sub-nav |
| A2 | `bio` column rename | Keep column as `bio`; change UI label only |
| A3 | Multi-senior WhatsApp intro timing | Send on each individual confirmation |
| A4 | Un-confirm a senior | Yes — `retract_confirmation` RPC |
| A5 | Domain enforcement trigger | Only when `function_tag` is set on slot/request |
| A6 | Domain enforcement scope | PI only; GD slots open to all seniors |
| A7 | `scope='all'` new-mentee behaviour | Snapshot at creation; late-joiners not auto-assigned |
| A8 | Task deadline precision | Full datetime (TIMESTAMPTZ) |
| A9 | Reply depth | 2 levels max |
| A10 | Mentorship slots room requirement | Room still required |
| A11 | Seniors without domains | UI soft-block (prompt to set domains); RPC returns informative error |
| A12 | Doubts vs knowledge comments | Both survive: `/doubts` = senior↔junior Q&A; knowledge replies = committee↔junior Q&A |

---

## New Pages

| Page | Type | Replaces |
|---|---|---|
| `/ask` | NEW | Junior landing for Practice + Q&A |
| `/crisp-net` | NEW | Junior Feedback + Tasks hub |
| `/mentees` | NEW | Replaces `/crisp-monitor` + `/mentor` |
| `/mentees/[id]` | NEW | Per-junior detail (stats, tasks, full feedback) |

## Changed Pages

| Page | Change |
|---|---|
| `/profile` | + ug_degree, short description label, domain_1/2 pickers |
| `/knowledge` | + threaded reply thread below each post |
| `/admin/rooms` | + occupancy column (live room → host name + WhatsApp) |
| `/requests` | + domain filter; interest blocked if domain mismatch |
| `/my-requests` | + interviewer_count on PI requests; list confirmed seniors |
| `/` (feed) | + domain filter toggle for seniors |
| `/doubts` | Minor: senior can answer but not post new doubts (juniors post) |
| BottomNav | New tab sets per role |
| All pages | Retired: old isAdmin prop usage cleaned up |

## Retired Pages

| Page | Status |
|---|---|
| `/crisp-monitor` | Redirect → `/mentees` |
| `/mentor` | Redirect → `/mentees` |

---

## Build Order

```
Sprint 1  Data model: migrations 030–036
Sprint 2  Profile: ug_degree + domain pickers + label fixes
Sprint 3  Junior IA: /ask + /crisp-net + bottom nav
Sprint 4  CRISP Mentees hub: /mentees + /mentees/[id]
Sprint 5  Tasks: CRUD + junior /crisp-net tasks sub-tab
Sprint 6  Knowledge replies: threaded UI on /knowledge
Sprint 7  SAC occupancy: /admin/rooms room-now column
Sprint 8  Multi-interviewer PI: /my-requests + confirm_match v4
Sprint 9  Domain enforcement: RPCs + feed filter
Sprint 10 Feedback anonymisation: view update + mentee detail
Sprint 11 Internal mentorship slots: visibility flag + host-sheet toggle
Sprint 12 Tests + E2E pass + STATE.md
```

---

## Iron Rules (unchanged)

1. Seat-claiming is ONE atomic Postgres function. Never read-then-write in JS.
2. All DB schema changes via migrations in supabase/migrations/.
3. RLS ON for every table.
4. Side effects (email) fire AFTER commit via outbox.
5. Mobile-first: verify at 390px.
6. UI components from shadcn registry first.
7. `reviews` table NEVER gets a user_id column.
8. Every feature lands with its test.
