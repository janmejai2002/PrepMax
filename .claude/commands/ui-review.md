Usage: /ui-review <route>  (e.g. /ui-review /slots)

Using Playwright MCP:
1. Open the given route at 390×844 viewport (mobile)
2. Take a full-page screenshot
3. Critique against the design system in docs/SPEC.md Part C:
   - Hierarchy and spacing (8-pt grid, generous whitespace)
   - GD=indigo / PI=amber identity tokens applied correctly
   - Status colors: confirmed=green, waitlist=amber, full/cancelled=muted red, live=pulsing dot
   - Bottom tab bar present and in thumb zone
   - All primary actions in bottom 40% of screen
   - Touch targets ≥44px
   - Dark mode renders correctly
   - Empty/loading/error states designed (not default browser)
   - Skeleton loaders on feeds (not spinners)
4. List concrete fixes needed (numbered)
5. For each fix: ask for approval before applying, then apply and re-screenshot to confirm
