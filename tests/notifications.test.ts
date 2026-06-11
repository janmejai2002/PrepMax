/**
 * Notification outbox tests.
 * Verifies that the new event types (interest_expressed, match_confirmed,
 * slot_reminder_30m) are written to the outbox at the correct moments.
 * All assertions check the outbox table via the service-role client.
 */
import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { resolve } from 'path'

dotenv.config({ path: resolve(process.cwd(), '.env.local') })

const URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SVC  = process.env.SUPABASE_SERVICE_ROLE_KEY!

const NOTIF_JUNIOR_EMAIL  = 'notif-junior@prepmax-test.local'
const NOTIF_SENIOR_EMAIL  = 'notif-senior@prepmax-test.local'
const PASSWORD = 'notif-test-pass-2026!'

let adminSb:      SupabaseClient
let juniorClient: SupabaseClient
let seniorClient: SupabaseClient
let juniorId: string
let seniorId: string

let requestId: string   // created in interest_expressed tests
let reminderSlotId: string
let reminderRoomId: string

async function makeUser(email: string, canHost = false): Promise<string> {
  const { data: existing } = await adminSb.auth.admin.listUsers({ perPage: 1000 })
  const found = existing?.users?.find((u) => u.email === email)
  if (found) {
    await adminSb.auth.admin.updateUserById(found.id, { password: PASSWORD })
    return found.id
  }
  const { data } = await adminSb.auth.admin.createUser({
    email, password: PASSWORD, email_confirm: true,
  })
  const uid = data.user!.id
  await adminSb.from('profiles').upsert({
    id: uid, email, name: email.split('@')[0],
    year: canHost ? 'second' : 'first',
    can_host_gd: canHost, can_host_pi: canHost,
    is_crisp: false, is_sac: false,
    whatsapp: canHost ? '919876543210' : '919988776655',
    phone:    canHost ? '9876543210' : '9988776655',
  }, { onConflict: 'id' })
  return uid
}

async function loginClient(email: string): Promise<SupabaseClient> {
  const c = createClient(URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } })
  await c.auth.signInWithPassword({ email, password: PASSWORD })
  return c
}

async function drainOutboxForUser(email: string, eventType: string) {
  const { data } = await adminSb
    .from('outbox')
    .select('*')
    .eq('event_type', eventType)
    .filter('payload->>to_email', 'eq', email)
    .order('created_at', { ascending: false })
    .limit(5)
  return data ?? []
}

beforeAll(async () => {
  if (!SVC) throw new Error('SUPABASE_SERVICE_ROLE_KEY not set')
  adminSb = createClient(URL, SVC, { auth: { autoRefreshToken: false, persistSession: false } })

  juniorId = await makeUser(NOTIF_JUNIOR_EMAIL, false)
  seniorId = await makeUser(NOTIF_SENIOR_EMAIL, true)

  juniorClient = await loginClient(NOTIF_JUNIOR_EMAIL)
  seniorClient = await loginClient(NOTIF_SENIOR_EMAIL)
}, 60_000)

afterAll(async () => {
  const { data: users } = await adminSb.auth.admin.listUsers({ perPage: 1000 })
  const emails = [NOTIF_JUNIOR_EMAIL, NOTIF_SENIOR_EMAIL]
  for (const email of emails) {
    const u = users?.users?.find((x) => x.email === email)
    if (u) {
      await adminSb.from('slot_requests').delete().eq('junior_id', u.id)
      await adminSb.from('enrollments').delete().eq('user_id', u.id)
      await adminSb.auth.admin.deleteUser(u.id)
    }
  }
  // Clean up reminder test room and slot
  if (reminderSlotId) await adminSb.from('slots').delete().eq('id', reminderSlotId)
  if (reminderRoomId) await adminSb.from('rooms').delete().eq('id', reminderRoomId)
  // Clean up outbox rows written by these test users
  await adminSb
    .from('outbox')
    .delete()
    .in('event_type', ['interest_expressed', 'match_confirmed', 'slot_reminder_30m'])
    .filter('payload->>to_email', 'in', `(${emails.map(e => `"${e}"`).join(',')})`)
})

// ── interest_expressed ─────────────────────────────────────────────────────────

describe('interest_expressed outbox event', () => {
  it('setup: junior creates a practice request', async () => {
    const { data, error } = await juniorClient.rpc('create_slot_request', {
      p_location:     'Library',
      p_preferred_at: new Date(Date.now() + 3_600_000).toISOString(),
      p_background:   'First year, Finance background',
      p_description:  'Looking for a mock GD on a business case topic',
    })
    expect(error).toBeNull()
    expect(data.error).toBeUndefined()
    requestId = data.id
  })

  it('express_interest writes interest_expressed to outbox (notifies junior)', async () => {
    const { data, error } = await seniorClient.rpc('express_interest', {
      p_request_id: requestId,
    })
    expect(error).toBeNull()
    expect(data.status).toBe('interested')

    const rows = await drainOutboxForUser(NOTIF_JUNIOR_EMAIL, 'interest_expressed')
    expect(rows.length).toBeGreaterThanOrEqual(1)
    const row = rows[0]
    expect(row.payload.to_email).toBe(NOTIF_JUNIOR_EMAIL)
    expect(row.payload.request_id).toBe(requestId)
    expect(typeof row.payload.location).toBe('string')
    expect(typeof row.payload.preferred_at).toBe('string')
    expect(row.payload.interest_count).toBe(1)
  })

  it('idempotent express_interest does NOT write a second outbox row', async () => {
    const before = await drainOutboxForUser(NOTIF_JUNIOR_EMAIL, 'interest_expressed')

    await seniorClient.rpc('express_interest', { p_request_id: requestId })

    const after = await drainOutboxForUser(NOTIF_JUNIOR_EMAIL, 'interest_expressed')
    expect(after.length).toBe(before.length)  // no new row
  })
})

// ── match_confirmed ────────────────────────────────────────────────────────────

describe('match_confirmed outbox event', () => {
  it('confirm_match writes two match_confirmed rows (junior + senior)', async () => {
    const { data, error } = await juniorClient.rpc('confirm_match', {
      p_request_id: requestId,
      p_senior_id:  seniorId,
    })
    expect(error).toBeNull()
    expect(data.status).toBe('matched')

    // Junior gets confirmation
    const juniorRows = await drainOutboxForUser(NOTIF_JUNIOR_EMAIL, 'match_confirmed')
    expect(juniorRows.length).toBeGreaterThanOrEqual(1)
    const juniorRow = juniorRows[0]
    expect(juniorRow.payload.recipient).toBe('junior')
    expect(juniorRow.payload.senior_name).toBe('notif-senior')
    expect(typeof juniorRow.payload.senior_whatsapp).toBe('string')
    expect(typeof juniorRow.payload.location).toBe('string')
    expect(typeof juniorRow.payload.preferred_at).toBe('string')

    // Senior gets notification that they were selected
    const seniorRows = await drainOutboxForUser(NOTIF_SENIOR_EMAIL, 'match_confirmed')
    expect(seniorRows.length).toBeGreaterThanOrEqual(1)
    const seniorRow = seniorRows[0]
    expect(seniorRow.payload.recipient).toBe('senior')
    expect(seniorRow.payload.junior_name).toBe('notif-junior')
    expect(typeof seniorRow.payload.junior_whatsapp).toBe('string')
    expect(typeof seniorRow.payload.location).toBe('string')
  })
})

// ── slot_reminder_30m + insert_slot_reminders() ────────────────────────────────

describe('insert_slot_reminders', () => {
  it('setup: create a room and a slot starting in ~30 min', async () => {
    // Create a test room
    const { data: room } = await adminSb.from('rooms').insert({
      name:    'Notif Test Room',
      location: 'Block Z',
      is_live:  true,
    }).select('id').single()
    expect(room).toBeTruthy()
    reminderRoomId = room!.id

    // Create slot starting in 28 minutes
    const startAt = new Date(Date.now() + 28 * 60_000).toISOString()
    const endAt   = new Date(Date.now() + 88 * 60_000).toISOString()
    const { data: slot } = await adminSb.from('slots').insert({
      host_id:       seniorId,
      room_id:       reminderRoomId,
      type:          'GD',
      topic:         'Reminder Test Topic',
      start_at:      startAt,
      end_at:        endAt,
      capacity:      4,
      enrolled_count: 0,
      status:        'open',
      version:       1,
    }).select('id').single()
    expect(slot).toBeTruthy()
    reminderSlotId = slot!.id

    // Confirm-enroll the junior directly via admin
    await adminSb.from('enrollments').insert({
      slot_id:  reminderSlotId,
      user_id:  juniorId,
      status:   'confirmed',
      position: 1,
    })
  })

  it('insert_slot_reminders queues outbox rows for confirmed enrollees', async () => {
    const { data, error } = await adminSb.rpc('insert_slot_reminders')
    expect(error).toBeNull()
    // At least our 1 confirmed enrollee should have been queued
    expect(Number(data)).toBeGreaterThanOrEqual(1)

    const rows = await drainOutboxForUser(NOTIF_JUNIOR_EMAIL, 'slot_reminder_30m')
    expect(rows.length).toBeGreaterThanOrEqual(1)
    const row = rows[0]
    expect(row.payload.slot_id).toBe(reminderSlotId)
    expect(row.payload.slot_type).toBe('GD')
    expect(row.payload.room_name).toBe('Notif Test Room')
    expect(typeof row.payload.start_at).toBe('string')
  })

  it('insert_slot_reminders does NOT double-queue (reminder_sent_at guard)', async () => {
    const before = await drainOutboxForUser(NOTIF_JUNIOR_EMAIL, 'slot_reminder_30m')

    // Second call should find no new due slots (reminder_sent_at is now set)
    await adminSb.rpc('insert_slot_reminders')

    const after = await drainOutboxForUser(NOTIF_JUNIOR_EMAIL, 'slot_reminder_30m')
    expect(after.length).toBe(before.length)
  })

  it('slot has reminder_sent_at set after the function runs', async () => {
    const { data: slot } = await adminSb
      .from('slots')
      .select('reminder_sent_at')
      .eq('id', reminderSlotId)
      .single()
    expect(slot?.reminder_sent_at).not.toBeNull()
  })
})
