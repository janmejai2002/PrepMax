/**
 * confirm_slot RPC integration tests — run against live Supabase.
 * Verifies: host/admin authorization, the recipient lists (confirmed students in
 * To, their mentors in CC, deduped & null-free), waitlisted students excluded,
 * the empty-lineup guard, confirmed_at stamping, and the join lock that follows.
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

const HOST_EMAIL   = 'cf-test-host@prepmax-test.local'
const ADMIN_EMAIL  = 'cf-test-admin@prepmax-test.local'
const MENTOR_EMAIL = 'cf-test-mentor@prepmax-test.local'
const J1_EMAIL     = 'cf-test-j1@prepmax-test.local'
const J2_EMAIL     = 'cf-test-j2@prepmax-test.local'
const J3_EMAIL     = 'cf-test-j3@prepmax-test.local'
const PASSWORD     = 'cf-test-pass-2026!'

let adminSb: SupabaseClient
let hostClient: SupabaseClient
let adminClient: SupabaseClient
let j1Client: SupabaseClient
let j2Client: SupabaseClient
let j3Client: SupabaseClient

let hostId: string
let adminId: string
let mentorId: string
let j1Id: string
let j2Id: string
let j3Id: string
let testRoomId: string
let slotId: string // fresh 1-seat GD slot before each test

beforeAll(async () => {
  if (!SERVICE) throw new Error('SUPABASE_SERVICE_ROLE_KEY not set')

  adminSb = createClient(URL, SERVICE, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  hostId   = await upsertUser(HOST_EMAIL, PASSWORD)
  adminId  = await upsertUser(ADMIN_EMAIL, PASSWORD)
  mentorId = await upsertUser(MENTOR_EMAIL, PASSWORD)
  j1Id     = await upsertUser(J1_EMAIL, PASSWORD)
  j2Id     = await upsertUser(J2_EMAIL, PASSWORD)
  j3Id     = await upsertUser(J3_EMAIL, PASSWORD)

  // j1 & j2 share mentor M (tests CC dedup); j3 has no mentor (tests null-free CC)
  await adminSb.from('profiles').upsert([
    { id: hostId,   email: HOST_EMAIL,   name: 'CF Host',   year: 'second', batch: 'PGP 2024-26', section: 'A', roll: 'CFHOST', can_host_gd: true,  can_host_pi: false, is_mentor: false, is_committee: false, is_crisp_admin: false, is_sac: false, mentor_id: null },
    { id: adminId,  email: ADMIN_EMAIL,  name: 'CF Admin',  year: 'second', batch: 'PGP 2024-26', section: 'A', roll: 'CFADMN', can_host_gd: false, can_host_pi: false, is_mentor: false, is_committee: false, is_crisp_admin: true,  is_sac: false, mentor_id: null },
    { id: mentorId, email: MENTOR_EMAIL, name: 'CF Mentor', year: 'second', batch: 'PGP 2024-26', section: 'A', roll: 'CFMNTR', can_host_gd: false, can_host_pi: false, is_mentor: true,  is_committee: false, is_crisp_admin: false, is_sac: false, mentor_id: null },
    { id: j1Id,     email: J1_EMAIL,     name: 'CF J1',     year: 'first',  batch: 'PGP 2025-27', section: 'B', roll: 'CFJ001', can_host_gd: false, can_host_pi: false, is_mentor: false, is_committee: false, is_crisp_admin: false, is_sac: false, mentor_id: mentorId },
    { id: j2Id,     email: J2_EMAIL,     name: 'CF J2',     year: 'first',  batch: 'PGP 2025-27', section: 'B', roll: 'CFJ002', can_host_gd: false, can_host_pi: false, is_mentor: false, is_committee: false, is_crisp_admin: false, is_sac: false, mentor_id: mentorId },
    { id: j3Id,     email: J3_EMAIL,     name: 'CF J3',     year: 'first',  batch: 'PGP 2025-27', section: 'B', roll: 'CFJ003', can_host_gd: false, can_host_pi: false, is_mentor: false, is_committee: false, is_crisp_admin: false, is_sac: false, mentor_id: null },
  ])

  const { data: room } = await adminSb
    .from('rooms')
    .upsert({ name: '__cf-test-room__', location: 'Block C', capacity: 10, is_live: true }, { onConflict: 'name' })
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
  await adminSb.from('rooms').delete().eq('name', '__cf-test-room__')
  for (const id of [hostId, adminId, mentorId, j1Id, j2Id, j3Id]) {
    if (id) await adminSb.auth.admin.deleteUser(id)
  }
}, 30_000)

beforeEach(async () => {
  // Clear any prior enrollments so the time_conflict check doesn't block re-joining
  for (const uid of [j1Id, j2Id, j3Id]) {
    if (uid) await adminSb.from('enrollments').delete().eq('user_id', uid)
  }
  slotId = await makeSlot(1)
})

async function makeSlot(capacity: number): Promise<string> {
  const now = new Date()
  const { data: slot } = await adminSb
    .from('slots')
    .insert({
      type: 'GD',
      host_id: hostId,
      room_id: testRoomId,
      start_at: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
      end_at:   new Date(now.getTime() + 90 * 60 * 1000).toISOString(),
      topic: '__cf-test-slot__',
      internship: 'McKinsey',
      capacity,
    })
    .select('id')
    .single()
  return slot!.id
}

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

const confirmedAtOf = async (id: string) =>
  (await adminSb.from('slots').select('confirmed_at').eq('id', id).single()).data?.confirmed_at

describe('confirm_slot', () => {
  it('host confirms → confirmed students in To, mentor in CC, confirmed_at stamped, joins then locked', async () => {
    await j1Client.rpc('join_slot', { p_slot_id: slotId, p_user_id: j1Id }) // confirmed (cap 1 → full)
    await j2Client.rpc('join_slot', { p_slot_id: slotId, p_user_id: j2Id }) // waitlist

    const { data, error } = await hostClient.rpc('confirm_slot', { p_slot_id: slotId })
    expect(error).toBeNull()
    expect(data.error).toBeUndefined()
    expect(data.to).toEqual([J1_EMAIL])           // confirmed only
    expect(data.to).not.toContain(J2_EMAIL)       // waitlisted excluded
    expect(data.cc).toEqual([MENTOR_EMAIL])
    expect(data.students).toHaveLength(1)
    expect(data.students[0].email).toBe(J1_EMAIL)
    expect(data.slot.topic).toBe('__cf-test-slot__')
    expect(data.slot.internship).toBe('McKinsey')
    expect(data.slot.host_name).toBe('CF Host')

    expect(await confirmedAtOf(slotId)).not.toBeNull()

    // Lineup is final → a new junior can no longer join
    const { data: jr } = await j3Client.rpc('join_slot', { p_slot_id: slotId, p_user_id: j3Id })
    expect(jr.error).toBe('lineup_confirmed')
  })

  it('CC is deduplicated when confirmed students share a mentor', async () => {
    const sid = await makeSlot(2)
    await j1Client.rpc('join_slot', { p_slot_id: sid, p_user_id: j1Id }) // confirmed, mentor M
    await j2Client.rpc('join_slot', { p_slot_id: sid, p_user_id: j2Id }) // confirmed, mentor M

    const { data } = await hostClient.rpc('confirm_slot', { p_slot_id: sid })
    expect(data.to).toEqual([J1_EMAIL, J2_EMAIL]) // ordered by name
    expect(data.cc).toEqual([MENTOR_EMAIL])       // both share M → one CC
  })

  it('a confirmed student with no mentor yields an empty CC list', async () => {
    await j3Client.rpc('join_slot', { p_slot_id: slotId, p_user_id: j3Id }) // confirmed, no mentor

    const { data } = await hostClient.rpc('confirm_slot', { p_slot_id: slotId })
    expect(data.to).toEqual([J3_EMAIL])
    expect(data.cc).toEqual([])
  })

  it('a CRISP admin (can_manage_rooms) can confirm a slot they do not host', async () => {
    await j1Client.rpc('join_slot', { p_slot_id: slotId, p_user_id: j1Id })

    const { data } = await adminClient.rpc('confirm_slot', { p_slot_id: slotId })
    expect(data.error).toBeUndefined()
    expect(data.to).toEqual([J1_EMAIL])
  })

  it('a plain junior cannot confirm → unauthorized, confirmed_at stays null', async () => {
    await j1Client.rpc('join_slot', { p_slot_id: slotId, p_user_id: j1Id })

    const { data } = await j1Client.rpc('confirm_slot', { p_slot_id: slotId })
    expect(data.error).toBe('unauthorized')
    expect(await confirmedAtOf(slotId)).toBeNull()
  })

  it('confirming an empty lineup is refused and does not lock the slot', async () => {
    const { data } = await hostClient.rpc('confirm_slot', { p_slot_id: slotId })
    expect(data.error).toBe('no_confirmed_students')
    expect(await confirmedAtOf(slotId)).toBeNull()

    // still joinable
    const { data: jr } = await j1Client.rpc('join_slot', { p_slot_id: slotId, p_user_id: j1Id })
    expect(jr.status).toBe('confirmed')
  })
})
