/**
 * Maps XLRI email addresses to role/year values.
 *
 * @astra.xlri.ac.in  — student domain
 *   b25NNN  →  year = 'second'  (senior, 2025 batch)
 *   b26NNN  →  year = 'first'   (junior, 2026 batch)
 *   other   →  null             (no inference; caller must supply year)
 *
 * @xlri.ac.in  — committee domain (SAC, CRISP, shared logins)
 *   any address  →  isCommitteeEmail() = true, year = null (no year for committee)
 *   sacdelhi@xlri.ac.in  specifically  →  isSacEmail() = true
 *   crisp@xlri.ac.in     specifically  →  isCrispEmail() = true
 */

export type YearValue = 'first' | 'second'

const SENIOR_RE    = /^b25\d+@astra\.xlri\.ac\.in$/i
const JUNIOR_RE    = /^b26\d+@astra\.xlri\.ac\.in$/i
const COMMITTEE_RE = /@xlri\.ac\.in$/i

export function inferYearFromEmail(email: string): YearValue | null {
  if (SENIOR_RE.test(email)) return 'second'
  if (JUNIOR_RE.test(email)) return 'first'
  return null
}

/** True for any @xlri.ac.in address (committee shared logins). */
export function isCommitteeEmail(email: string): boolean {
  return COMMITTEE_RE.test(email)
}

export function isSacEmail(email: string): boolean {
  return email.toLowerCase() === 'sacdelhi@xlri.ac.in'
}

export function isCrispEmail(email: string): boolean {
  return email.toLowerCase() === 'crisp@xlri.ac.in'
}
