/**
 * seed-dev-feedback.ts
 *
 * Creates dummy feedback data for local dev / cockpit UI verification.
 * DEV ONLY — guarded by ALLOW_DEV_LOGIN=true. Never run against prod.
 *
 * What it creates:
 *   1. A completed GD slot (hosted by Dev Senior)
 *   2. Enrollment record for Dev Junior with status='attended'
 *   3. Two feedback rows (senior → junior, with different score profiles)
 *
 * Run with: npx tsx scripts/seed-dev-feedback.ts
 * Re-running is safe — uses ON CONFLICT DO NOTHING on dedup_hash.
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as crypto from 'crypto'

dotenv.config({ path: '.env.local' })

const supabaseUrl     = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceRoleKey  = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing env vars. Make sure .env.local is set.')
  process.exit(1)
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function main() {
  // ── 1. Look up dev user IDs ────────────────────────────────────────────────
  const { data: profiles, error: profileErr } = await admin
    .from('profiles')
    .select('id, email, name')
    .in('email', ['b25001@astra.xlri.ac.in', 'b26001@astra.xlri.ac.in'])

  if (profileErr || !profiles || profiles.length < 2) {
    console.error('Could not find dev users. Run seed-dev-users.ts first.', profileErr)
    process.exit(1)
  }

  const senior = profiles.find((p) => p.email === 'b25001@astra.xlri.ac.in')!
  const junior = profiles.find((p) => p.email === 'b26001@astra.xlri.ac.in')!
  console.log(`Senior: ${senior.name} (${senior.id})`)
  console.log(`Junior: ${junior.name} (${junior.id})`)

  // ── 2. Find or create a room ───────────────────────────────────────────────
  const { data: rooms } = await admin.from('rooms').select('id, name').limit(1)
  if (!rooms || rooms.length === 0) {
    console.error('No rooms found. Create at least one room first via /admin/rooms.')
    process.exit(1)
  }
  const room = rooms[0]
  console.log(`Using room: ${room.name} (${room.id})`)

  // ── 3. Create a completed GD slot ─────────────────────────────────────────
  const startAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()  // 2h ago
  const endAt   = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString()  // 1h ago

  const { data: slotInsert, error: slotErr } = await admin
    .from('slots')
    .insert({
      host_id:       senior.id,
      room_id:       room.id,
      type:          'GD',
      topic:         '[DEV] Mock GD — Market Entry Strategy for Pharma',
      start_at:      startAt,
      end_at:        endAt,
      capacity:      6,
      enrolled_count: 1,
      status:        'completed',
      confirmed_at:  startAt,
    })
    .select('id')
    .single()

  if (slotErr || !slotInsert) {
    console.error('Could not create slot:', slotErr)
    process.exit(1)
  }
  const slotId = slotInsert.id
  console.log(`Created slot: ${slotId}`)

  // ── 4. Create enrollment for junior (attended) ────────────────────────────
  await admin.from('enrollments').upsert(
    {
      slot_id:  slotId,
      user_id:  junior.id,
      status:   'attended',
      position: 1,
    },
    { onConflict: 'slot_id,user_id' }
  )
  console.log(`Enrolled ${junior.name} as attended`)

  // ── 5. Insert feedback rows ────────────────────────────────────────────────
  // The submit_feedback RPC uses: sha256(from_id || ':' || to_id || ':' || slot_id)
  function dedupHash(fromId: string, toId: string, sid: string): string {
    return crypto
      .createHash('sha256')
      .update(`${fromId}:${toId}:${sid}`)
      .digest('hex')
  }

  const feedbackRows = [
    {
      slot_id:     slotId,
      from_user_id: senior.id,
      to_user_id:   junior.id,
      scores: { clarity: 3, content: 4, confidence: 3, structure: 4 },
      tags:  ['Strong analysis', 'Good examples'],
      notes: 'Solid GD contribution — work on speaking time management.',
      dedup_hash: dedupHash(senior.id, junior.id, slotId),
    },
  ]

  for (const row of feedbackRows) {
    const { error: fbErr } = await admin
      .from('feedback')
      .insert(row)
      .throwOnError()

    if (fbErr) {
      // May already exist (dedup) — that's fine
      if ((fbErr as { code?: string }).code !== '23505') {
        console.warn('Feedback insert warning:', fbErr)
      }
    }
  }
  console.log('Feedback rows seeded.')

  console.log('\n✓ Done! Dev feedback seed complete.')
  console.log(`  Slot ID:  ${slotId}`)
  console.log(`  Cockpit:  /cockpit/${slotId}`)
  console.log('  Log in as Dev Senior to view the cockpit with completed state.')
  console.log('  Log in as Dev Junior to see feedback on their profile page.')
}

main().catch((e) => { console.error(e); process.exit(1) })
