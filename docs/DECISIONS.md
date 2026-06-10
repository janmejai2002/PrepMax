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

## Open Decisions (to surface at the relevant phase)

1. **Auth domain restriction** (Phase 1): Restrict signups to institute Google domain? → Ask Janmejai
2. **Waitlist promotion** (Phase 2): Automatic vs host-approves? → Recommendation: automatic
3. **Fairness mode** (Phase 2): Lottery window on/off by default per slot type? → Recommendation: OFF
4. **No-show penalty** (Phase 6): Visibility-only vs cooldown? → Ask Janmejai
5. **Review release cadence** (Phase 6): Weekly batch vs N≥3 threshold? → Ask Janmejai
6. **Speaking-time tally** (Phase 3): Keep or cut after first real GD? → Ask Janmejai
