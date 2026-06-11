/**
 * Unit tests for email → year inference.
 * Pure logic — no DB, no auth, no network.
 */
import { describe, it, expect } from 'vitest'
import { inferYearFromEmail } from '../lib/email-role'

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
})
