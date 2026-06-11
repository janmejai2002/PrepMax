/**
 * RLS integration tests — run against the live Supabase instance.
 * Creates ephemeral test users with passwords, cleans up after each suite.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in .env.local.
 */
import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { resolve } from 'path'

dotenv.config({ path: resolve(process.cwd(), '.env.local') })

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!

const JUNIOR_EMAIL = 'rls-test-junior@prepmax-test.local'
const ADMIN_EMAIL = 'rls-test-admin@prepmax-test.local'
const SAC_EMAIL = 'rls-test-sac@prepmax-test.local'
const PASSWORD = 'rls-test-pass-2026!'

let adminSb: SupabaseClient
let juniorClient: SupabaseClient
let crisprClient: SupabaseClient
let sacClient: SupabaseClient
let juniorId: string
let adminUserId: string
let sacUserId: string
let testRoomId: string

beforeAll(async () => {
  if (!SERVICE) throw new Error('SUPABASE_SERVICE_ROLE_KEY not set — add it to .env.local')

  adminSb = createClient(URL, SERVICE, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Create or reuse junior test user
  juniorId = await upsertUser(JUNIOR_EMAIL, PASSWORD)
  adminUserId = await upsertUser(ADMIN_EMAIL, PASSWORD)
  sacUserId = await upsertUser(SAC_EMAIL, PASSWORD)

  // Seed their profiles via service role (bypasses RLS)
  await adminSb.from('profiles').upsert([
    {
      id: juniorId,
      email: JUNIOR_EMAIL,
      name: 'RLS Junior',
      year: 'first',
      batch: 'PGP 2025-27',
      section: 'A',
      roll: 'RLSJ001',
      can_host_gd: false,
      can_host_pi: false,
      is_crisp: false,
      is_sac: false,
    },
    {
      id: adminUserId,
      email: ADMIN_EMAIL,
      name: 'RLS Admin',
      year: 'second',
      batch: 'PGP 2024-26',
      section: 'B',
      roll: 'RLSA001',
      can_host_gd: true,
      can_host_pi: true,
      is_crisp: true,
      is_sac: false,
    },
    {
      id: sacUserId,
      email: SAC_EMAIL,
      name: 'RLS SAC',
      year: 'second',
      batch: 'PGP 2024-26',
      section: 'C',
      roll: 'RLSS001',
      can_host_gd: false,
      can_host_pi: false,
      is_crisp: false,
      is_sac: true,
    },
  ])

  // Seed a test room
  const { data: room } = await adminSb
    .from('rooms')
    .upsert({ name: '__rls-test-room__', location: 'Test', capacity: 5, is_live: false }, { onConflict: 'name' })
    .select('id')
    .single()
  testRoomId = room!.id

  // Build authenticated clients
  juniorClient = await buildUserClient(JUNIOR_EMAIL, PASSWORD)
  crisprClient = await buildUserClient(ADMIN_EMAIL, PASSWORD)
  sacClient = await buildUserClient(SAC_EMAIL, PASSWORD)
}, 60_000)

afterAll(async () => {
  if (!adminSb) return
  // Clean up test users and their profiles (cascade deletes profile)
  for (const id of [juniorId, adminUserId, sacUserId]) {
    if (id) await adminSb.auth.admin.deleteUser(id)
  }
  await adminSb.from('rooms').delete().eq('name', '__rls-test-room__')
}, 30_000)

async function upsertUser(email: string, password: string): Promise<string> {
  const { data: list } = await adminSb.auth.admin.listUsers({ perPage: 1000 })
  const existing = list?.users.find((u) => u.email === email)
  if (existing) return existing.id

  const { data, error } = await adminSb.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error) throw error
  return data.user.id
}

async function buildUserClient(email: string, password: string): Promise<SupabaseClient> {
  const client = createClient(URL, ANON, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`Sign-in failed for ${email}: ${error.message}`)
  return client
}

// ── Test 1: first-year JWT reads own profile ──────────────────────────────────
describe('profiles — first-year user', () => {
  it('can read their own profile', async () => {
    const { data, error } = await juniorClient
      .from('profiles')
      .select('id, name')
      .eq('id', juniorId)

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data![0].id).toBe(juniorId)
  })

  it('cannot read another user\'s profile', async () => {
    const { data, error } = await juniorClient
      .from('profiles')
      .select('id, name')
      .eq('id', adminUserId)

    // RLS filters the row — empty result, no error
    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })

  it('cannot update can_host_gd on their own profile', async () => {
    const { error } = await juniorClient
      .from('profiles')
      .update({ can_host_gd: true })
      .eq('id', juniorId)

    // Either an explicit error or 0 rows updated (RLS WITH CHECK blocks it)
    const { data: check } = await adminSb
      .from('profiles')
      .select('can_host_gd')
      .eq('id', juniorId)
      .single()

    expect(check?.can_host_gd).toBe(false)
  })

  it('cannot update another user\'s capability flags', async () => {
    await juniorClient
      .from('profiles')
      .update({ is_crisp: false })
      .eq('id', adminUserId)

    // Admin profile must remain untouched
    const { data: check } = await adminSb
      .from('profiles')
      .select('is_crisp')
      .eq('id', adminUserId)
      .single()

    expect(check?.is_crisp).toBe(true)
  })
})

// ── Test 2: CRISP admin JWT can toggle is_live on rooms ───────────────────────
describe('rooms — CRISP admin', () => {
  it('can toggle is_live on any room', async () => {
    const { error } = await crisprClient
      .from('rooms')
      .update({ is_live: true })
      .eq('id', testRoomId)

    expect(error).toBeNull()

    const { data } = await adminSb
      .from('rooms')
      .select('is_live')
      .eq('id', testRoomId)
      .single()

    expect(data?.is_live).toBe(true)

    // Reset
    await adminSb.from('rooms').update({ is_live: false }).eq('id', testRoomId)
  })
})

// ── Test 3: non-CRISP JWT cannot update rooms ─────────────────────────────────
describe('rooms — non-CRISP user', () => {
  it('cannot update any room', async () => {
    await juniorClient
      .from('rooms')
      .update({ capacity: 999 })
      .eq('id', testRoomId)

    const { data } = await adminSb
      .from('rooms')
      .select('capacity')
      .eq('id', testRoomId)
      .single()

    expect(data?.capacity).toBe(5)
  })
})

// ── Test 4: SAC user (is_sac=true, is_crisp=false) can manage rooms ──────────
describe('rooms — SAC user', () => {
  it('can toggle is_live (via can_manage_rooms)', async () => {
    const { error } = await sacClient
      .from('rooms')
      .update({ is_live: true })
      .eq('id', testRoomId)

    expect(error).toBeNull()

    const { data } = await adminSb
      .from('rooms')
      .select('is_live')
      .eq('id', testRoomId)
      .single()

    expect(data?.is_live).toBe(true)

    // Reset
    await adminSb.from('rooms').update({ is_live: false }).eq('id', testRoomId)
  })
})
