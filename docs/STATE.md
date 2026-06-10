# PrepMax — Living State Document

> **Update this at the end of every session.** This file is what makes multi-session vibe coding work.

---

## Current Phase
**Phase 0 — Bootstrap (Part A)**

## Status

| Item | Status | Notes |
|---|---|---|
| CLAUDE.md | ✅ Done | Project root |
| docs/SPEC.md | ✅ Done | Permanent spec |
| docs/STATE.md | ✅ Done | This file |
| docs/DECISIONS.md | ✅ Done | Seeded |
| .mcp.json | ✅ Done | All 5 servers configured |
| Supabase MCP auth | ⚠️ Needs OAuth | Human must complete at mcp.supabase.com |
| GitHub MCP auth | ⚠️ Needs OAuth | Human must complete GitHub OAuth |
| shadcn MCP | ✅ Configured | npx shadcn@latest mcp |
| Context7 MCP | ✅ Configured | Remote HTTP |
| Playwright MCP | ✅ Configured | npx @playwright/mcp@latest |
| Slash commands | ✅ Done | /resume /wrap /ship-check /stress /ui-review |
| .claude/settings.json | ✅ Done | Hooks + permissions |
| Next.js scaffold | 🔨 In progress | create-next-app → shadcn init |
| Vitest | ⏭ Next | After scaffold |
| Playwright install | ⏭ Next | After scaffold |
| GitHub repo | ⏭ Next | After GitHub MCP OAuth |
| Vercel connection | ⏭ Next | After GitHub repo |
| Seed script | ⏭ Next | Phase 1 |

## In-Progress
Running Next.js scaffold with TypeScript + Tailwind + App Router.

## Exact Next Step
1. Complete Supabase OAuth: run `! claude mcp add --transport http supabase https://mcp.supabase.com/mcp` then follow browser prompt
2. Complete GitHub OAuth: run `! claude mcp add --transport http github https://api.githubcopilot.com/mcp/` then follow browser prompt
3. Finish scaffold and push first commit

## Known Issues / Blockers
- Supabase MCP needs human OAuth (one browser click)
- GitHub MCP needs human OAuth (one browser click)

## Session Log
| Date | What happened |
|---|---|
| 2026-06-10 | Session 0: Bootstrap. Created CLAUDE.md, docs, slash commands, settings, .mcp.json, starting scaffold. |
