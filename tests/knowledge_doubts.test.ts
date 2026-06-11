/**
 * Integration tests for Knowledge + Doubts flows.
 * Exercises RPCs end-to-end against the live Supabase instance.
 */
import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { resolve } from 'path'

dotenv.config({ path: resolve(process.cwd(), '.env.local') })

const URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SVC  = process.env.SUPABASE_SERVICE_ROLE_KEY!

const COMM_EMAIL   = 'kd-test-committee@prepmax-test.local'
const JUNIOR_EMAIL = 'kd-test-junior@prepmax-test.local'
const SENIOR_EMAIL = 'kd-test-senior@prepmax-test.local'
const PASSWORD     = 'kd-test-pass-2026!'

let adminSb:    SupabaseClient
let commClient: SupabaseClient
let juniorClient: SupabaseClient
let seniorClient: SupabaseClient
let commId: string
let juniorId: string
let seniorId: string

// ids created during tests — tracked for cleanup
let postId:   string
let doubtId:  string
let doubt2Id: string
let answerId: string

// ── helpers ───────────────────────────────────────────────────────────────────

async function upsertUser(email: string, pw: string): Promise<string> {
  const { data: list } = await adminSb.auth.admin.listUsers({ perPage: 1000 })
  const existing = list?.users.find((u) => u.email === email)
  if (existing) return existing.id
  const { data, error } = await adminSb.auth.admin.createUser({
    email, password: pw, email_confirm: true,
  })
  if (error) throw error
  return data.user.id
}

async function buildClient(email: string, pw: string): Promise<SupabaseClient> {
  const c = createClient(URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } })
  const { error } = await c.auth.signInWithPassword({ email, password: pw })
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`)
  return c
}

// ── setup / teardown ──────────────────────────────────────────────────────────

beforeAll(async () => {
  if (!SVC) throw new Error('SUPABASE_SERVICE_ROLE_KEY not set')
  adminSb = createClient(URL, SVC, { auth: { autoRefreshToken: false, persistSession: false } })

  commId   = await upsertUser(COMM_EMAIL,   PASSWORD)
  juniorId = await upsertUser(JUNIOR_EMAIL, PASSWORD)
  seniorId = await upsertUser(SENIOR_EMAIL, PASSWORD)

  await adminSb.from('profiles').upsert([
    {
      id: commId, email: COMM_EMAIL, name: 'KD Committee',
      year: 'second', batch: 'PGP 2024', section: 'A', roll: 'KDC001',
      is_committee: true, is_crisp_admin: false, is_sac: false,
      can_host_gd: false, can_host_pi: false, is_mentor: false,
    },
    {
      id: juniorId, email: JUNIOR_EMAIL, name: 'KD Junior',
      year: 'first', batch: 'PGP 2026', section: 'B', roll: 'KDJ001',
      is_committee: false, is_crisp_admin: false, is_sac: false,
      can_host_gd: false, can_host_pi: false, is_mentor: false,
    },
    {
      id: seniorId, email: SENIOR_EMAIL, name: 'KD Senior',
      year: 'second', batch: 'PGP 2024', section: 'C', roll: 'KDS001',
      is_committee: false, is_crisp_admin: false, is_sac: false,
      can_host_gd: true, can_host_pi: false, is_mentor: false,
    },
  ])

  commClient   = await buildClient(COMM_EMAIL,   PASSWORD)
  juniorClient = await buildClient(JUNIOR_EMAIL, PASSWORD)
  seniorClient = await buildClient(SENIOR_EMAIL, PASSWORD)
}, 60_000)

afterAll(async () => {
  if (!adminSb) return
  // knowledge posts + doubts cascade-delete children; delete users cleans profiles
  await adminSb.from('knowledge_posts').delete().in('id', [postId].filter(Boolean))
  await adminSb.from('doubts').delete().in('id', [doubtId, doubt2Id].filter(Boolean))
  for (const id of [commId, juniorId, seniorId]) {
    if (id) await adminSb.auth.admin.deleteUser(id)
  }
}, 30_000)

// ── Knowledge posts ───────────────────────────────────────────────────────────

describe('knowledge — create', () => {
  it('committee user can create a knowledge post', async () => {
    const { data, error } = await commClient.rpc('create_knowledge_post', {
      p_title:        'Consulting frameworks for case GDs',
      p_body:         'Use MECE. Break the problem into components. Synthesise at the end.',
      p_tags:         ['case-gd', 'frameworks'],
      p_function_tag: 'Consulting',
      p_is_pinned:    false,
    })
    expect(error).toBeNull()
    expect(data?.status).toBe('created')
    expect(data?.id).toBeTruthy()
    postId = data.id
  })

  it('non-committee senior cannot create a knowledge post', async () => {
    const { data } = await seniorClient.rpc('create_knowledge_post', {
      p_title: 'Should not appear',
      p_body:  'This post should be blocked by the RPC guard.',
      p_tags:  [],
    })
    expect(data?.error).toBe('unauthorized')
  })

  it('junior cannot create a knowledge post', async () => {
    const { data } = await juniorClient.rpc('create_knowledge_post', {
      p_title: 'Should not appear',
      p_body:  'This post should be blocked by the RPC guard.',
      p_tags:  [],
    })
    expect(data?.error).toBe('unauthorized')
  })
})

describe('knowledge — browse & filter', () => {
  it('any authenticated user can read posts', async () => {
    const { data, error } = await juniorClient
      .from('knowledge_posts')
      .select('id, title, function_tag')
      .order('created_at', { ascending: false })
      .limit(10)
    expect(error).toBeNull()
    const ids = (data ?? []).map((p) => p.id)
    expect(ids).toContain(postId)
  })

  it('function_tag filter returns only matching posts', async () => {
    const { data, error } = await seniorClient
      .from('knowledge_posts')
      .select('id, function_tag')
      .eq('function_tag', 'Consulting')
    expect(error).toBeNull()
    expect((data ?? []).every((p) => p.function_tag === 'Consulting')).toBe(true)
    expect((data ?? []).map((p) => p.id)).toContain(postId)
  })

  it('filtering on a different tag excludes the test post', async () => {
    const { data } = await juniorClient
      .from('knowledge_posts')
      .select('id')
      .eq('function_tag', 'Finance')
    expect(((data ?? []).map((p) => p.id))).not.toContain(postId)
  })

  it('null function_tag (All) query sees the test post', async () => {
    const { data } = await juniorClient
      .from('knowledge_posts')
      .select('id')
      .eq('id', postId)
    expect(data?.length).toBe(1)
  })
})

// ── Doubts ────────────────────────────────────────────────────────────────────

describe('doubts — post', () => {
  it('junior can post a doubt', async () => {
    const { data, error } = await juniorClient.rpc('post_doubt', {
      p_question:     'What is the best way to introduce yourself in a PI?',
      p_function_tag: 'General Mgmt',
    })
    expect(error).toBeNull()
    expect(data?.status).toBe('created')
    expect(data?.id).toBeTruthy()
    doubtId = data.id
  })

  it('senior can also post a doubt', async () => {
    const { data, error } = await seniorClient.rpc('post_doubt', {
      p_question:     'How do you handle a hostile panelist?',
      p_function_tag: null,
    })
    expect(error).toBeNull()
    doubt2Id = data.id
  })

  it('posted doubt appears in doubts_feed with i_voted=false', async () => {
    const { data, error } = await juniorClient
      .from('doubts_feed')
      .select('id, question, i_voted, vote_count, answer_count')
      .eq('id', doubtId)
      .single()
    expect(error).toBeNull()
    expect(data?.question).toContain('introduce yourself')
    expect(data?.i_voted).toBe(false)
    expect(data?.vote_count).toBe(0)
    expect(data?.answer_count).toBe(0)
  })
})

describe('doubts — answers', () => {
  it('senior can answer a doubt', async () => {
    const { data, error } = await seniorClient.rpc('post_answer', {
      p_doubt_id: doubtId,
      p_body:     'Lead with your name, degree, and one unique thing you did. Keep it under 60 seconds.',
    })
    expect(error).toBeNull()
    expect(data?.status).toBe('created')
    answerId = data.id
  })

  it('committee can also answer', async () => {
    const { data, error } = await commClient.rpc('post_answer', {
      p_doubt_id: doubtId,
      p_body:     'Tailor your intro to the company you are applying for.',
    })
    expect(error).toBeNull()
    expect(data?.status).toBe('created')
  })

  it('answer_count increments on the doubt', async () => {
    const { data } = await juniorClient
      .from('doubts')
      .select('answer_count')
      .eq('id', doubtId)
      .single()
    expect(data?.answer_count).toBe(2)
  })

  it('post_answer returns doubt_not_found for an unknown id', async () => {
    const { data } = await seniorClient.rpc('post_answer', {
      p_doubt_id: '00000000-0000-0000-0000-000000000000',
      p_body:     'This should not work.',
    })
    expect(data?.error).toBe('doubt_not_found')
  })
})

describe('doubts — votes', () => {
  it('senior can upvote a doubt → voted=true, count increments', async () => {
    const { data, error } = await seniorClient.rpc('toggle_doubt_vote', { p_doubt_id: doubtId })
    expect(error).toBeNull()
    expect(data?.voted).toBe(true)

    const { data: d } = await seniorClient
      .from('doubts')
      .select('vote_count')
      .eq('id', doubtId)
      .single()
    expect(d?.vote_count).toBe(1)
  })

  it('doubts_feed shows i_voted=true for the voter', async () => {
    const { data } = await seniorClient
      .from('doubts_feed')
      .select('i_voted, vote_count')
      .eq('id', doubtId)
      .single()
    expect(data?.i_voted).toBe(true)
    expect(data?.vote_count).toBe(1)
  })

  it('doubts_feed shows i_voted=false for a different user', async () => {
    const { data } = await commClient
      .from('doubts_feed')
      .select('i_voted')
      .eq('id', doubtId)
      .single()
    expect(data?.i_voted).toBe(false)
  })

  it('toggling again un-votes → voted=false, count back to 0', async () => {
    const { data } = await seniorClient.rpc('toggle_doubt_vote', { p_doubt_id: doubtId })
    expect(data?.voted).toBe(false)

    const { data: d } = await seniorClient
      .from('doubts')
      .select('vote_count')
      .eq('id', doubtId)
      .single()
    expect(d?.vote_count).toBe(0)
  })

  it('re-upvoting works after un-voting', async () => {
    const { data } = await seniorClient.rpc('toggle_doubt_vote', { p_doubt_id: doubtId })
    expect(data?.voted).toBe(true)
  })
})

describe('doubts — accept answer', () => {
  it('non-author cannot accept an answer → unauthorized', async () => {
    const { data } = await seniorClient.rpc('accept_answer', { p_answer_id: answerId })
    expect(data?.error).toBe('unauthorized')
  })

  it('doubt author accepts the first answer → is_accepted=true, doubt resolved', async () => {
    const { data, error } = await juniorClient.rpc('accept_answer', { p_answer_id: answerId })
    expect(error).toBeNull()
    expect(data?.status).toBe('accepted')

    const { data: ans } = await adminSb
      .from('doubt_answers')
      .select('is_accepted')
      .eq('id', answerId)
      .single()
    expect(ans?.is_accepted).toBe(true)

    const { data: dbt } = await adminSb
      .from('doubts')
      .select('is_resolved')
      .eq('id', doubtId)
      .single()
    expect(dbt?.is_resolved).toBe(true)
  })

  it('resolved doubt appears in doubts_feed with is_resolved=true', async () => {
    const { data } = await juniorClient
      .from('doubts_feed')
      .select('is_resolved')
      .eq('id', doubtId)
      .single()
    expect(data?.is_resolved).toBe(true)
  })

  it('accept_answer returns answer_not_found for unknown id', async () => {
    const { data } = await juniorClient.rpc('accept_answer', {
      p_answer_id: '00000000-0000-0000-0000-000000000000',
    })
    expect(data?.error).toBe('answer_not_found')
  })
})
