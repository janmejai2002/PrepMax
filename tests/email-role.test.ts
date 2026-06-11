/**
 * Unit tests for email → year inference.
 * Pure logic — no DB, no auth, no network.
 */
import { describe, it, expect } from 'vitest'
import { inferYearFromEmail, isCommitteeEmail, isSacEmail, isCrispEmail } from '../lib/email-role'

describe('inferYearFromEmail', () => {
  it('b25NNN → second (senior)', () => {
    expect(inferYearFromEmail('b25001@astra.xlri.ac.in')).toBe('second')
    expect(inferYearFromEmail('b25999@astra.xlri.ac.in')).toBe('second')
    expect(inferYearFromEmail('b2500001@astra.xlri.ac.in')).toBe('second')
  })

  it('b26NNN → first (junior)', () => {
    expect(inferYearFromEmail('b26001@astra.xlri.ac.in')).toBe('first')
    expect(inferYearFromEmail('b26999@astra.xlri.ac.in')).toBe('first')
  })

  it('is case-insensitive', () => {
    expect(inferYearFromEmail('B25001@astra.xlri.ac.in')).toBe('second')
    expect(inferYearFromEmail('B26001@ASTRA.XLRI.AC.IN')).toBe('first')
  })

  it('non-batch-pattern xlri emails → null', () => {
    // faculty, staff, old-format addresses
    expect(inferYearFromEmail('faculty@astra.xlri.ac.in')).toBeNull()
    expect(inferYearFromEmail('admin@astra.xlri.ac.in')).toBeNull()
    expect(inferYearFromEmail('b25@astra.xlri.ac.in')).toBeNull()      // no digits
    expect(inferYearFromEmail('b24001@astra.xlri.ac.in')).toBeNull()   // different batch year
    expect(inferYearFromEmail('b27001@astra.xlri.ac.in')).toBeNull()   // future batch
  })

  it('non-xlri emails → null', () => {
    expect(inferYearFromEmail('b25001@gmail.com')).toBeNull()
    expect(inferYearFromEmail('user@example.com')).toBeNull()
    expect(inferYearFromEmail('')).toBeNull()
  })

  it('@xlri.ac.in committee emails → null (no year for committee accounts)', () => {
    expect(inferYearFromEmail('crisp@xlri.ac.in')).toBeNull()
    expect(inferYearFromEmail('sacdelhi@xlri.ac.in')).toBeNull()
    expect(inferYearFromEmail('anyone@xlri.ac.in')).toBeNull()
  })
})

describe('isCommitteeEmail', () => {
  it('any @xlri.ac.in address → true', () => {
    expect(isCommitteeEmail('crisp@xlri.ac.in')).toBe(true)
    expect(isCommitteeEmail('sacdelhi@xlri.ac.in')).toBe(true)
    expect(isCommitteeEmail('anyone@xlri.ac.in')).toBe(true)
  })

  it('case-insensitive', () => {
    expect(isCommitteeEmail('CRISP@XLRI.AC.IN')).toBe(true)
  })

  it('@astra.xlri.ac.in student addresses → false', () => {
    expect(isCommitteeEmail('b25001@astra.xlri.ac.in')).toBe(false)
    expect(isCommitteeEmail('b26001@astra.xlri.ac.in')).toBe(false)
  })

  it('non-xlri addresses → false', () => {
    expect(isCommitteeEmail('user@gmail.com')).toBe(false)
    expect(isCommitteeEmail('')).toBe(false)
  })
})

describe('isSacEmail / isCrispEmail', () => {
  it('isSacEmail matches only sacdelhi@xlri.ac.in', () => {
    expect(isSacEmail('sacdelhi@xlri.ac.in')).toBe(true)
    expect(isSacEmail('SACDELHI@XLRI.AC.IN')).toBe(true)
    expect(isSacEmail('crisp@xlri.ac.in')).toBe(false)
    expect(isSacEmail('sac@xlri.ac.in')).toBe(false)
  })

  it('isCrispEmail matches only crisp@xlri.ac.in', () => {
    expect(isCrispEmail('crisp@xlri.ac.in')).toBe(true)
    expect(isCrispEmail('CRISP@XLRI.AC.IN')).toBe(true)
    expect(isCrispEmail('sacdelhi@xlri.ac.in')).toBe(false)
    expect(isCrispEmail('crisp-admin@xlri.ac.in')).toBe(false)
  })
})
