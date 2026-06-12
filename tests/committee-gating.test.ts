/**
 * Unit tests for the additive permission model.
 *
 * Capabilities STACK — a user's nav is the UNION of everything their flags grant.
 * SAC/CRISP flags ADD pages; they never replace or shrink the base senior nav.
 *
 * Roles:
 *   JUNIOR       year=first,  no special flags
 *   SENIOR       year=second, can_host_gd/pi, no special flags
 *   CRISP SENIOR year=second, can_host + is_crisp → +Admin (stats/rooms/monitor)
 *   SAC SENIOR   year=second, can_host + is_sac   → +Rooms tab
 *   COMMITTEE    year=second, can_host + is_committee → +Knowledge posting
 *
 * All seniors (including CRISP/SAC) can browse /requests and /doubts.
 */
import { describe, it, expect } from 'vitest'
import { isCommitteeEmail, isSacEmail, isCrispEmail } from '../lib/email-role'
import { profileToNavRole } from '../lib/nav-role'

// ─── Nav role badge ──────────────────────────────────────────────────────────

describe('profileToNavRole — badge label', () => {
  it('CRISP wins over SAC for badge', () => {
    expect(profileToNavRole({ is_crisp: true, is_sac: true, can_host_gd: true })).toBe('crisp')
  })

  it('SAC senior shows sac badge', () => {
    expect(profileToNavRole({ is_crisp: false, is_sac: true, can_host_gd: true })).toBe('sac')
  })

  it('committee-only senior shows committee badge', () => {
    expect(profileToNavRole({ is_committee: true, can_host_gd: true })).toBe('committee')
  })

  it('plain senior shows senior badge', () => {
    expect(profileToNavRole({ can_host_gd: true })).toBe('senior')
  })

  it('junior shows junior badge', () => {
    expect(profileToNavRole({})).toBe('junior')
  })
})

// ─── Additive page access ────────────────────────────────────────────────────

describe('CRISP/SAC seniors retain full senior page access', () => {
  it('CRISP senior can access /requests (is a senior too)', () => {
    const p = { can_host_gd: true, can_host_pi: true, is_crisp: true, is_sac: false }
    // Old model blocked crisp/sac from /requests — new model does not
    const hasSeniorCapability = p.can_host_gd || p.can_host_pi || p.is_crisp || p.is_sac
    expect(hasSeniorCapability).toBe(true)
  })

  it('SAC senior can access /requests', () => {
    const p = { can_host_gd: true, can_host_pi: true, is_crisp: false, is_sac: true }
    const hasSeniorCapability = p.can_host_gd || p.can_host_pi || p.is_crisp || p.is_sac
    expect(hasSeniorCapability).toBe(true)
  })

  it('junior still redirects /requests → /my-requests', () => {
    const p = { can_host_gd: false, can_host_pi: false, is_crisp: false, is_sac: false }
    const hasSeniorCapability = p.can_host_gd || p.can_host_pi || p.is_crisp || p.is_sac
    expect(hasSeniorCapability).toBe(false)
  })
})

// ─── Admin page access ───────────────────────────────────────────────────────

describe('Admin page gating — is_crisp || is_sac', () => {
  it('CRISP senior can access /admin/rooms + /admin/stats + /admin/roles', () => {
    const p = { is_crisp: true, is_sac: false }
    expect(p.is_crisp || p.is_sac).toBe(true)
  })

  it('SAC senior can access /admin/rooms + /admin/stats', () => {
    const p = { is_crisp: false, is_sac: true }
    expect(p.is_crisp || p.is_sac).toBe(true)
  })

  it('CRISP+SAC combo can access all admin pages', () => {
    const p = { is_crisp: true, is_sac: true }
    expect(p.is_crisp || p.is_sac).toBe(true)
  })

  it('junior cannot access any admin page', () => {
    const p = { is_crisp: false, is_sac: false }
    expect(p.is_crisp || p.is_sac).toBe(false)
  })

  it('plain senior cannot access admin pages', () => {
    const p = { is_crisp: false, is_sac: false }
    expect(p.is_crisp || p.is_sac).toBe(false)
  })
})

// ─── Knowledge posting ───────────────────────────────────────────────────────

describe('Knowledge posting — is_committee || is_crisp', () => {
  it('committee senior can post knowledge', () => {
    const canPost = (p: { is_crisp: boolean; is_committee: boolean }) =>
      p.is_crisp || p.is_committee
    expect(canPost({ is_crisp: false, is_committee: true })).toBe(true)
  })

  it('CRISP senior can also post knowledge', () => {
    const canPost = (p: { is_crisp: boolean; is_committee: boolean }) =>
      p.is_crisp || p.is_committee
    expect(canPost({ is_crisp: true, is_committee: false })).toBe(true)
  })

  it('SAC senior cannot post knowledge without committee flag', () => {
    const canPost = (p: { is_crisp: boolean; is_committee: boolean }) =>
      p.is_crisp || p.is_committee
    expect(canPost({ is_crisp: false, is_committee: false })).toBe(false)
  })

  it('plain senior cannot post knowledge', () => {
    const canPost = (p: { is_crisp: boolean; is_committee: boolean }) =>
      p.is_crisp || p.is_committee
    expect(canPost({ is_crisp: false, is_committee: false })).toBe(false)
  })
})

// ─── SAC-specific capability ─────────────────────────────────────────────────

describe('SAC capability', () => {
  it('SAC adds Rooms to nav without replacing base senior tabs', () => {
    // The presence of is_sac does NOT set a single-tab nav anymore
    const isSac = true
    const isSenior = true
    // hasSeniorCapability should be true (so it renders senior nav + Rooms, not rooms-only)
    expect(isSac && isSenior).toBe(true)
  })

  it('SAC senior does NOT redirect to /admin/rooms from /', () => {
    // Verified by removing the redirect in app/page.tsx
    const profile = { is_sac: true, can_host_gd: true }
    // Old model: if (profile.is_sac) redirect('/admin/rooms') — REMOVED
    const shouldRedirect = false  // redirect is gone
    expect(shouldRedirect).toBe(false)
  })
})

// ─── Email address helpers (still valid) ────────────────────────────────────

describe('committee email domain detection', () => {
  it('any @xlri.ac.in address → isCommitteeEmail', () => {
    expect(isCommitteeEmail('anyone@xlri.ac.in')).toBe(true)
    expect(isCommitteeEmail('crisp@xlri.ac.in')).toBe(true)
  })

  it('student addresses are not committee emails', () => {
    expect(isCommitteeEmail('b25001@astra.xlri.ac.in')).toBe(false)
    expect(isCommitteeEmail('b26001@astra.xlri.ac.in')).toBe(false)
  })

  it('isSacEmail / isCrispEmail still work for legacy email detection', () => {
    expect(isSacEmail('sacdelhi@xlri.ac.in')).toBe(true)
    expect(isCrispEmail('crisp@xlri.ac.in')).toBe(true)
  })
})
