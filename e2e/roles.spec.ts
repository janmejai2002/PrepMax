/**
 * E2E QA — all 4 roles at 390 px (mobile-first).
 *
 * Run against live Vercel:
 *   $env:PLAYWRIGHT_BASE_URL="https://prep-max-alpha.vercel.app"; npx playwright test e2e/roles.spec.ts
 *
 * Each describe block logs in via /dev-login, navigates every accessible
 * route for that role, and asserts correct content + access control.
 * No writes to the DB — read-only flow assertions only.
 */
import { test, expect, type Page } from '@playwright/test'

// ── helpers ──────────────────────────────────────────────────────────────────

/**
 * Log in via the /dev-login quick-persona buttons.
 * Waits for the page to fully hydrate (networkidle) so client components mount.
 */
async function devLogin(page: Page, label: string) {
  await page.goto('/dev-login')
  await expect(page.getByText('Test login')).toBeVisible()
  await page.getByRole('button', { name: label }).click()
  // Wait for redirect AND client hydration (nav + header render after JS loads)
  await page.waitForURL(/\/(admin\/rooms|profile|knowledge|doubts|\?.*)?$/, { timeout: 25_000 })
  await page.waitForLoadState('networkidle')
}

/** Assert bottom-nav has exactly these tab labels (any order). */
async function expectNavTabs(page: Page, labels: string[]) {
  // The BottomNav is the only <nav> on the page; wait for it to hydrate
  const nav = page.locator('nav')
  await expect(nav).toBeVisible()
  for (const label of labels) {
    await expect(nav.getByText(label, { exact: true })).toBeVisible()
  }
}

/** Assert a tab label is NOT in the bottom nav. */
async function expectNoNavTab(page: Page, label: string) {
  const nav = page.locator('nav')
  await expect(nav.getByText(label, { exact: true })).not.toBeVisible()
}

/** Navigate to a route and assert no error page is shown. */
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
    // Junior gets: Feed, Requests, Knowledge, Doubts
    await expectNavTabs(page, ['Feed', 'Requests', 'Knowledge', 'Doubts'])
    await expectNoNavTab(page, 'Admin')
    // No "Host a slot" FAB
    await expect(page.getByRole('button', { name: /host a slot/i })).not.toBeVisible()
  })

  test('Requests tab navigates to /my-requests', async ({ page }) => {
    await page.locator('nav').getByText('Requests', { exact: true }).click()
    await page.waitForURL('/my-requests')
    await page.waitForLoadState('networkidle')
    // The post-request form heading or CTA
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
    await devLogin(page, 'Senior (host)')
    await expect(page).toHaveURL('/')
  })

  test('home feed loads + Host FAB + correct nav tabs', async ({ page }) => {
    await expectNavTabs(page, ['Feed', 'Requests', 'Knowledge', 'Doubts'])
    await expectNoNavTab(page, 'Admin')
    // Senior (can_host_gd=true) sees the Host FAB
    await expect(page.getByRole('button', { name: /host a slot/i })).toBeVisible()
  })

  test('Requests tab navigates to /requests (senior feed)', async ({ page }) => {
    await page.locator('nav').getByText('Requests', { exact: true }).click()
    await page.waitForURL('/requests')
    await page.waitForLoadState('networkidle')
    // Senior feed shows available/interested toggle area
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
    // Senior (isSenior=true) has canJoinSlots=false — join buttons absent
    const joinBtn = page.getByRole('button', { name: /^join$/i }).first()
    await expect(joinBtn).not.toBeVisible()
  })
})

// ── CRISP (is_crisp=true) ─────────────────────────────────────────────────────

test.describe('CRISP committee (crisp@xlri.ac.in)', () => {
  test.beforeEach(async ({ page }) => {
    await devLogin(page, 'CRISP committee')
  })

  test('home feed + Admin tab + no Doubts tab', async ({ page }) => {
    await expect(page).toHaveURL('/')
    await expectNavTabs(page, ['Feed', 'Requests', 'Knowledge', 'Admin'])
    await expectNoNavTab(page, 'Doubts')
  })

  test('Admin tab navigates to /admin/stats', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await page.locator('nav').getByText('Admin', { exact: true }).click()
    await page.waitForURL('/admin/stats')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText(/crisp dashboard|daily stats/i).first()).toBeVisible()
  })

  test('/admin/rooms loads room list', async ({ page }) => {
    await page.goto('/admin/rooms')
    await expect(page).toHaveURL('/admin/rooms')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { name: /rooms/i })).toBeVisible()
  })

  test('/crisp-monitor loads mentee monitor', async ({ page }) => {
    await page.goto('/crisp-monitor')
    await expect(page).toHaveURL('/crisp-monitor')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText(/mentee monitor/i)).toBeVisible()
  })

  test('/mentor loads junior overview', async ({ page }) => {
    await page.goto('/mentor')
    await expect(page).toHaveURL('/mentor')
    await page.waitForLoadState('networkidle')
    // CRISP can see All Juniors or My Mentees
    await expect(page.getByText(/junior|mentee/i).first()).toBeVisible()
  })

  test('/admin/roles loads role management', async ({ page }) => {
    await page.goto('/admin/roles')
    await expect(page).toHaveURL('/admin/roles')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('Role Management')).toBeVisible()
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

// ── SAC ───────────────────────────────────────────────────────────────────────

test.describe('SAC (sacdelhi@xlri.ac.in)', () => {
  test.beforeEach(async ({ page }) => {
    await devLogin(page, 'SAC')
    // SAC is redirected from / to /admin/rooms immediately
    await expect(page).toHaveURL('/admin/rooms')
  })

  test('/ immediately redirects to /admin/rooms', async ({ page }) => {
    // Already asserted in beforeEach — add a re-check
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL('/admin/rooms')
  })

  test('/admin/rooms shows room management heading', async ({ page }) => {
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { name: /rooms/i })).toBeVisible()
  })

  test('nav has only the Rooms tab (single-tab pill)', async ({ page }) => {
    await page.waitForLoadState('networkidle')
    await expectNavTabs(page, ['Rooms'])
    await expectNoNavTab(page, 'Feed')
    await expectNoNavTab(page, 'Knowledge')
    await expectNoNavTab(page, 'Admin')
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

  test('non-CRISP pages redirect away', async ({ page }) => {
    // SAC doesn't have is_crisp=true, so crisp-only pages should be inaccessible
    await page.goto('/crisp-monitor')
    await page.waitForLoadState('networkidle')
    await expect(page).not.toHaveURL(/\/crisp-monitor/)
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

  test('/dev-login shows all 4 persona buttons', async ({ page }) => {
    await page.goto('/dev-login')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('button', { name: 'Junior' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Senior (host)' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'CRISP committee' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'SAC' })).toBeVisible()
  })

  test('unauthenticated / → redirects to /login', async ({ page }) => {
    // Fresh browser context = no auth cookies → should redirect to login
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
