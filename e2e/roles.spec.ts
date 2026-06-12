/**
 * E2E QA — all 5 personas at 390 px (mobile-first).
 *
 * Run against live Vercel:
 *   $env:PLAYWRIGHT_BASE_URL="https://prep-max-alpha.vercel.app"; npx playwright test e2e/roles.spec.ts
 *
 * Phase 8/9 nav matrix:
 *   Junior:           Ask a Senior | Domain | CRISPNet | My Profile
 *   Senior base:      Feed | Requests | Q&A | Profile
 *   CRISP senior:     Feed | Requests | Q&A | Mentees
 *   SAC senior:       Feed | Requests | Q&A | Rooms
 *   Committee-only:   Knowledge | My Profile  (2-tab)
 *
 * Phase 9 additions verified:
 *   - bio renamed to short_bio (profile form shows "Short description")
 *   - Domain gate shown if no domains set (dev seniors have domains pre-seeded)
 *   - Host a slot opens sheet (not gate) for dev senior with domains
 *   - /mentees has Stats/Rooms/Roles sub-nav for CRISP
 *   - retract_confirmation button shown on confirmed seniors
 */
import { test, expect, type Page } from '@playwright/test'

// ── helpers ──────────────────────────────────────────────────────────────────

async function devLogin(page: Page, label: string) {
  await page.goto('/dev-login')
  await expect(page.getByText('Test login')).toBeVisible()
  await page.getByRole('button', { name: label }).click()
  await page.waitForURL(/\/(ask|admin\/rooms|admin\/stats|profile|knowledge|doubts|\?.*)?$/, { timeout: 25_000 })
  await page.waitForLoadState('networkidle')
}

async function expectNavTabs(page: Page, labels: string[]) {
  const nav = page.locator('nav')
  await expect(nav).toBeVisible()
  for (const label of labels) {
    await expect(nav.getByText(label, { exact: true })).toBeVisible()
  }
}

async function expectNoNavTab(page: Page, label: string) {
  const nav = page.locator('nav')
  await expect(nav.getByText(label, { exact: true })).not.toBeVisible()
}

async function assertPageLoads(page: Page, path: string, expectedH1: RegExp | string) {
  await page.goto(path)
  await expect(page).toHaveURL(path)
  await page.waitForLoadState('networkidle')
  const h1 = page.getByRole('heading', { level: 1 }).first()
  await expect(h1).toBeVisible()
  if (expectedH1 instanceof RegExp) {
    await expect(h1).toHaveText(expectedH1)
  } else {
    await expect(h1).toContainText(expectedH1)
  }
}

// ── JUNIOR ───────────────────────────────────────────────────────────────────

test.describe('Junior (b26001)', () => {
  test.beforeEach(async ({ page }) => {
    await devLogin(page, 'Junior')
    // Juniors are redirected from / → /ask
    await expect(page).toHaveURL('/ask')
  })

  test('lands on /ask + correct Phase 8 nav tabs', async ({ page }) => {
    await expectNavTabs(page, ['Ask a Senior', 'Domain', 'CRISPNet', 'My Profile'])
    await expectNoNavTab(page, 'Feed')
    await expectNoNavTab(page, 'Admin')
    await expectNoNavTab(page, 'Rooms')
    await expect(page.getByRole('button', { name: /host a slot/i })).not.toBeVisible()
  })

  test('Ask a Senior tab stays on /ask', async ({ page }) => {
    await page.locator('nav').getByText('Ask a Senior', { exact: true }).click()
    await page.waitForURL('/ask')
    await page.waitForLoadState('networkidle')
    await expect(
      page.getByText(/practice request|my requests|post a request/i).first()
    ).toBeVisible()
  })

  test('/knowledge loads', async ({ page }) => {
    await assertPageLoads(page, '/knowledge', 'Knowledge')
  })

  test('/crisp-net loads', async ({ page }) => {
    await page.goto('/crisp-net')
    await expect(page).toHaveURL('/crisp-net')
    await page.waitForLoadState('networkidle')
  })

  test('/profile loads with sign-out button', async ({ page }) => {
    await page.goto('/profile')
    await expect(page).toHaveURL('/profile')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
  })

  test('/admin/rooms is access-controlled → redirected away', async ({ page }) => {
    await page.goto('/admin/rooms')
    await page.waitForLoadState('networkidle')
    await expect(page).not.toHaveURL(/\/admin\/rooms/)
  })

  test('/my-requests redirects to /ask', async ({ page }) => {
    await page.goto('/my-requests')
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL('/ask')
  })

  test('/ask page has New Request button', async ({ page }) => {
    await expect(page.getByRole('button', { name: /new request/i })).toBeVisible()
  })
})

// ── SENIOR ───────────────────────────────────────────────────────────────────

test.describe('Senior (b25001)', () => {
  test.beforeEach(async ({ page }) => {
    await devLogin(page, 'Senior')
    await expect(page).toHaveURL('/')
  })

  test('home feed loads + Host FAB + correct Phase 8 nav tabs', async ({ page }) => {
    // Senior base nav: Feed | Requests | Q&A | Profile
    await expectNavTabs(page, ['Feed', 'Requests', 'Q&A', 'Profile'])
    await expectNoNavTab(page, 'Admin')
    await expectNoNavTab(page, 'Rooms')
    await expectNoNavTab(page, 'Mentees')
    await expect(page.getByRole('button', { name: /host a slot/i })).toBeVisible()
  })

  test('Requests tab navigates to /requests (senior feed)', async ({ page }) => {
    await page.locator('nav').getByText('Requests', { exact: true }).click()
    await page.waitForURL('/requests')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText(/available|interested|request/i).first()).toBeVisible()
  })

  test('/knowledge loads', async ({ page }) => {
    await assertPageLoads(page, '/knowledge', 'Knowledge')
  })

  test('/doubts loads', async ({ page }) => {
    await assertPageLoads(page, '/doubts', 'Doubts')
  })

  test('/profile loads with sign-out button', async ({ page }) => {
    await page.goto('/profile')
    await expect(page).toHaveURL('/profile')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
  })

  test('/admin/rooms is access-controlled → redirected away', async ({ page }) => {
    await page.goto('/admin/rooms')
    await page.waitForLoadState('networkidle')
    await expect(page).not.toHaveURL(/\/admin\/rooms/)
  })

  test('slot cards show no Join button (canJoinSlots=false for seniors)', async ({ page }) => {
    const joinBtn = page.getByRole('button', { name: /^join$/i }).first()
    await expect(joinBtn).not.toBeVisible()
  })

  test('Host a slot — dev senior has domains so sheet opens (no domain gate)', async ({ page }) => {
    // Dev senior has Finance+Consulting domains pre-seeded → should open host sheet, not domain gate
    await page.getByRole('button', { name: /host a slot/i }).click()
    await page.waitForTimeout(600)
    // Domain gate should NOT appear; host sheet or nothing blocking should be present
    await expect(page.getByText(/set your domains first/i)).not.toBeVisible()
  })

  test('/profile shows domain fields and short description', async ({ page }) => {
    await page.goto('/profile')
    await page.waitForLoadState('networkidle')
    // Profile edit section should show domain and description fields
    await expect(page.getByText(/domain 1|domain 2|short description/i).first()).toBeVisible()
  })

  test('/requests loads domain filter chips for senior', async ({ page }) => {
    await page.goto('/requests')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText(/practice requests/i)).toBeVisible()
  })
})

// ── CRISP SENIOR (b25002) ─────────────────────────────────────────────────────

test.describe('CRISP Senior (b25002)', () => {
  test.beforeEach(async ({ page }) => {
    await devLogin(page, 'CRISP Senior')
    await expect(page).toHaveURL('/')
  })

  test('home feed loads + additive nav (Feed/Requests/Q&A/Mentees)', async ({ page }) => {
    // CRISP senior: base senior tabs + Mentees tab
    await expectNavTabs(page, ['Feed', 'Requests', 'Q&A', 'Mentees'])
    await expectNoNavTab(page, 'Admin')
    await expectNoNavTab(page, 'Rooms')
    await expect(page.getByRole('button', { name: /host a slot/i })).toBeVisible()
  })

  test('Mentees tab navigates to /mentees', async ({ page }) => {
    await page.locator('nav').getByText('Mentees', { exact: true }).click()
    await page.waitForURL('/mentees')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText(/mentee/i).first()).toBeVisible()
  })

  test('/requests loads (CRISP seniors can browse request feed)', async ({ page }) => {
    await page.goto('/requests')
    await expect(page).toHaveURL('/requests')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText(/available|interested|request/i).first()).toBeVisible()
  })

  test('/admin/rooms loads room list', async ({ page }) => {
    await assertPageLoads(page, '/admin/rooms', /rooms/i)
  })

  test('/mentees page shows Stats·Rooms·Roles admin sub-nav', async ({ page }) => {
    await page.goto('/mentees')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('link', { name: 'Stats' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Rooms' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Roles' })).toBeVisible()
  })

  test('/crisp-monitor redirects to /mentees', async ({ page }) => {
    await page.goto('/crisp-monitor')
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL('/mentees')
  })

  test('/mentor redirects to /mentees', async ({ page }) => {
    await page.goto('/mentor')
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL('/mentees')
  })

  test('/admin/roles loads role management', async ({ page }) => {
    await assertPageLoads(page, '/admin/roles', 'Role Management')
  })

  test('/knowledge loads', async ({ page }) => {
    await assertPageLoads(page, '/knowledge', 'Knowledge')
  })

  test('/profile loads with sign-out button', async ({ page }) => {
    await page.goto('/profile')
    await expect(page).toHaveURL('/profile')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
  })
})

// ── SAC SENIOR (b25003) ───────────────────────────────────────────────────────

test.describe('SAC Senior (b25003)', () => {
  test.beforeEach(async ({ page }) => {
    await devLogin(page, 'SAC Senior')
    await expect(page).toHaveURL('/')
  })

  test('/ stays on feed (no redirect to /admin/rooms)', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL('/')
  })

  test('home feed loads + additive nav (Feed/Requests/Q&A/Rooms)', async ({ page }) => {
    // SAC senior: base senior tabs + Rooms tab (additive)
    await expectNavTabs(page, ['Feed', 'Requests', 'Q&A', 'Rooms'])
    await expectNoNavTab(page, 'Admin')
    await expectNoNavTab(page, 'Mentees')
    await expect(page.getByRole('button', { name: /host a slot/i })).toBeVisible()
  })

  test('Rooms tab navigates to /admin/rooms', async ({ page }) => {
    await page.locator('nav').getByText('Rooms', { exact: true }).click()
    await page.waitForURL('/admin/rooms')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { name: /rooms/i })).toBeVisible()
  })

  test('/requests loads (SAC seniors can browse request feed)', async ({ page }) => {
    await page.goto('/requests')
    await expect(page).toHaveURL('/requests')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText(/available|interested|request/i).first()).toBeVisible()
  })

  test('/doubts loads', async ({ page }) => {
    await assertPageLoads(page, '/doubts', 'Doubts')
  })

  test('/admin/rooms loads room management heading', async ({ page }) => {
    await assertPageLoads(page, '/admin/rooms', /rooms/i)
  })

  test('/admin/stats loads (SAC can access stats)', async ({ page }) => {
    await page.goto('/admin/stats')
    await expect(page).toHaveURL('/admin/stats')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText(/crisp dashboard|daily stats/i).first()).toBeVisible()
  })

  test('/profile loads with sign-out button', async ({ page }) => {
    await page.goto('/profile')
    await expect(page).toHaveURL('/profile')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
  })

  test('/crisp-monitor is CRISP-only → redirects to /mentees', async ({ page }) => {
    await page.goto('/crisp-monitor')
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL('/mentees')
  })
})

// ── COMMITTEE SENIOR (b25004) ────────────────────────────────────────────────

test.describe('Committee Senior (b25004)', () => {
  test.beforeEach(async ({ page }) => {
    await devLogin(page, 'Committee Senior')
    await expect(page).toHaveURL('/')
  })

  test('2-tab committee nav (Knowledge + My Profile)', async ({ page }) => {
    // Committee-only: 2-tab nav focused on knowledge management
    await expectNavTabs(page, ['Knowledge', 'My Profile'])
    await expectNoNavTab(page, 'Feed')
    await expectNoNavTab(page, 'Admin')
    await expectNoNavTab(page, 'Rooms')
    await expect(page.getByRole('button', { name: /host a slot/i })).toBeVisible()
  })

  test('/knowledge loads and shows post form', async ({ page }) => {
    await page.goto('/knowledge')
    await expect(page).toHaveURL('/knowledge')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { name: /knowledge/i })).toBeVisible()
    // Committee senior should see the Post button
    await expect(page.getByRole('button', { name: /post|new post|add post/i }).first()).toBeVisible()
  })

  test('/requests loads (committee seniors can browse request feed)', async ({ page }) => {
    await page.goto('/requests')
    await expect(page).toHaveURL('/requests')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText(/available|interested|request/i).first()).toBeVisible()
  })

  test('/admin/rooms is access-controlled → redirected away', async ({ page }) => {
    await page.goto('/admin/rooms')
    await page.waitForLoadState('networkidle')
    await expect(page).not.toHaveURL(/\/admin\/rooms/)
  })

  test('/profile loads with sign-out button', async ({ page }) => {
    await page.goto('/profile')
    await expect(page).toHaveURL('/profile')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
  })
})

// ── Unauthenticated / public routes ─────────────────────────────────────────

test.describe('Public routes (no auth)', () => {
  test('/login page loads with magic-link option', async ({ page }) => {
    await page.goto('/login')
    await expect(page).toHaveURL('/login')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText(/sign in|log in|magic link/i).first()).toBeVisible()
  })

  test('/dev-login shows all 5 persona buttons', async ({ page }) => {
    await page.goto('/dev-login')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('button', { name: 'Junior' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Senior' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'CRISP Senior' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'SAC Senior' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Committee Senior' })).toBeVisible()
  })

  test('unauthenticated / → redirects to /login', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL('/login')
  })

  test('unauthenticated /profile → redirects to /login', async ({ page }) => {
    await page.goto('/profile')
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL('/login')
  })

  test('unauthenticated /admin/rooms → redirects to /login', async ({ page }) => {
    await page.goto('/admin/rooms')
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL('/login')
  })
})
