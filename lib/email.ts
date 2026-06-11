// Pure helpers for the host "Confirm & notify" flow.
//
// The host sends the confirmation from THEIR OWN Gmail: we build a compose
// deep-link pre-filled with the confirmed students (To), their mentors (CC),
// the GD/PI details, and an "Add to Google Calendar" link. No server mailer —
// nothing here touches the network; everything is a pure string builder so it
// can be unit-tested without a browser.

import { formatSlotTime } from './format'
import type { ConfirmSlotSlot } from './types'

/** ISO timestamp → "YYYYMMDDTHHMMSSZ" (UTC), the format Google Calendar wants. */
function toGCalDate(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

/** Human-readable location for the email + calendar event. */
function slotLocation(slot: ConfirmSlotSlot): string {
  return [slot.room_name, slot.room_location].filter(Boolean).join(', ')
}

/** The extra context lines shared by the email body and the calendar details. */
function slotDetailLines(slot: ConfirmSlotSlot): string[] {
  const lines = [`Hosted by ${slot.host_name}`]
  if (slot.internship) lines.push(`Company: ${slot.internship}`)
  if (slot.type === 'GD' && slot.gd_type_desc) lines.push(`Format: ${slot.gd_type_desc}`)
  if (slot.description) lines.push(slot.description)
  return lines
}

/**
 * "Add to Google Calendar" link — opens a pre-filled event the student saves
 * with one tap. A file attachment isn't possible through a compose deep-link,
 * so a render-template URL is the way to get the GD onto their calendar.
 */
export function buildGoogleCalendarUrl(slot: ConfirmSlotSlot): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `${slot.type} Practice — ${slot.topic}`,
    dates: `${toGCalDate(slot.start_at)}/${toGCalDate(slot.end_at)}`,
    details: slotDetailLines(slot).join('\n'),
    location: slotLocation(slot),
  })
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

/** Subject + plain-text body for the confirmation email. */
export function buildSlotConfirmation(slot: ConfirmSlotSlot): {
  subject: string
  body: string
} {
  const when = formatSlotTime(slot.start_at)
  const subject = `Confirmed: ${slot.type} practice — ${slot.topic} (${when})`

  const body = [
    `Hi,`,
    ``,
    `You're confirmed for the following ${slot.type} practice slot:`,
    ``,
    `${slot.type} · ${slot.topic}`,
    `When: ${when}`,
    `Where: ${slotLocation(slot) || 'TBA'}`,
    ...slotDetailLines(slot),
    ``,
    `Add it to your calendar:`,
    buildGoogleCalendarUrl(slot),
    ``,
    `See you there!`,
    slot.host_name,
  ].join('\n')

  return { subject, body }
}

/**
 * Gmail web compose deep-link. Opens a pre-filled compose window in the host's
 * own Gmail (and the Gmail app on most phones). Recipients are comma-joined.
 */
export function buildGmailCompose(opts: {
  to: string[]
  cc?: string[]
  subject: string
  body: string
}): string {
  const params = new URLSearchParams({
    view: 'cm',
    fs: '1',
    to: opts.to.join(','),
    su: opts.subject,
    body: opts.body,
  })
  if (opts.cc && opts.cc.length > 0) params.set('cc', opts.cc.join(','))
  return `https://mail.google.com/mail/?${params.toString()}`
}
