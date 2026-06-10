# PrepMax — Living State Document

> **Update this at the end of every session.** This file is what makes multi-session vibe coding work.

---

## Current Phase
**Phase 0 — Bootstrap (Part A) — 95% complete**

## Status

| Item | Status | Notes |
|---|---|---|
| CLAUDE.md | ✅ Done | Project root |
| docs/SPEC.md | ✅ Done | Permanent spec (renamed from Spec.md) |
| docs/STATE.md | ✅ Done | This file |
| docs/DECISIONS.md | ✅ Done | Seeded with 4 initial decisions |
| .mcp.json | ✅ Done | All 5 servers configured |
| Slash commands | ✅ Done | /resume /wrap /ship-check /stress /ui-review |
| .claude/settings.json | ✅ Done | PostToolUse typecheck hook + pre-approved commands |
| Next.js 16 scaffold | ✅ Done | TypeScript + Tailwind + App Router |
| shadcn/ui init | ✅ Done | components.json, button.tsx, lib/utils.ts |
| Vitest | ✅ Done | Smoke test passing |
| Playwright | ✅ Done | Chromium installed, e2e smoke test written |
| GitHub repo | ✅ Done | https://github.com/janmejai2002/PrepMax |
| First commit + push | ✅ Done | `cff6196` |
| Supabase MCP OAuth | ⚠️ Needs human action | Run: `! claude mcp add --transport http supabase https://mcp.supabase.com/mcp` |
| GitHub MCP OAuth | ⚠️ Needs human action | Run: `! claude mcp add --transport http github https://api.githubcopilot.com/mcp/` |
| Vercel deploy | ⚠️ Needs human action | Run: `! vercel login` then go to vercel.com → Import PrepMax repo |
| Supabase project | ⏭ Next session | Create project via Supabase dashboard or MCP after OAuth |
| .env.local | ⏭ Next session | NEXT_PUBLIC_SUPABASE_URL + ANON_KEY after project created |

## In-Progress
Nothing — waiting for human to complete 3 one-time auth steps above.

## Exact Next Steps for Human (do these once, in any order)

### 1. Supabase MCP (required for Phase 1+)
In this Claude Code session, type:
```
! claude mcp add --transport http supabase https://mcp.supabase.com/mcp
```
Follow the browser OAuth prompt. When asked to scope, select or create the PrepMax project.

### 2. GitHub MCP (optional for Phase 0, useful from Phase 1)
In this Claude Code session, type:
```
! claude mcp add --transport http github https://api.githubcopilot.com/mcp/
```
Follow the GitHub OAuth prompt (needs GitHub Copilot access).

### 3. Vercel deploy (so you can review on phone)
Run: `! vercel login` → follow browser prompt  
Then go to **vercel.com → Add New → Project → Import Git Repository → PrepMax**  
This gives you preview URLs on every push that you can open on your phone.

## After Human Completes Auth
Resume with `/resume` — next session will start Phase 1: Auth + identity + rooms.

## Known Issues / Blockers
- None code-side. All blockers are one-time human auth steps listed above.

## Session Log
| Date | What happened |
|---|---|
| 2026-06-10 | Session 0 complete: full bootstrap. Next.js 16 + shadcn + Vitest + Playwright. GitHub repo live. Waiting on Supabase + Vercel auth. |
