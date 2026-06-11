/**
 * Maps XLRI batch-year email prefixes to profile year values.
 *
 * b25xxx@astra.xlri.ac.in  →  'second'  (senior, 2025 batch)
 * b26xxx@astra.xlri.ac.in  →  'first'   (junior, 2026 batch)
 * anything else            →  null      (no inference; caller must supply year)
 */

export type YearValue = 'first' | 'second'

const SENIOR_RE = /^b25\d+@astra\.xlri\.ac\.in$/i
const JUNIOR_RE = /^b26\d+@astra\.xlri\.ac\.in$/i

export function inferYearFromEmail(email: string): YearValue | null {
  if (SENIOR_RE.test(email)) return 'second'
  if (JUNIOR_RE.test(email)) return 'first'
  return null
}
