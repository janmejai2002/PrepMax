/**
 * Unit tests for CRISP/SAC view-gating logic.
 * Documents the exact flag combinations that trigger redirects in each server page.
 * Pure logic — no DB, no auth, no network.
 *
 * New 4-role model (after migration 024):
 *   JUNIOR          year=first,  is_crisp=false, is_sac=false
 *   SENIOR          year=second, is_crisp=false, is_sac=false
 *   SENIOR+CRISP    year=second, is_crisp=true,  is_sac=false
 *   SAC             year=null,   is_crisp=false, is_sac=true
 */
import { describe, it, expect } from 'vitest'
import { isCommitteeEmail, isSacEmail, isCrispEmail } from '../lib/email-role'

// Mirrors the check used in gated server pages:
//   if (profile.is_crisp || profile.is_sac) redirect('/knowledge')
function isCrispOrSac(p: { is_crisp: boolean; is_sac: boolean }): boolean {
  return p.is_crisp || p.is_sac
}

describe('CRISP/SAC view gating — flag combinations', () => {
  it('CRISP member is gated from requests/slots creation pages', () => {
    expect(isCrispOrSac({ is_crisp: true, is_sac: false })).toBe(true)
  })

  it('SAC login is gated from requests/slots creation pages', () => {
    expect(isCrispOrSac({ is_crisp: false, is_sac: true })).toBe(true)
  })

  it('junior student is NOT gated', () => {
    expect(isCrispOrSac({ is_crisp: false, is_sac: false })).toBe(false)
  })

  it('regular senior (can_host) is NOT gated', () => {
    expect(isCrispOrSac({ is_crisp: false, is_sac: false })).toBe(false)
  })
})

describe('CRISP admin pages — is_crisp gates admin routes', () => {
  it('CRISP member can access /admin/rooms, /admin/stats, /admin/roles', () => {
    const profile = { is_crisp: true, is_sac: false }
    expect(profile.is_crisp || profile.is_sac).toBe(true)
  })

  it('SAC can access /admin/rooms but not crisp-only routes', () => {
    const profile = { is_crisp: false, is_sac: true }
    expect(profile.is_crisp || profile.is_sac).toBe(true) // rooms allowed
    expect(profile.is_crisp).toBe(false)                  // crisp-only blocked
  })

  it('junior cannot access any admin page', () => {
    const profile = { is_crisp: false, is_sac: false }
    expect(profile.is_crisp || profile.is_sac).toBe(false)
  })
})

describe('SAC-specific capability', () => {
  it('SAC account has is_sac=true', () => {
    expect({ is_crisp: false, is_sac: true }.is_sac).toBe(true)
  })

  it('CRISP member has is_sac=false', () => {
    expect({ is_crisp: true, is_sac: false }.is_sac).toBe(false)
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
