/**
 * leave_slot RPC integration tests — run against the live Supabase instance.
 * Verifies: confirmed leave frees a seat, confirmed leave auto-promotes the
 * waitlist head, waitlist leave closes the queue, idempotency, not_enrolled,
 * unauthorized, and re-join after leaving (join_slot reactivation).
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in .env.local.
 */
import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { resolve } from 'path'

dotenv.config({ path: resolve(process.cwd(), '.env.local') })

const URL     = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON    = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!

const HOST_EMAIL = 'leave-test-host@prepmax-test.local'
const J1_EMAIL   = 'leave-test-j1@prepmax-test.local'
const J2_EMAIL   = 'leave-test-j2@prepmax-test.local'
const J3_EMAIL   = 'leave-test-j3@prepmax-test.local'
const J4_EMAIL   = 'leave-test-j4@prepmax-test.local'
const PASSWORD   = 'leave-test-pass-2026!'

let adminSb: SupabaseClient
let hostClient: SupabaseClient
let j1Client: SupabaseClient
let j2Client: SupabaseClient
let j3Client: SupabaseClient
let j4Client: SupabaseClient

let hostId: string
let j1Id: string
let j2Id: string
let j3Id: string
let j4Id: string
let testRoomId: string
let slotId: string // recreated fresh before each test (2-seat GD slot)

beforeAll(async () => {
  if (!SERVICE) throw new Error('SUPABASE_SERVICE_ROLE_KEY not set')

  adminSb = createClient(URL, SERVICE, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  hostId = await upsertUser(HOST_EMAIL, PASSWORD)
  j1Id   = await upsertUser(J1_EMAIL, PASSWORD)
  j2Id   = await upsertUser(J2_EMAIL, PASSWORD)
  j3Id   = await upsertUser(J3_EMAIL, PASSWORD)
  j4Id   = await upsertUser(J4_EMAIL, PASSWORD)

  await adminSb.from('profiles').upsert([
    { id: hostId, email: HOST_EMAIL, name: 'LT Host',    year: 'second', batch: 'PGP 2024-26', section: 'A', roll: 'LTHOST', can_host_gd: true,  can_host_pi: false, is_mentor: false, is_committee: false, is_crisp_admin: false, is_sac: false },
    { id: j1Id,   email: J1_EMAIL,   name: 'LT Junior1', year: 'first',  batch: 'PGP 2025-27', section: 'B', roll: 'LTJ001', can_host_gd: false, can_host_pi: false, is_mentor: false, is_committee: false, is_crisp_admin: false, is_sac: false },
    { id: j2Id,   email: J2_EMAIL,   name: 'LT Junior2', year: 'first',  batch: 'PGP 2025-27', section: 'B', roll: 'LTJ002', can_host_gd: false, can_host_pi: false, is_mentor: false, is_committee: false, is_crisp_admin: false, is_sac: false },
    { id: j3Id,   email: J3_EMAIL,   name: 'LT Junior3', year: 'first',  batch: 'PGP 2025-27', section: 'B', roll: 'LTJ003', can_host_gd: false, can_host_pi: false, is_mentor: false, is_committee: false, is_crisp_admin: false, is_sac: false },
    { id: j4Id,   email: J4_EMAIL,   name: 'LT Junior4', year: 'first',  batch: 'PGP 2025-27', section: 'B', roll: 'LTJ004', can_host_gd: false, can_host_pi: false, is_mentor: false, is_committee: false, is_crisp_admin: false, is_sac: false },
  ])

  const { data: room } = await adminSb
    .from('rooms')
    .upsert({ name: '__leave-test-room__', location: 'Test', capacity: 10, is_live: true }, { onConflict: 'name' })
    .select('id')
    .single()
  testRoomId = room!.id

  hostClient = await buildUserClient(HOST_EMAIL, PASSWORD)
  j1Client   = await buildUserClient(J1_EMAIL, PASSWORD)
  j2Client   = await buildUserClient(J2_EMAIL, PASSWORD)
  j3Client   = await buildUserClient(J3_EMAIL, PASSWORD)
  j4Client   = await buildUserClient(J4_EMAIL, PASSWORD)
}, 60_000)

afterAll(async () => {
  if (!adminSb) return
  if (slotId) await adminSb.from('enrollments').delete().eq('slot_id', slotId)
  await adminSb.from('slots').delete().eq('room_id', testRoomId)
  await adminSb.from('rooms').delete().eq('name', '__leave-test-room__')
  for (const id of [hostId, j1Id, j2Id, j3Id, j4Id]) {
    if (id) await adminSb.auth.admin.deleteUser(id)
  }
}, 30_000)

// Fresh 2-seat GD slot before every test, so cases don't bleed into each other.
beforeEach(async () => {
  if (slotId) {
    await adminSb.from('enrollments').delete().eq('slot_id', slotId)
    await adminSb.from('slots').delete().eq('id', slotId)
  }
  const now = new Date()
  const { data: slot } = await adminSb
    .from('slots')
    .insert({
      type: 'GD',
      host_id: hostId,
      room_id: testRoomId,
      start_at: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
      end_at:   new Date(now.getTime() + 90 * 60 * 1000).toISOString(),
      topic: '__leave-test-slot__',
      capacity: 2,
    })
    .select('id')
    .single()
  slotId = slot!.id
})

async function upsertUser(email: string, password: string): Promise<string> {
  const { data: list } = await adminSb.auth.admin.listUsers({ perPage: 1000 })
  const existing = list?.users.find((u) => u.email === email)
  if (existing) return existing.id
  const { data, error } = await adminSb.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw error
  return data.user.id
}

async function buildUserClient(email: string, password: string): Promise<SupabaseClient> {
  const client = createClient(URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } })
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`Sign-in failed for ${email}: ${error.message}`)
  return client
}

const enrollmentOf = async (userId: string) =>
  (await adminSb.from('enrollments').select('status, position').eq('slot_id', slotId).eq('user_id', userId).single()).data

const slotState = async () =>
  (await adminSb.from('slots').select('enrolled_count, status').eq('id', slotId).single()).data

// ── Test suite ────────────────────────────────────────────────────────────────

describe('leave_slot — confirmed leaver, no waitlist', () => {
  it('frees the seat: enrolled_count drops, slot reopens, enrolment cancelled', async () => {
    await j1Client.rpc('join_slot', { p_slot_id: slotId, p_user_id: j1Id }) // confirmed, pos 1

    const { data, error } = await j1Client.rpc('leave_slot', { p_slot_id: slotId, p_user_id: j1Id })
    expect(error).toBeNull()
    expect(data.status).toBe('cancelled')
    expect(data.was_confirmed).toBe(true)
    expect(data.promoted_user_id).toBeNull()
    expect(data.seat_freed).toBe(true)

    const slot = await slotState()
    expect(slot!.enrolled_count).toBe(0)
    expect(slot!.status).toBe('open')

    const e = await enrollmentOf(j1Id)
    expect(e!.status).toBe('cancelled')
    expect(e!.position).toBeNull()
  })

  it('a full slot reopens when a confirmed seat is vacated and nobody waits', async () => {
    await j1Client.rpc('join_slot', { p_slot_id: slotId, p_user_id: j1Id })
    await j2Client.rpc('join_slot', { p_slot_id: slotId, p_user_id: j2Id }) // slot now full

    expect((await slotState())!.status).toBe('full')

    await j2Client.rpc('leave_slot', { p_slot_id: slotId, p_user_id: j2Id })

    const slot = await slotState()
    expect(slot!.enrolled_count).toBe(1)
    expect(slot!.status).toBe('open')
    // remaining confirmed seat re-sequenced to position 1
    expect((await enrollmentOf(j1Id))!.position).toBe(1)
  })
})

describe('leave_slot — confirmed leaver WITH waitlist auto-promotion', () => {
  it('promotes the waitlist head; enrolled_count holds; slot stays full', async () => {
    await j1Client.rpc('join_slot', { p_slot_id: slotId, p_user_id: j1Id }) // confirmed
    await j2Client.rpc('join_slot', { p_slot_id: slotId, p_user_id: j2Id }) // confirmed → full
    await j3Client.rpc('join_slot', { p_slot_id: slotId, p_user_id: j3Id }) // waitlist 1
    await j4Client.rpc('join_slot', { p_slot_id: slotId, p_user_id: j4Id }) // waitlist 2

    const { data } = await j1Client.rpc('leave_slot', { p_slot_id: slotId, p_user_id: j1Id })
    expect(data.was_confirmed).toBe(true)
    expect(data.promoted_user_id).toBe(j3Id) // head of the waitlist
    expect(data.seat_freed).toBe(false)

    const slot = await slotState()
    expect(slot!.enrolled_count).toBe(2) // one out, one in — unchanged
    expect(slot!.status).toBe('full')

    expect((await enrollmentOf(j1Id))!.status).toBe('cancelled')
    expect((await enrollmentOf(j3Id))!.status).toBe('confirmed')

    // j4 slides up to the head of the waitlist
    const j4 = await enrollmentOf(j4Id)
    expect(j4!.status).toBe('waitlist')
    expect(j4!.position).toBe(1)
  })
})

describe('leave_slot — waitlist leaver', () => {
  it('drops out without touching enrolled_count; queue closes behind them', async () => {
    await j1Client.rpc('join_slot', { p_slot_id: slotId, p_user_id: j1Id }) // confirmed
    await j2Client.rpc('join_slot', { p_slot_id: slotId, p_user_id: j2Id }) // confirmed → full
    await j3Client.rpc('join_slot', { p_slot_id: slotId, p_user_id: j3Id }) // waitlist 1
    await j4Client.rpc('join_slot', { p_slot_id: slotId, p_user_id: j4Id }) // waitlist 2

    const { data } = await j3Client.rpc('leave_slot', { p_slot_id: slotId, p_user_id: j3Id })
    expect(data.was_confirmed).toBe(false)
    expect(data.promoted_user_id).toBeNull()

    expect((await slotState())!.enrolled_count).toBe(2)
    // j4 moves up from waitlist 2 → 1
    expect((await enrollmentOf(j4Id))!.position).toBe(1)
  })
})

describe('leave_slot — guard rails', () => {
  it('idempotent: leaving twice returns cancelled without side effects', async () => {
    await j1Client.rpc('join_slot', { p_slot_id: slotId, p_user_id: j1Id })
    await j1Client.rpc('leave_slot', { p_slot_id: slotId, p_user_id: j1Id })

    const { data } = await j1Client.rpc('leave_slot', { p_slot_id: slotId, p_user_id: j1Id })
    expect(data.status).toBe('cancelled')
    expect(data.idempotent).toBe(true)
    expect((await slotState())!.enrolled_count).toBe(0)
  })

  it('returns not_enrolled for a user who never joined', async () => {
    const { data } = await j1Client.rpc('leave_slot', { p_slot_id: slotId, p_user_id: j1Id })
    expect(data.error).toBe('not_enrolled')
  })

  it('returns unauthorized when leaving on behalf of someone else', async () => {
    await j2Client.rpc('join_slot', { p_slot_id: slotId, p_user_id: j2Id })
    const { data } = await j1Client.rpc('leave_slot', { p_slot_id: slotId, p_user_id: j2Id })
    expect(data.error).toBe('unauthorized')
  })
})

describe('join_slot — re-join after leaving', () => {
  it('a cancelled user can join again and lands at the back of the line', async () => {
    await j1Client.rpc('join_slot', { p_slot_id: slotId, p_user_id: j1Id }) // confirmed pos 1
    await j2Client.rpc('join_slot', { p_slot_id: slotId, p_user_id: j2Id }) // confirmed pos 2 → full
    await j1Client.rpc('leave_slot', { p_slot_id: slotId, p_user_id: j1Id }) // frees a seat, reopens

    // j1 re-joins → there's an open seat again
    const { data, error } = await j1Client.rpc('join_slot', { p_slot_id: slotId, p_user_id: j1Id })
    expect(error).toBeNull()
    expect(data.status).toBe('confirmed')
    expect(data.idempotent).toBeUndefined() // genuinely re-activated, not a no-op

    expect((await enrollmentOf(j1Id))!.status).toBe('confirmed')
    expect((await slotState())!.enrolled_count).toBe(2)
  })
})
