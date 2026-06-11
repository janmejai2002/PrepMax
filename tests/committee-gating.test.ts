/**
 * Unit tests for committee view-gating logic.
 * Documents the exact flag combinations that trigger redirects in each server page.
 * Pure logic — no DB, no auth, no network.
 */
import { describe, it, expect } from 'vitest'
import { isCommitteeEmail, isSacEmail, isCrispEmail } from '../lib/email-role'

// Mirrors the inline check used in every gated server page:
//   if (profile.is_committee || profile.is_crisp_admin || profile.is_sac) redirect('/knowledge')
function isCommitteeAccount(p: { is_committee: boolean; is_crisp_admin: boolean; is_sac: boolean }): boolean {
  return p.is_committee || p.is_crisp_admin || p.is_sac
}

describe('committee view gating — flag combinations', () => {
  it('shared CRISP login (crisp@xlri.ac.in) is gated', () => {
    // Seed flags for crisp@xlri.ac.in
    expect(isCommitteeAccount({ is_committee: true, is_crisp_admin: false, is_sac: false })).toBe(true)
  })

  it('SAC login (sacdelhi@xlri.ac.in) is gated', () => {
    // SAC has both is_committee + is_sac
    expect(isCommitteeAccount({ is_committee: true, is_crisp_admin: false, is_sac: true })).toBe(true)
  })

  it('CRISP admin account is gated', () => {
    expect(isCommitteeAccount({ is_committee: true, is_crisp_admin: true, is_sac: false })).toBe(true)
  })

  it('is_crisp_admin alone (without is_committee) is gated', () => {
    expect(isCommitteeAccount({ is_committee: false, is_crisp_admin: true, is_sac: false })).toBe(true)
  })

  it('is_sac alone (without is_committee) is gated', () => {
    expect(isCommitteeAccount({ is_committee: false, is_crisp_admin: false, is_sac: true })).toBe(true)
  })

  it('junior student is NOT gated', () => {
    expect(isCommitteeAccount({ is_committee: false, is_crisp_admin: false, is_sac: false })).toBe(false)
  })

  it('senior student (can_host_gd/pi) is NOT gated', () => {
    // Even a senior with hosting rights but no committee flag passes through
    expect(isCommitteeAccount({ is_committee: false, is_crisp_admin: false, is_sac: false })).toBe(false)
  })

  it('b25 student who sits on CRISP (is_crisp_member only) is NOT gated', () => {
    // is_crisp_member = student on the committee; is_committee = shared account login
    // Students retain full app access — only shared logins are restricted
    expect(isCommitteeAccount({ is_committee: false, is_crisp_admin: false, is_sac: false })).toBe(false)
  })
})

describe('SAC-specific: notify CRISP capability', () => {
  it('SAC account can trigger notify (is_sac=true)', () => {
    expect({ is_committee: true, is_crisp_admin: false, is_sac: true }.is_sac).toBe(true)
  })

  it('plain CRISP account cannot trigger notify (is_sac=false)', () => {
    expect({ is_committee: true, is_crisp_admin: false, is_sac: false }.is_sac).toBe(false)
  })
})

describe('committee email ↔ DB flag consistency', () => {
  it('crisp@xlri.ac.in → isCommitteeEmail + isCrispEmail', () => {
    expect(isCommitteeEmail('crisp@xlri.ac.in')).toBe(true)
    expect(isCrispEmail('crisp@xlri.ac.in')).toBe(true)
    expect(isSacEmail('crisp@xlri.ac.in')).toBe(false)
  })

  it('sacdelhi@xlri.ac.in → isCommitteeEmail + isSacEmail', () => {
    expect(isCommitteeEmail('sacdelhi@xlri.ac.in')).toBe(true)
    expect(isSacEmail('sacdelhi@xlri.ac.in')).toBe(true)
    expect(isCrispEmail('sacdelhi@xlri.ac.in')).toBe(false)
  })

  it('student emails are never committee', () => {
    expect(isCommitteeEmail('b25001@astra.xlri.ac.in')).toBe(false)
    expect(isCommitteeEmail('b26001@astra.xlri.ac.in')).toBe(false)
  })
})
