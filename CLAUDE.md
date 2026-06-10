# PrepMax — Claude Code Project Memory

## What this is
Mobile-first placement-prep platform for a Tier-1 Indian B-school.
Seniors host GD/PI practice slots; juniors compete to join; CRISP committee admins.
Full spec: docs/SPEC.md (permanent source of truth). Current state: docs/STATE.md. Decisions: docs/DECISIONS.md.

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
- End every session: update docs/STATE.md (what's done, what's in flight, exact next step), commit everything, push.
- The human is non-technical. Explain choices in one plain sentence, never paragraphs of jargon.
- When the human's request conflicts with an Iron Rule, say so and propose the compliant version.

## Session 0 status
Bootstrap complete. All files created. Next: complete MCP OAuth (Supabase + GitHub), finish scaffold, push to GitHub.
