/**
 * cancel_slot + edit_slot RPC integration tests — run against live Supabase.
 * Verifies: host/admin authorization, full-slot cancellation, edit under an
 * optimistic version lock, capacity raise auto-promoting the waitlist, and the
 * capacity-below-enrolled / version-conflict guard rails.
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

const HOST_EMAIL  = 'ce-test-host@prepmax-test.local'
const ADMIN_EMAIL = 'ce-test-admin@prepmax-test.local'
const J1_EMAIL    = 'ce-test-j1@prepmax-test.local'
const J2_EMAIL    = 'ce-test-j2@prepmax-test.local'
const J3_EMAIL    = 'ce-test-j3@prepmax-test.local'
const PASSWORD    = 'ce-test-pass-2026!'

let adminSb: SupabaseClient
let hostClient: SupabaseClient
let adminClient: SupabaseClient
let j1Client: SupabaseClient
let j2Client: SupabaseClient
let j3Client: SupabaseClient

let hostId: string
let adminId: string
let j1Id: string
let j2Id: string
let j3Id: string
let testRoomId: string
let slotId: string // fresh 2-seat GD slot before each test

beforeAll(async () => {
  if (!SERVICE) throw new Error('SUPABASE_SERVICE_ROLE_KEY not set')

  adminSb = createClient(URL, SERVICE, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  hostId  = await upsertUser(HOST_EMAIL, PASSWORD)
  adminId = await upsertUser(ADMIN_EMAIL, PASSWORD)
  j1Id    = await upsertUser(J1_EMAIL, PASSWORD)
  j2Id    = await upsertUser(J2_EMAIL, PASSWORD)
  j3Id    = await upsertUser(J3_EMAIL, PASSWORD)

  await adminSb.from('profiles').upsert([
    { id: hostId,  email: HOST_EMAIL,  name: 'CE Host',  year: 'second', batch: 'PGP 2024-26', section: 'A', roll: 'CEHOST', can_host_gd: true,  can_host_pi: false, is_crisp: false, is_sac: false },
    { id: adminId, email: ADMIN_EMAIL, name: 'CE Admin', year: 'second', batch: 'PGP 2024-26', section: 'A', roll: 'CEADMN', can_host_gd: false, can_host_pi: false, is_crisp: true,  is_sac: false },
    { id: j1Id,    email: J1_EMAIL,    name: 'CE J1',    year: 'first',  batch: 'PGP 2025-27', section: 'B', roll: 'CEJ001', can_host_gd: false, can_host_pi: false, is_crisp: false, is_sac: false },
    { id: j2Id,    email: J2_EMAIL,    name: 'CE J2',    year: 'first',  batch: 'PGP 2025-27', section: 'B', roll: 'CEJ002', can_host_gd: false, can_host_pi: false, is_crisp: false, is_sac: false },
    { id: j3Id,    email: J3_EMAIL,    name: 'CE J3',    year: 'first',  batch: 'PGP 2025-27', section: 'B', roll: 'CEJ003', can_host_gd: false, can_host_pi: false, is_crisp: false, is_sac: false },
  ])

  const { data: room } = await adminSb
    .from('rooms')
    .upsert({ name: '__ce-test-room__', location: 'Test', capacity: 10, is_live: true }, { onConflict: 'name' })
    .select('id')
    .single()
  testRoomId = room!.id

  hostClient  = await buildUserClient(HOST_EMAIL, PASSWORD)
  adminClient = await buildUserClient(ADMIN_EMAIL, PASSWORD)
  j1Client    = await buildUserClient(J1_EMAIL, PASSWORD)
  j2Client    = await buildUserClient(J2_EMAIL, PASSWORD)
  j3Client    = await buildUserClient(J3_EMAIL, PASSWORD)
}, 60_000)

afterAll(async () => {
  if (!adminSb) return
  const { data: slots } = await adminSb.from('slots').select('id').eq('room_id', testRoomId)
  for (const s of slots ?? []) await adminSb.from('enrollments').delete().eq('slot_id', s.id)
  await adminSb.from('slots').delete().eq('room_id', testRoomId)
  await adminSb.from('rooms').delete().eq('name', '__ce-test-room__')
  for (const id of [hostId, adminId, j1Id, j2Id, j3Id]) {
    if (id) await adminSb.auth.admin.deleteUser(id)
  }
}, 30_000)

beforeEach(async () => {
  // Clear any prior enrollments so the time_conflict check doesn't block re-joining
  for (const uid of [j1Id, j2Id, j3Id]) {
    if (uid) await adminSb.from('enrollments').delete().eq('user_id', uid)
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
      topic: '__ce-test-slot__',
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

const slotRow = async () =>
  (await adminSb.from('slots').select('status, version, capacity, enrolled_count, topic').eq('id', slotId).single()).data

const enrollmentOf = async (userId: string) =>
  (await adminSb.from('enrollments').select('status, position').eq('slot_id', slotId).eq('user_id', userId).single()).data

// ── cancel_slot ───────────────────────────────────────────────────────────────

describe('cancel_slot', () => {
  it('host cancels the slot → slot + all active enrolments cancelled, version bumped', async () => {
    await j1Client.rpc('join_slot', { p_slot_id: slotId, p_user_id: j1Id }) // confirmed
    await j2Client.rpc('join_slot', { p_slot_id: slotId, p_user_id: j2Id }) // confirmed → full
    await j3Client.rpc('join_slot', { p_slot_id: slotId, p_user_id: j3Id }) // waitlist

    const { data, error } = await hostClient.rpc('cancel_slot', { p_slot_id: slotId })
    expect(error).toBeNull()
    expect(data.status).toBe('cancelled')
    expect(data.enrolments_released).toBe(3)

    const slot = await slotRow()
    expect(slot!.status).toBe('cancelled')
    expect(slot!.version).toBe(2) // started at 1

    for (const id of [j1Id, j2Id, j3Id]) {
      expect((await enrollmentOf(id))!.status).toBe('cancelled')
    }
  })

  it('a CRISP admin (can_manage_rooms) can cancel a slot they do not host', async () => {
    const { data } = await adminClient.rpc('cancel_slot', { p_slot_id: slotId })
    expect(data.status).toBe('cancelled')
  })

  it('a plain junior cannot cancel → unauthorized', async () => {
    const { data } = await j1Client.rpc('cancel_slot', { p_slot_id: slotId })
    expect(data.error).toBe('unauthorized')
    expect((await slotRow())!.status).toBe('open')
  })

  it('idempotent: cancelling an already-cancelled slot is a no-op', async () => {
    await hostClient.rpc('cancel_slot', { p_slot_id: slotId })
    const { data } = await hostClient.rpc('cancel_slot', { p_slot_id: slotId })
    expect(data.status).toBe('cancelled')
    expect(data.idempotent).toBe(true)
  })
})

// ── edit_slot ─────────────────────────────────────────────────────────────────

describe('edit_slot', () => {
  it('host edits the topic with the right version → updated, version bumped', async () => {
    const { data, error } = await hostClient.rpc('edit_slot', {
      p_slot_id: slotId,
      p_expected_version: 1,
      p_patch: { topic: 'Reworked GD topic' },
    })
    expect(error).toBeNull()
    expect(data.status).toBe('updated')
    expect(data.version).toBe(2)

    const slot = await slotRow()
    expect(slot!.topic).toBe('Reworked GD topic')
    expect(slot!.version).toBe(2)
  })

  it('stale version → version_conflict, no write', async () => {
    await hostClient.rpc('edit_slot', { p_slot_id: slotId, p_expected_version: 1, p_patch: { topic: 'v2' } })

    // caller still thinks it is version 1
    const { data } = await hostClient.rpc('edit_slot', {
      p_slot_id: slotId,
      p_expected_version: 1,
      p_patch: { topic: 'should not apply' },
    })
    expect(data.error).toBe('version_conflict')
    expect(data.current_version).toBe(2)
    expect((await slotRow())!.topic).toBe('v2')
  })

  it('raising capacity auto-promotes waitlist heads into the new seats', async () => {
    await j1Client.rpc('join_slot', { p_slot_id: slotId, p_user_id: j1Id }) // confirmed
    await j2Client.rpc('join_slot', { p_slot_id: slotId, p_user_id: j2Id }) // confirmed → full
    await j3Client.rpc('join_slot', { p_slot_id: slotId, p_user_id: j3Id }) // waitlist 1

    const { data } = await hostClient.rpc('edit_slot', {
      p_slot_id: slotId,
      p_expected_version: 1,
      p_patch: { capacity: 3 },
    })
    expect(data.status).toBe('updated')
    expect(data.promoted_count).toBe(1)
    expect(data.enrolled_count).toBe(3)
    expect(data.slot_status).toBe('full') // 3/3

    expect((await enrollmentOf(j3Id))!.status).toBe('confirmed')
    const slot = await slotRow()
    expect(slot!.capacity).toBe(3)
    expect(slot!.enrolled_count).toBe(3)
  })

  it('capacity below the confirmed head-count is rejected', async () => {
    await j1Client.rpc('join_slot', { p_slot_id: slotId, p_user_id: j1Id })
    await j2Client.rpc('join_slot', { p_slot_id: slotId, p_user_id: j2Id }) // 2 confirmed

    const { data } = await hostClient.rpc('edit_slot', {
      p_slot_id: slotId,
      p_expected_version: 1,
      p_patch: { capacity: 1 },
    })
    expect(data.error).toBe('capacity_below_enrolled')
    expect(data.enrolled_count).toBe(2)
    expect((await slotRow())!.capacity).toBe(2) // unchanged
  })

  it('a plain junior cannot edit → unauthorized', async () => {
    const { data } = await j1Client.rpc('edit_slot', {
      p_slot_id: slotId,
      p_expected_version: 1,
      p_patch: { topic: 'hijack' },
    })
    expect(data.error).toBe('unauthorized')
  })
})
