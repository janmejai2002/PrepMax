/**
 * slot_requests lifecycle tests.
 * Verifies: create → senior expresses interest → junior sees seniors →
 * junior confirms match → request leaves feed. Plus fraud/permission paths.
 */
import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { resolve } from 'path'

dotenv.config({ path: resolve(process.cwd(), '.env.local') })

const URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SVC  = process.env.SUPABASE_SERVICE_ROLE_KEY!

const JUNIOR_EMAIL  = 'req-junior@prepmax-test.local'
const SENIOR1_EMAIL = 'req-senior1@prepmax-test.local'
const SENIOR2_EMAIL = 'req-senior2@prepmax-test.local'
const OUTSIDER_EMAIL = 'req-outsider@prepmax-test.local'
const PASSWORD = 'req-test-pass-2026!'

let adminSb:       SupabaseClient
let juniorClient:  SupabaseClient
let senior1Client: SupabaseClient
let senior2Client: SupabaseClient
let outsiderClient:SupabaseClient
let juniorId:  string
let senior1Id: string

let requestId: string  // created in the first test group, used throughout

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
    whatsapp: canHost ? '919876543210' : null,
    phone: canHost ? '9876543210' : null,
  }, { onConflict: 'id' })
  return uid
}

async function loginClient(email: string): Promise<SupabaseClient> {
  const c = createClient(URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } })
  await c.auth.signInWithPassword({ email, password: PASSWORD })
  return c
}

beforeAll(async () => {
  if (!SVC) throw new Error('SUPABASE_SERVICE_ROLE_KEY not set')
  adminSb = createClient(URL, SVC, { auth: { autoRefreshToken: false, persistSession: false } })

  juniorId  = await makeUser(JUNIOR_EMAIL, false)
  senior1Id = await makeUser(SENIOR1_EMAIL, true)
  await makeUser(SENIOR2_EMAIL, true)
  await makeUser(OUTSIDER_EMAIL, false)

  juniorClient   = await loginClient(JUNIOR_EMAIL)
  senior1Client  = await loginClient(SENIOR1_EMAIL)
  senior2Client  = await loginClient(SENIOR2_EMAIL)
  outsiderClient = await loginClient(OUTSIDER_EMAIL)
}, 60_000)

afterAll(async () => {
  // Clean up requests created during tests
  const { data: users } = await adminSb.auth.admin.listUsers({ perPage: 1000 })
  const emails = [JUNIOR_EMAIL, SENIOR1_EMAIL, SENIOR2_EMAIL, OUTSIDER_EMAIL]
  for (const email of emails) {
    const u = users?.users?.find((x) => x.email === email)
    if (u) {
      // Delete profile requests first (cascade should handle it, but be explicit)
      await adminSb.from('slot_requests').delete().eq('junior_id', u.id)
      await adminSb.auth.admin.deleteUser(u.id)
    }
  }
})

describe('create_slot_request', () => {
  it('junior can create a request', async () => {
    const preferred = new Date(Date.now() + 3_600_000).toISOString()
    const { data, error } = await juniorClient.rpc('create_slot_request', {
      p_location:     'Library',
      p_preferred_at: preferred,
      p_background:   'First year, Finance background, 1 GD done',
      p_description:  'Looking for a mock GD on a business case topic',
    })
    expect(error).toBeNull()
    expect(data.error).toBeUndefined()
    expect(typeof data.id).toBe('string')
    expect(data.status).toBe('open')
    requestId = data.id
  })

  it('rejects request with too-short background', async () => {
    const { data } = await juniorClient.rpc('create_slot_request', {
      p_location:     'Library',
      p_preferred_at: new Date(Date.now() + 3_600_000).toISOString(),
      p_background:   'ok',
      p_description:  'Looking for a mock GD on a business case topic',
    })
    expect(data.error).toBe('background_required')
  })

  it('rejects request with too-short description', async () => {
    const { data } = await juniorClient.rpc('create_slot_request', {
      p_location:     'Library',
      p_preferred_at: new Date(Date.now() + 3_600_000).toISOString(),
      p_background:   'First year, Finance',
      p_description:  'short',
    })
    expect(data.error).toBe('description_required')
  })
})

describe('get_open_requests — senior browse feed', () => {
  it('senior sees the open request (without junior_id)', async () => {
    const { data, error } = await senior1Client.rpc('get_open_requests')
    expect(error).toBeNull()
    const requests = Array.isArray(data) ? data : []
    const found = requests.find((r: { id: string }) => r.id === requestId)
    expect(found).toBeTruthy()
    // junior_id must NOT be present in the anonymous feed
    expect(found.junior_id).toBeUndefined()
    expect(found.location).toBe('Library')
    expect(found.interest_count).toBe(0)
    expect(found.i_am_interested).toBe(false)
  })

  it('junior cannot access the senior browse feed (redirect handles it, but RPC still returns data)', async () => {
    // The RPC itself doesn't gate juniors — the page does (server redirect).
    // We only verify the response is valid JSON and doesn't crash.
    const { error } = await juniorClient.rpc('get_open_requests')
    expect(error).toBeNull()  // RPC works; route-level gate prevents page access
  })
})

describe('express_interest', () => {
  it('FRAUD: junior (non-host) cannot express interest (seniors_only)', async () => {
    const { data } = await outsiderClient.rpc('express_interest', {
      p_request_id: requestId,
    })
    expect(data.error).toBe('seniors_only')
  })

  it('senior1 can express interest', async () => {
    const { data, error } = await senior1Client.rpc('express_interest', {
      p_request_id: requestId,
    })
    expect(error).toBeNull()
    expect(data.status).toBe('interested')
  })

  it('express_interest is idempotent (second call is a no-op)', async () => {
    const { data } = await senior1Client.rpc('express_interest', {
      p_request_id: requestId,
    })
    expect(data.status).toBe('interested')
  })

  it('interest_count reflects the new interest in feed', async () => {
    const { data } = await senior1Client.rpc('get_open_requests')
    const found = (Array.isArray(data) ? data : []).find(
      (r: { id: string }) => r.id === requestId
    )
    expect(found?.interest_count).toBe(1)
    expect(found?.i_am_interested).toBe(true)
  })

  it('senior2 can also express interest', async () => {
    const { data } = await senior2Client.rpc('express_interest', {
      p_request_id: requestId,
    })
    expect(data.status).toBe('interested')
  })
})

describe('get_my_requests — junior view with interested seniors', () => {
  it('junior sees their request with both interested seniors', async () => {
    const { data, error } = await juniorClient.rpc('get_my_requests')
    expect(error).toBeNull()
    const requests = Array.isArray(data) ? data : []
    const found = requests.find((r: { id: string }) => r.id === requestId)
    expect(found).toBeTruthy()
    expect(found.status).toBe('open')
    expect(Array.isArray(found.interested_seniors)).toBe(true)
    expect(found.interested_seniors.length).toBe(2)
    // Senior contact info is revealed to the junior
    const names = found.interested_seniors.map((s: { name: string }) => s.name)
    expect(names).toContain('req-senior1')
    expect(names).toContain('req-senior2')
  })
})

describe('retract_interest', () => {
  it('senior2 can retract interest', async () => {
    const { data } = await senior2Client.rpc('retract_interest', {
      p_request_id: requestId,
    })
    expect(data.status).toBe('retracted')
  })

  it('interest count drops to 1 after retraction', async () => {
    const { data } = await senior1Client.rpc('get_open_requests')
    const found = (Array.isArray(data) ? data : []).find(
      (r: { id: string }) => r.id === requestId
    )
    expect(found?.interest_count).toBe(1)
  })
})

describe('confirm_match', () => {
  it('FRAUD: senior cannot confirm a match on someone else\'s request (unauthorized)', async () => {
    const { data } = await senior1Client.rpc('confirm_match', {
      p_request_id: requestId,
      p_senior_id:  senior1Id,
    })
    expect(data.error).toBe('unauthorized')
  })

  it('FRAUD: cannot confirm a senior who hasn\'t expressed interest', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000001'
    const { data } = await juniorClient.rpc('confirm_match', {
      p_request_id: requestId,
      p_senior_id:  fakeId,
    })
    // senior_not_interested OR not_found — either proves the check works
    expect(['senior_not_interested', 'senior_not_found']).toContain(data.error)
  })

  it('junior confirms senior1 → request is matched', async () => {
    const { data, error } = await juniorClient.rpc('confirm_match', {
      p_request_id: requestId,
      p_senior_id:  senior1Id,
    })
    expect(error).toBeNull()
    expect(data.status).toBe('matched')
    expect(data.senior_id).toBe(senior1Id)
    expect(data.senior_name).toBe('req-senior1')
    // WhatsApp number exposed to junior after match
    expect(typeof data.senior_whatsapp).toBe('string')
  })

  it('matched request disappears from the open requests feed', async () => {
    const { data } = await senior1Client.rpc('get_open_requests')
    const found = (Array.isArray(data) ? data : []).find(
      (r: { id: string }) => r.id === requestId
    )
    expect(found).toBeUndefined()
  })

  it('cannot confirm_match a second time on an already-matched request', async () => {
    const { data } = await juniorClient.rpc('confirm_match', {
      p_request_id: requestId,
      p_senior_id:  senior1Id,
    })
    expect(data.error).toBe('request_not_open')
    expect(data.status).toBe('matched')
  })
})

describe('cancel_slot_request', () => {
  it('junior can cancel their own open request', async () => {
    // Create a fresh request to cancel
    const { data: created } = await juniorClient.rpc('create_slot_request', {
      p_location:     'Common Room',
      p_preferred_at: new Date(Date.now() + 7_200_000).toISOString(),
      p_background:   'First year, wants to improve',
      p_description:  'Looking for PI mock — any sector welcome',
    })
    const cancelId = created.id

    const { data, error } = await juniorClient.rpc('cancel_slot_request', {
      p_request_id: cancelId,
    })
    expect(error).toBeNull()
    expect(data.status).toBe('cancelled')
  })

  it('FRAUD: senior cannot cancel another junior\'s request (unauthorized)', async () => {
    // Use the already-matched requestId
    const { data } = await senior1Client.rpc('cancel_slot_request', {
      p_request_id: requestId,
    })
    expect(data.error).toBe('unauthorized')
  })
})
