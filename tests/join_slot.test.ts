/**
 * join_slot RPC integration tests — run against the live Supabase instance.
 * Verifies: confirmed seats, full→waitlist, idempotency, oversell prevention,
 * unauthorized user rejection, and non-joinable status rejection.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in .env.local.
 */
import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { resolve } from 'path'

dotenv.config({ path: resolve(process.cwd(), '.env.local') })

const URL     = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON    = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!

const HOST_EMAIL   = 'join-test-host@prepmax-test.local'
const JUNIOR1_EMAIL = 'join-test-j1@prepmax-test.local'
const JUNIOR2_EMAIL = 'join-test-j2@prepmax-test.local'
const JUNIOR3_EMAIL = 'join-test-j3@prepmax-test.local'
const PASSWORD = 'join-test-pass-2026!'

let adminSb: SupabaseClient
let hostClient: SupabaseClient
let j1Client: SupabaseClient
let j2Client: SupabaseClient
let j3Client: SupabaseClient

let hostId:   string
let j1Id:     string
let j2Id:     string
let j3Id:     string
let testRoomId: string
let testSlotId: string  // 2-seat GD slot for most tests
let cancelledSlotId: string

beforeAll(async () => {
  if (!SERVICE) throw new Error('SUPABASE_SERVICE_ROLE_KEY not set')

  adminSb = createClient(URL, SERVICE, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  hostId = await upsertUser(HOST_EMAIL,    PASSWORD)
  j1Id   = await upsertUser(JUNIOR1_EMAIL, PASSWORD)
  j2Id   = await upsertUser(JUNIOR2_EMAIL, PASSWORD)
  j3Id   = await upsertUser(JUNIOR3_EMAIL, PASSWORD)

  await adminSb.from('profiles').upsert([
    { id: hostId, email: HOST_EMAIL,    name: 'JT Host',   year: 'second', batch: 'PGP 2024-26', section: 'A', roll: 'JTHOST', can_host_gd: true,  can_host_pi: false, is_crisp: false, is_sac: false },
    { id: j1Id,   email: JUNIOR1_EMAIL, name: 'JT Junior1', year: 'first',  batch: 'PGP 2025-27', section: 'B', roll: 'JTJ001',  can_host_gd: false, can_host_pi: false, is_crisp: false, is_sac: false },
    { id: j2Id,   email: JUNIOR2_EMAIL, name: 'JT Junior2', year: 'first',  batch: 'PGP 2025-27', section: 'B', roll: 'JTJ002',  can_host_gd: false, can_host_pi: false, is_crisp: false, is_sac: false },
    { id: j3Id,   email: JUNIOR3_EMAIL, name: 'JT Junior3', year: 'first',  batch: 'PGP 2025-27', section: 'B', roll: 'JTJ003',  can_host_gd: false, can_host_pi: false, is_crisp: false, is_sac: false },
  ])

  // Create a test room
  const { data: room } = await adminSb
    .from('rooms')
    .upsert({ name: '__join-test-room__', location: 'Test', capacity: 10, is_live: true }, { onConflict: 'name' })
    .select('id')
    .single()
  testRoomId = room!.id

  // 2-seat GD slot (starts in 1h so status checks work)
  const now = new Date()
  const { data: slot } = await adminSb
    .from('slots')
    .insert({
      type: 'GD',
      host_id: hostId,
      room_id: testRoomId,
      start_at: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
      end_at:   new Date(now.getTime() + 90 * 60 * 1000).toISOString(),
      topic: '__join-test-slot__',
      capacity: 2,
    })
    .select('id')
    .single()
  testSlotId = slot!.id

  // A cancelled slot to test rejection
  const { data: cSlot } = await adminSb
    .from('slots')
    .insert({
      type: 'GD',
      host_id: hostId,
      room_id: testRoomId,
      start_at: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
      end_at:   new Date(now.getTime() + 90 * 60 * 1000).toISOString(),
      topic: '__join-test-cancelled__',
      capacity: 6,
      status: 'cancelled',
    })
    .select('id')
    .single()
  cancelledSlotId = cSlot!.id

  hostClient = await buildUserClient(HOST_EMAIL,    PASSWORD)
  j1Client   = await buildUserClient(JUNIOR1_EMAIL, PASSWORD)
  j2Client   = await buildUserClient(JUNIOR2_EMAIL, PASSWORD)
  j3Client   = await buildUserClient(JUNIOR3_EMAIL, PASSWORD)
}, 60_000)

afterAll(async () => {
  if (!adminSb) return
  await adminSb.from('enrollments').delete().eq('slot_id', testSlotId)
  await adminSb.from('slots').delete().in('id', [testSlotId, cancelledSlotId])
  await adminSb.from('rooms').delete().eq('name', '__join-test-room__')
  for (const id of [hostId, j1Id, j2Id, j3Id]) {
    if (id) await adminSb.auth.admin.deleteUser(id)
  }
}, 30_000)

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

// ── Test suite ────────────────────────────────────────────────────────────────

describe('join_slot — happy paths', () => {
  it('j1 joins a 2-seat slot → confirmed, position 1', async () => {
    const { data, error } = await j1Client.rpc('join_slot', {
      p_slot_id: testSlotId,
      p_user_id: j1Id,
    })
    expect(error).toBeNull()
    expect(data.status).toBe('confirmed')
    expect(data.position).toBe(1)

    // enrolled_count incremented on the slot
    const { data: slot } = await adminSb.from('slots').select('enrolled_count, status').eq('id', testSlotId).single()
    expect(slot!.enrolled_count).toBe(1)
    expect(slot!.status).toBe('open')
  })

  it('j2 joins the same slot → confirmed, position 2, slot flips to full', async () => {
    const { data, error } = await j2Client.rpc('join_slot', {
      p_slot_id: testSlotId,
      p_user_id: j2Id,
    })
    expect(error).toBeNull()
    expect(data.status).toBe('confirmed')
    expect(data.position).toBe(2)

    const { data: slot } = await adminSb.from('slots').select('enrolled_count, status').eq('id', testSlotId).single()
    expect(slot!.enrolled_count).toBe(2)
    expect(slot!.status).toBe('full')
  })

  it('j3 joins the full slot → waitlisted at position 1', async () => {
    const { data, error } = await j3Client.rpc('join_slot', {
      p_slot_id: testSlotId,
      p_user_id: j3Id,
    })
    expect(error).toBeNull()
    expect(data.status).toBe('waitlist')
    expect(data.position).toBe(1)

    // enrolled_count must NOT increase for a waitlist join
    const { data: slot } = await adminSb.from('slots').select('enrolled_count').eq('id', testSlotId).single()
    expect(slot!.enrolled_count).toBe(2)
  })
})

describe('join_slot — idempotency', () => {
  it('j1 calls join_slot again → returns existing enrollment unchanged', async () => {
    const { data, error } = await j1Client.rpc('join_slot', {
      p_slot_id: testSlotId,
      p_user_id: j1Id,
    })
    expect(error).toBeNull()
    expect(data.status).toBe('confirmed')
    expect(data.idempotent).toBe(true)

    // no double-count on the slot
    const { data: slot } = await adminSb.from('slots').select('enrolled_count').eq('id', testSlotId).single()
    expect(slot!.enrolled_count).toBe(2)
  })

  it('j3 calls join_slot again → returns existing waitlist unchanged', async () => {
    const { data, error } = await j3Client.rpc('join_slot', {
      p_slot_id: testSlotId,
      p_user_id: j3Id,
    })
    expect(error).toBeNull()
    expect(data.status).toBe('waitlist')
    expect(data.position).toBe(1)
    expect(data.idempotent).toBe(true)
  })
})

describe('join_slot — guard rails', () => {
  it('returns slot_not_joinable for a cancelled slot', async () => {
    const { data, error } = await j1Client.rpc('join_slot', {
      p_slot_id: cancelledSlotId,
      p_user_id: j1Id,
    })
    expect(error).toBeNull()
    expect(data.error).toBe('slot_not_joinable')
  })

  it('returns unauthorized when user_id does not match the caller', async () => {
    // j1 tries to join as j2
    const { data, error } = await j1Client.rpc('join_slot', {
      p_slot_id: testSlotId,
      p_user_id: j2Id,
    })
    expect(error).toBeNull()
    expect(data.error).toBe('unauthorized')
  })

  it('ZERO oversell: enrolled_count never exceeds capacity', async () => {
    const { data: slot } = await adminSb
      .from('slots')
      .select('enrolled_count, capacity')
      .eq('id', testSlotId)
      .single()
    expect(slot!.enrolled_count).toBeLessThanOrEqual(slot!.capacity)
  })
})
