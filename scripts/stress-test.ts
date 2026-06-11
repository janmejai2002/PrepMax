/**
 * Concurrency load test for join_slot (Iron Rule #1).
 *
 * Fires N concurrent join_slot RPCs from N distinct authenticated users against
 * ONE freshly-seeded slot of capacity C, then asserts the seat ledger is exact:
 *   • exactly C confirmed
 *   • exactly N-C waitlisted
 *   • 0 oversells (confirmed never exceeds capacity)
 *   • 0 duplicate (slot_id, user_id) enrolments
 *
 * join_slot enforces `auth.uid() = p_user_id`, so every caller must be a real
 * signed-in client — service-role calls would be rejected as unauthorized. We
 * therefore mint N auth users once (reused across runs) and sign each in.
 *
 * Usage:  npx tsx scripts/stress-test.ts [n=100] [capacity=6]
 * Requires SUPABASE_SERVICE_ROLE_KEY in .env.local. Cleans up after itself.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { resolve } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'

dotenv.config({ path: resolve(process.cwd(), '.env.local'), quiet: true })

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!

const N = parseInt(process.argv[2] ?? '100', 10)
const CAPACITY = parseInt(process.argv[3] ?? '6', 10)
const PASSWORD = 'stress-test-pass-2026!'
const ROOM_NAME = '__stress-test-room__'
const SLOT_TOPIC = '__stress-test-slot__'

// The /auth/v1/token bucket holds 30 tokens and refills at 1800/hr (~1 / 2s).
// We spend the burst, then space sign-ins out. Tokens (JWTs, 1h TTL) are cached
// to a gitignored file so reruns inside the hour skip the auth dance entirely.
const TOKEN_CACHE = resolve(process.cwd(), '.tmp-stress-sessions.json')
const BURST = 25
const SPACING_MS = 2200

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

if (!SERVICE) throw new Error('SUPABASE_SERVICE_ROLE_KEY not set')

const admin = createClient(URL, SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
})

/** Run async tasks in capped-concurrency batches (auth has rate limits). */
async function inBatches<T, R>(items: T[], size: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = []
  for (let i = 0; i < items.length; i += size) {
    const batch = items.slice(i, i + size)
    out.push(...(await Promise.all(batch.map((it, j) => fn(it, i + j)))))
  }
  return out
}

async function ensureUser(email: string): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true })
  if (!error && data.user) return data.user.id
  // Already exists — look it up
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const existing = list?.users.find((u) => u.email === email)
  if (!existing) throw new Error(`could not create or find user ${email}: ${error?.message}`)
  return existing.id
}

async function main() {
  const t0 = Date.now()
  console.log(`\n🔥 Stress test: ${N} concurrent joins on a ${CAPACITY}-seat slot\n`)

  const emails = Array.from({ length: N }, (_, i) => `stress-j${i}@prepmax-test.local`)

  // 1. Users + profiles (idempotent across runs)
  console.log('· minting users…')
  const ids = await inBatches(emails, 20, (email) => ensureUser(email))
  await admin.from('profiles').upsert(
    ids.map((id, i) => ({
      id,
      email: emails[i],
      name: `Stress J${i}`,
      year: 'first',
      batch: 'PGP 2025-27',
      section: 'S',
      roll: `STRESS${String(i).padStart(3, '0')}`,
      can_host_gd: false,
      can_host_pi: false,
      is_mentor: false,
      is_committee: false,
      is_crisp_admin: false,
      is_sac: false,
    }))
  )

  // 2. Fresh room + slot (capacity C, host = first user)
  console.log('· seeding room + slot…')
  const { data: room } = await admin
    .from('rooms')
    .upsert({ name: ROOM_NAME, location: 'Test', capacity: 50, is_live: true }, { onConflict: 'name' })
    .select('id')
    .single()
  const roomId = room!.id

  const now = Date.now()
  const { data: slot, error: slotErr } = await admin
    .from('slots')
    .insert({
      type: 'GD',
      host_id: ids[0],
      room_id: roomId,
      start_at: new Date(now + 60 * 60 * 1000).toISOString(),
      end_at: new Date(now + 90 * 60 * 1000).toISOString(),
      topic: SLOT_TOPIC,
      capacity: CAPACITY,
    })
    .select('id')
    .single()
  if (slotErr || !slot) throw new Error(`slot seed failed: ${slotErr?.message}`)
  const slotId = slot.id

  // 3. Get an authed client per user. Signing in 100 users at once trips the
  //    /auth/v1/token bucket (≈30 burst, refills ~1 / 2s). So: reuse cached JWTs
  //    when still valid, then sign the rest in with a burst followed by spacing.
  console.log(`· authenticating ${N} clients (cache + rate-limited sign-in)…`)
  type Session = { access_token: string; refresh_token: string; expires_at: number }
  const cache: Record<string, Session> = existsSync(TOKEN_CACHE)
    ? JSON.parse(readFileSync(TOKEN_CACHE, 'utf8'))
    : {}
  const nowSec = Math.floor(Date.now() / 1000)
  const SKEW = 120 // refresh anything within 2 min of expiry

  const makeClient = () => createClient(URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } })

  async function signIn(email: string): Promise<Session> {
    const c = makeClient()
    const { data, error } = await c.auth.signInWithPassword({ email, password: PASSWORD })
    if (error || !data.session) throw new Error(`sign-in failed for ${email}: ${error?.message}`)
    const s = data.session
    return { access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at ?? 0 }
  }

  let cacheHits = 0
  let freshSignIns = 0
  const clients: SupabaseClient[] = []
  for (let i = 0; i < emails.length; i++) {
    const email = emails[i]
    const cached = cache[email]
    let session: Session
    if (cached && cached.expires_at - SKEW > nowSec) {
      session = cached
      cacheHits++
    } else {
      // Burst the first BURST sign-ins, then space the remainder to respect the bucket.
      if (freshSignIns >= BURST) await sleep(SPACING_MS)
      session = await signIn(email)
      cache[email] = session
      freshSignIns++
    }
    const c = makeClient()
    const { error } = await c.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    })
    if (error) throw new Error(`setSession failed for ${email}: ${error.message}`)
    clients.push(c)
  }
  writeFileSync(TOKEN_CACHE, JSON.stringify(cache))
  console.log(`  (${cacheHits} cached, ${freshSignIns} fresh sign-ins)`)

  // 4. THE RACE — all N joins fire at once
  console.log(`· firing ${N} concurrent join_slot calls…\n`)
  const tRace = Date.now()
  const results = await Promise.all(
    clients.map((c, i) => c.rpc('join_slot', { p_slot_id: slotId, p_user_id: ids[i] }))
  )
  const raceMs = Date.now() - tRace

  const rpcErrors = results.filter((r) => r.error)
  const appErrors = results.filter((r) => r.data?.error)

  // 5. Read the ledger straight from the DB (source of truth)
  const { data: enrolls } = await admin
    .from('enrollments')
    .select('user_id, status, position')
    .eq('slot_id', slotId)

  const rows = enrolls ?? []
  const confirmed = rows.filter((r) => r.status === 'confirmed')
  const waitlist = rows.filter((r) => r.status === 'waitlist')

  // Duplicate (slot_id, user_id) → distinct user_ids vs row count
  const distinctUsers = new Set(rows.map((r) => r.user_id))
  const duplicates = rows.length - distinctUsers.size

  // Position integrity: confirmed 1..C and waitlist 1..(N-C), contiguous & unique
  const confirmedPos = confirmed.map((r) => r.position).sort((a, b) => a! - b!)
  const waitlistPos = waitlist.map((r) => r.position).sort((a, b) => a! - b!)
  const seq = (n: number) => Array.from({ length: n }, (_, i) => i + 1)
  const confirmedContiguous = JSON.stringify(confirmedPos) === JSON.stringify(seq(confirmed.length))
  const waitlistContiguous = JSON.stringify(waitlistPos) === JSON.stringify(seq(waitlist.length))

  const { data: slotFinal } = await admin
    .from('slots')
    .select('enrolled_count, status, capacity')
    .eq('id', slotId)
    .single()

  // 6. Assertions
  const checks = [
    { name: `exactly ${CAPACITY} confirmed`, pass: confirmed.length === CAPACITY, got: confirmed.length },
    { name: `exactly ${N - CAPACITY} waitlisted`, pass: waitlist.length === N - CAPACITY, got: waitlist.length },
    { name: '0 oversells (confirmed ≤ capacity)', pass: confirmed.length <= CAPACITY, got: confirmed.length },
    { name: '0 duplicate enrolments', pass: duplicates === 0, got: duplicates },
    { name: 'no RPC transport errors', pass: rpcErrors.length === 0, got: rpcErrors.length },
    { name: 'no app-level errors', pass: appErrors.length === 0, got: appErrors.length },
    { name: `slot.enrolled_count === ${CAPACITY}`, pass: slotFinal?.enrolled_count === CAPACITY, got: slotFinal?.enrolled_count },
    { name: "slot.status === 'full'", pass: slotFinal?.status === 'full', got: slotFinal?.status },
    { name: 'confirmed positions 1..C contiguous', pass: confirmedContiguous, got: confirmedPos.join(',') },
    { name: 'waitlist positions 1..M contiguous', pass: waitlistContiguous, got: waitlistPos.join(',') },
  ]

  console.log('─'.repeat(56))
  console.log(`Confirmed:  ${confirmed.length}`)
  console.log(`Waitlisted: ${waitlist.length}`)
  console.log(`Total rows: ${rows.length}  (distinct users: ${distinctUsers.size})`)
  console.log(`Oversells:  ${Math.max(0, confirmed.length - CAPACITY)}`)
  console.log(`Duplicates: ${duplicates}`)
  console.log(`slot.enrolled_count/${slotFinal?.capacity}: ${slotFinal?.enrolled_count}  status: ${slotFinal?.status}`)
  console.log(`Race wall-time: ${raceMs}ms  ·  total: ${Date.now() - t0}ms`)
  console.log('─'.repeat(56))
  for (const c of checks) {
    console.log(`${c.pass ? '✅' : '❌'} ${c.name}  →  ${c.got}`)
  }
  console.log('─'.repeat(56))

  const allPass = checks.every((c) => c.pass)

  // 7. Cleanup
  console.log('\n· cleaning up…')
  await admin.from('enrollments').delete().eq('slot_id', slotId)
  await admin.from('slots').delete().eq('id', slotId)
  await admin.from('rooms').delete().eq('name', ROOM_NAME)
  await inBatches(ids, 20, (id) => admin.auth.admin.deleteUser(id).then(() => undefined))

  console.log(`\n${allPass ? '🎉 PASS — zero oversell under load.' : '💥 FAIL — see ❌ above.'}\n`)
  process.exit(allPass ? 0 : 1)
}

main().catch((e) => {
  console.error('\n💥 Stress test crashed:', e)
  process.exit(1)
})
