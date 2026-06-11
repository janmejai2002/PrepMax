/**
 * Phase 3 integration tests: start_slot, rotate_token, check_in, finalize_slot,
 * submit_feedback, get_slot_detail.
 *
 * Runs against the live Supabase instance.
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

const HOST_EMAIL   = 'p3-host@prepmax-test.local'
const JUDGE_EMAIL  = 'p3-judge@prepmax-test.local'
const JUNIOR_EMAIL = 'p3-junior@prepmax-test.local'
const OUTSIDER_EMAIL = 'p3-outsider@prepmax-test.local'
const PASSWORD     = 'p3-test-pass-2026!'

let adminSb:    SupabaseClient
let hostClient: SupabaseClient
let judgeClient: SupabaseClient
let juniorClient: SupabaseClient
let outsiderClient: SupabaseClient

let hostId: string
let judgeId: string
let juniorId: string
let outsiderId: string
let roomId: string
let slotId: string

async function makeUser(email: string): Promise<string> {
  const { data } = await adminSb.auth.admin.createUser({
    email, password: PASSWORD, email_confirm: true,
  })
  const uid = data.user!.id
  await adminSb.from('profiles').upsert({
    id: uid, email, name: email.split('@')[0],
    year: 'second', can_host_gd: true, can_host_pi: true,
    is_mentor: false, is_committee: false, is_crisp_admin: false, is_sac: false,
  }, { onConflict: 'id' })
  return uid
}

async function loginClient(email: string): Promise<SupabaseClient> {
  const c = createClient(URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } })
  await c.auth.signInWithPassword({ email, password: PASSWORD })
  return c
}

beforeAll(async () => {
  if (!SERVICE) throw new Error('SUPABASE_SERVICE_ROLE_KEY not set')
  adminSb = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } })

  hostId     = await makeUser(HOST_EMAIL)
  judgeId    = await makeUser(JUDGE_EMAIL)
  juniorId   = await makeUser(JUNIOR_EMAIL)
  outsiderId = await makeUser(OUTSIDER_EMAIL)

  // junior year=first so they cannot host
  await adminSb.from('profiles').update({ year: 'first', can_host_gd: false, can_host_pi: false })
    .eq('id', juniorId)

  hostClient    = await loginClient(HOST_EMAIL)
  judgeClient   = await loginClient(JUDGE_EMAIL)
  juniorClient  = await loginClient(JUNIOR_EMAIL)
  outsiderClient = await loginClient(OUTSIDER_EMAIL)

  // Create a test room
  const { data: room } = await adminSb.from('rooms').insert({
    name: 'P3 Test Room', location: 'Test Block', capacity: 20, is_live: true,
  }).select('id').single()
  roomId = room!.id

  // Host creates a 2-seat GD slot
  const start = new Date(Date.now() + 60_000)
  const end   = new Date(Date.now() + 3_660_000)
  const { data: slot } = await adminSb.from('slots').insert({
    type: 'GD', host_id: hostId, room_id: roomId,
    topic: 'P3 Test GD', capacity: 2, expert_areas: [],
    start_at: start.toISOString(), end_at: end.toISOString(),
  }).select('id').single()
  slotId = slot!.id

  // Add judge as co-judge
  await adminSb.from('slot_judges').insert({ slot_id: slotId, judge_id: judgeId })

  // Junior joins (uses their own client — RPC checks auth.uid() === p_user_id)
  const { error: joinErr } = await juniorClient.rpc('join_slot', { p_slot_id: slotId, p_user_id: juniorId })
  expect(joinErr).toBeNull()
}, 60_000)

afterAll(async () => {
  // Clean up
  await adminSb.from('slots').delete().eq('id', slotId)
  await adminSb.from('rooms').delete().eq('id', roomId)
  for (const uid of [hostId, judgeId, juniorId, outsiderId]) {
    await adminSb.auth.admin.deleteUser(uid)
  }
})

describe('get_slot_detail', () => {
  it('returns slot data with co_judges for any authenticated user', async () => {
    const { data, error } = await outsiderClient.rpc('get_slot_detail', { p_slot_id: slotId })
    expect(error).toBeNull()
    expect(data.id).toBe(slotId)
    expect(data.topic).toBe('P3 Test GD')
    expect(Array.isArray(data.co_judges)).toBe(true)
    expect(data.co_judges.length).toBe(1)
    expect(data.co_judges[0].id).toBe(judgeId)
  })

  it('returns is_host=true for the host', async () => {
    const { data } = await hostClient.rpc('get_slot_detail', { p_slot_id: slotId })
    expect(data.is_host).toBe(true)
    expect(data.is_judge).toBe(false)
  })

  it('returns is_judge=true for a co-judge', async () => {
    const { data } = await judgeClient.rpc('get_slot_detail', { p_slot_id: slotId })
    expect(data.is_judge).toBe(true)
    expect(data.is_host).toBe(false)
  })

  it('returns roster with names to host', async () => {
    const { data } = await hostClient.rpc('get_slot_detail', { p_slot_id: slotId })
    expect(Array.isArray(data.roster)).toBe(true)
    expect(data.roster.length).toBeGreaterThan(0)
    expect(data.roster[0].name).toBeTruthy()
  })

  it('returns count-only roster to outsider with no enrollment', async () => {
    const { data } = await outsiderClient.rpc('get_slot_detail', { p_slot_id: slotId })
    expect(typeof data.roster).toBe('object')
    expect(data.roster.count).toBeDefined()
    expect(Array.isArray(data.roster)).toBe(false)
  })

  it('returns 404 for nonexistent slot', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000'
    const { data } = await hostClient.rpc('get_slot_detail', { p_slot_id: fakeId })
    expect(data.error).toBe('slot_not_found')
  })
})

describe('start_slot', () => {
  it('rejects non-host', async () => {
    const { data } = await juniorClient.rpc('start_slot', { p_slot_id: slotId })
    expect(data.error).toBe('unauthorized')
  })

  it('host can start slot → status becomes live', async () => {
    const { data, error } = await hostClient.rpc('start_slot', { p_slot_id: slotId })
    expect(error).toBeNull()
    expect(data.token).toBeTruthy()
    expect(data.token).toHaveLength(6)
    expect(new Date(data.expires_at).getTime()).toBeGreaterThan(Date.now())

    const { data: slot } = await adminSb.from('slots').select('status').eq('id', slotId).single()
    expect(slot!.status).toBe('live')
  })

  it('returns a fresh token if already live (idempotent re-start)', async () => {
    const { data, error } = await hostClient.rpc('start_slot', { p_slot_id: slotId })
    expect(error).toBeNull()
    expect(data.token).toBeTruthy()
  })
})

describe('rotate_token', () => {
  it('co-judge can rotate the token', async () => {
    const { data, error } = await judgeClient.rpc('rotate_token', { p_slot_id: slotId })
    expect(error).toBeNull()
    expect(data.token).toBeTruthy()
    expect(data.token).toHaveLength(6)
  })

  it('outsider cannot rotate', async () => {
    const { data } = await outsiderClient.rpc('rotate_token', { p_slot_id: slotId })
    expect(data.error).toBe('unauthorized')
  })
})

describe('check_in', () => {
  let goodToken: string

  beforeAll(async () => {
    // Rotate via host to get a fresh token (adminSb lacks auth.uid() for the auth check)
    const { data } = await hostClient.rpc('rotate_token', { p_slot_id: slotId })
    goodToken = data?.token ?? ''
  })

  it('junior checks in with valid token → attended', async () => {
    const { data, error } = await juniorClient.rpc('check_in', {
      p_slot_id: slotId,
      p_token:   goodToken,
    })
    expect(error).toBeNull()
    expect(data.status).toBe('attended')

    const { data: enroll } = await adminSb
      .from('enrollments')
      .select('status, attended_at')
      .eq('slot_id', slotId).eq('user_id', juniorId).single()
    expect(enroll!.status).toBe('attended')
    expect(enroll!.attended_at).toBeTruthy()
  })

  it('second check-in is idempotent → already_attended', async () => {
    const { data, error } = await juniorClient.rpc('check_in', {
      p_slot_id: slotId,
      p_token:   goodToken,
    })
    expect(error).toBeNull()
    expect(data.status).toBe('already_attended')
  })

  it('invalid token returns error', async () => {
    const { data } = await juniorClient.rpc('check_in', {
      p_slot_id: slotId,
      p_token:   'BADTOK',
    })
    expect(data.error).toBe('invalid_or_expired_token')
  })

  it('outsider not enrolled returns not_enrolled', async () => {
    const { data } = await outsiderClient.rpc('check_in', {
      p_slot_id: slotId,
      p_token:   goodToken,
    })
    expect(data.error).toBe('not_enrolled')
  })
})

describe('submit_feedback', () => {
  it('host can submit feedback for attended participant', async () => {
    const { data, error } = await hostClient.rpc('submit_feedback', {
      p_slot_id:    slotId,
      p_to_user_id: juniorId,
      p_scores:     { clarity: 4, content: 3, confidence: 5, structure: 4 },
      p_tags:       ['Strong opener', 'Data-driven'],
      p_notes:      'Good performance overall.',
    })
    expect(error).toBeNull()
    expect(data.status).toBe('ok')

    const { data: fb } = await adminSb
      .from('feedback')
      .select('scores, tags, notes')
      .eq('slot_id', slotId).eq('to_user_id', juniorId).single()
    expect(fb!.scores.clarity).toBe(4)
    expect(fb!.tags).toContain('Strong opener')
    expect(fb!.notes).toBe('Good performance overall.')
  })

  it('co-judge can also submit feedback (upsert)', async () => {
    const { data, error } = await judgeClient.rpc('submit_feedback', {
      p_slot_id:    slotId,
      p_to_user_id: juniorId,
      p_scores:     { clarity: 5, content: 5, confidence: 4, structure: 5 },
      p_tags:       ['Clear structure'],
      p_notes:      null,
    })
    expect(error).toBeNull()
    expect(data.status).toBe('ok')
  })

  it('rejects self-feedback (host trying to give feedback to themselves)', async () => {
    // The self-feedback check runs before the slot-not-found check in the RPC
    // We pass a fake slot so the function reaches the self-check quickly
    const { data } = await hostClient.rpc('submit_feedback', {
      p_slot_id:    slotId,
      p_to_user_id: hostId,  // host IS auth.uid() here
      p_scores:     { clarity: 3, content: 3, confidence: 3, structure: 3 },
      p_tags:       [],
    })
    expect(data.error).toBe('self_feedback_not_allowed')
  })

  it('outsider cannot give feedback', async () => {
    const { data } = await outsiderClient.rpc('submit_feedback', {
      p_slot_id:    slotId,
      p_to_user_id: juniorId,
      p_scores:     {},
      p_tags:       [],
    })
    expect(data.error).toBe('unauthorized')
  })
})

describe('finalize_slot', () => {
  it('non-host cannot finalize', async () => {
    const { data } = await juniorClient.rpc('finalize_slot', { p_slot_id: slotId })
    expect(data.error).toBe('unauthorized')
  })

  it('host finalizes slot → completed, no-shows marked', async () => {
    const { data, error } = await hostClient.rpc('finalize_slot', { p_slot_id: slotId })
    expect(error).toBeNull()
    expect(data.attended).toBeGreaterThanOrEqual(1)
    // Junior attended, so no_show = 0 (there was only 1 confirmed seat taken)
    expect(data.no_show).toBe(0)

    const { data: slot } = await adminSb.from('slots').select('status').eq('id', slotId).single()
    expect(slot!.status).toBe('completed')

    // Attendance tokens cleaned up
    const { data: tokens } = await adminSb.from('attendance_tokens').select('id').eq('slot_id', slotId)
    expect(tokens?.length).toBe(0)
  })

  it('cannot finalize again (not live)', async () => {
    const { data } = await hostClient.rpc('finalize_slot', { p_slot_id: slotId })
    expect(data.error).toBe('slot_not_live')
  })
})
