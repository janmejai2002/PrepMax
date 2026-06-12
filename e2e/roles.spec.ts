/**
 * E2E QA — all 5 personas at 390 px (mobile-first).
 *
 * Run against live Vercel:
 *   $env:PLAYWRIGHT_BASE_URL="https://prep-max-alpha.vercel.app"; npx playwright test e2e/roles.spec.ts
 *
 * Additive permission model: capabilities STACK.
 * SAC/CRISP are layered on senior accounts — they add tabs, never replace them.
 */
import { test, expect, type Page } from '@playwright/test'

// ── helpers ──────────────────────────────────────────────────────────────────

async function devLogin(page: Page, label: string) {
  await page.goto('/dev-login')
  await expect(page.getByText('Test login')).toBeVisible()
  await page.getByRole('button', { name: label }).click()
  await page.waitForURL(/\/(admin\/rooms|admin\/stats|profile|knowledge|doubts|\?.*)?$/, { timeout: 25_000 })
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
    await expect(page).toHaveURL('/')
  })

  test('home feed loads + correct nav tabs', async ({ page }) => {
    await expectNavTabs(page, ['Feed', 'Requests', 'Knowledge', 'Doubts'])
    await expectNoNavTab(page, 'Admin')
    await expectNoNavTab(page, 'Rooms')
    await expect(page.getByRole('button', { name: /host a slot/i })).not.toBeVisible()
  })

  test('Requests tab navigates to /my-requests', async ({ page }) => {
    await page.locator('nav').getByText('Requests', { exact: true }).click()
    await page.waitForURL('/my-requests')
    await page.waitForLoadState('networkidle')
    await expect(
      page.getByText(/practice request|my requests|post a request/i).first()
    ).toBeVisible()
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
})

// ── SENIOR ───────────────────────────────────────────────────────────────────

test.describe('Senior (b25001)', () => {
  test.beforeEach(async ({ page }) => {
    await devLogin(page, 'Senior')
    await expect(page).toHaveURL('/')
  })

  test('home feed loads + Host FAB + correct nav tabs', async ({ page }) => {
    // Senior base nav: Feed | Requests | Doubts | Knowledge
    await expectNavTabs(page, ['Feed', 'Requests', 'Doubts', 'Knowledge'])
    await expectNoNavTab(page, 'Admin')
    await expectNoNavTab(page, 'Rooms')
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
})

// ── CRISP SENIOR (b25002) ─────────────────────────────────────────────────────

test.describe('CRISP Senior (b25002)', () => {
  test.beforeEach(async ({ page }) => {
    await devLogin(page, 'CRISP Senior')
    await expect(page).toHaveURL('/')
  })

  test('home feed loads + additive nav (Feed/Requests/Doubts/Admin)', async ({ page }) => {
    // CRISP senior sees base senior tabs + Admin tab (additive)
    await expectNavTabs(page, ['Feed', 'Requests', 'Doubts', 'Admin'])
    await expectNoNavTab(page, 'Rooms')  // rooms accessible via Admin sub-nav
    await expect(page.getByRole('button', { name: /host a slot/i })).toBeVisible()
  })

  test('Admin tab navigates to /admin/stats', async ({ page }) => {
    await page.locator('nav').getByText('Admin', { exact: true }).click()
    await page.waitForURL('/admin/stats')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText(/crisp dashboard|daily stats/i).first()).toBeVisible()
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

  test('/crisp-monitor loads mentee monitor', async ({ page }) => {
    await assertPageLoads(page, '/crisp-monitor', /mentee monitor/i)
  })

  test('/mentor loads junior overview', async ({ page }) => {
    await page.goto('/mentor')
    await expect(page).toHaveURL('/mentor')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText(/junior|mentee/i).first()).toBeVisible()
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
    // SAC is NO LONGER redirected from / — they land on the feed like any senior
    await expect(page).toHaveURL('/')
  })

  test('/ stays on feed (no redirect to /admin/rooms)', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL('/')
  })

  test('home feed loads + additive nav (Feed/Requests/Doubts/Rooms)', async ({ page }) => {
    // SAC senior sees base senior tabs + Rooms tab (additive, NOT rooms-only)
    await expectNavTabs(page, ['Feed', 'Requests', 'Doubts', 'Rooms'])
    await expectNoNavTab(page, 'Admin')
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

  test('/crisp-monitor is CRISP-only → redirected away', async ({ page }) => {
    await page.goto('/crisp-monitor')
    await page.waitForLoadState('networkidle')
    await expect(page).not.toHaveURL(/\/crisp-monitor/)
  })
})

// ── COMMITTEE SENIOR (b25004) ────────────────────────────────────────────────

test.describe('Committee Senior (b25004)', () => {
  test.beforeEach(async ({ page }) => {
    await devLogin(page, 'Committee Senior')
    await expect(page).toHaveURL('/')
  })

  test('home feed loads + senior nav with Knowledge tab', async ({ page }) => {
    // Committee senior: base senior tabs (Feed/Requests/Doubts) + Knowledge (for posting)
    await expectNavTabs(page, ['Feed', 'Requests', 'Doubts', 'Knowledge'])
    await expectNoNavTab(page, 'Admin')
    await expectNoNavTab(page, 'Rooms')
    await expect(page.getByRole('button', { name: /host a slot/i })).toBeVisible()
  })

  test('/knowledge loads and shows post form', async ({ page }) => {
    await page.goto('/knowledge')
    await expect(page).toHaveURL('/knowledge')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { name: /knowledge/i })).toBeVisible()
    // Committee senior should see the Post button / form
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
