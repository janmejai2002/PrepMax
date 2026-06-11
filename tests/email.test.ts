/**
 * Pure unit tests for the host "Confirm & notify" string builders. No DB, no
 * browser — just deterministic URL/text construction. Assertions parse the URLs
 * so they're independent of parameter encoding order.
 */
import { describe, it, expect } from 'vitest'
import {
  buildGoogleCalendarUrl,
  buildSlotConfirmation,
  buildGmailCompose,
} from '../lib/email'
import type { ConfirmSlotSlot } from '../lib/types'

const slot: ConfirmSlotSlot = {
  id: 'slot-1',
  type: 'GD',
  topic: 'Consulting case',
  internship: 'McKinsey',
  start_at: '2026-06-14T12:30:00.000Z',
  end_at: '2026-06-14T13:30:00.000Z',
  gd_type_desc: 'Case-based, 8 panelists',
  description: 'Come prepped with frameworks.',
  room_name: 'LH-3',
  room_location: 'Block C',
  host_name: 'Arjun',
}

describe('buildGoogleCalendarUrl', () => {
  it('emits UTC dates, title, and location', () => {
    const u = new URL(buildGoogleCalendarUrl(slot))
    expect(u.origin + u.pathname).toBe('https://calendar.google.com/calendar/render')
    expect(u.searchParams.get('action')).toBe('TEMPLATE')
    expect(u.searchParams.get('dates')).toBe('20260614T123000Z/20260614T133000Z')
    expect(u.searchParams.get('text')).toBe('GD Practice — Consulting case')
    expect(u.searchParams.get('location')).toBe('LH-3, Block C')
    expect(u.searchParams.get('details')).toContain('Hosted by Arjun')
  })
})

describe('buildSlotConfirmation', () => {
  it('subject carries the type + topic; body carries details + the calendar link', () => {
    const { subject, body } = buildSlotConfirmation(slot)
    expect(subject).toContain('GD practice')
    expect(subject).toContain('Consulting case')
    expect(body).toContain('Consulting case')
    expect(body).toContain('LH-3, Block C')
    expect(body).toContain('Hosted by Arjun')
    expect(body).toContain('https://calendar.google.com/calendar/render')
  })
})

describe('buildGmailCompose', () => {
  it('builds a Gmail compose link with To/CC/subject/body', () => {
    const url = buildGmailCompose({
      to: ['a@x.com', 'b@x.com'],
      cc: ['m@x.com'],
      subject: 'Hi there',
      body: 'line 1\nline 2',
    })
    const u = new URL(url)
    expect(u.origin + u.pathname).toBe('https://mail.google.com/mail/')
    expect(u.searchParams.get('view')).toBe('cm')
    expect(u.searchParams.get('to')).toBe('a@x.com,b@x.com')
    expect(u.searchParams.get('cc')).toBe('m@x.com')
    expect(u.searchParams.get('su')).toBe('Hi there')
    expect(u.searchParams.get('body')).toBe('line 1\nline 2')
  })

  it('omits the cc param when there are no mentors', () => {
    const u = new URL(buildGmailCompose({ to: ['a@x.com'], subject: 's', body: 'b' }))
    expect(u.searchParams.has('cc')).toBe(false)
  })
})
