Run in order:
1. npx tsc --noEmit (typecheck — zero errors required)
2. npx eslint . (lint — zero errors required)
3. npm test (full test suite — all passing)
4. Use Playwright MCP to walk the core journey at 390×844 mobile viewport:
   - Browse the slots feed
   - Join a slot (confirm or waitlist)
   - View attendance QR
   - Submit feedback (if judge)
5. Screenshot each screen and report any visual issues against the design system in docs/SPEC.md Part C.
Report: pass/fail per check, screenshots, concrete list of anything that needs fixing.
