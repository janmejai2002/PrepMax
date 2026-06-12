/**
 * seed-dev-users.ts
 *
 * Creates 5 test accounts for stakeholder demos / phone testing.
 * Run with: npx tsx scripts/seed-dev-users.ts
 *
 * All 5 personas are b25/b26 student accounts (no more shared @xlri.ac.in committee logins).
 * CRISP, SAC, and Committee are now capabilities layered on top of senior (b25) accounts.
 *
 *   b26001  — Junior (first-year, no flags)
 *   b25001  — Senior (can host GD + PI, no special flags)
 *   b25002  — CRISP Senior (can host + monitoring + admin stats)
 *   b25003  — SAC Senior (can host + room management)
 *   b25004  — Committee Senior (can host + post knowledge content)
 *
 *   Password: PrepMax@dev1
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl    = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const PASSWORD = 'PrepMax@dev1'

const DEV_USERS = [
  {
    email: 'b26001@astra.xlri.ac.in',
    profile: {
      name:         'Dev Junior',
      year:         'first',
      batch:        'PGDM 2026',
      section:      'A',
      roll:         'DEV001',
      bio:          'B.Tech Computer Science, fresher',
      can_host_gd:  false,
      can_host_pi:  false,
      is_crisp:     false,
      is_sac:       false,
      is_committee: false,
    },
  },
  {
    email: 'b25001@astra.xlri.ac.in',
    profile: {
      name:         'Dev Senior',
      year:         'second',
      batch:        'PGDM 2025',
      section:      'B',
      roll:         'DEV002',
      bio:          'IIT Delhi, 3 years at McKinsey before XLRI',
      can_host_gd:  true,
      can_host_pi:  true,
      is_crisp:     false,
      is_sac:       false,
      is_committee: false,
    },
  },
  {
    email: 'b25002@astra.xlri.ac.in',
    profile: {
      name:         'Dev CRISP Senior',
      year:         'second',
      batch:        'PGDM 2025',
      section:      'C',
      roll:         'DEV003',
      bio:          'CRISP placement committee member + senior host',
      can_host_gd:  true,
      can_host_pi:  true,
      is_crisp:     true,
      is_sac:       false,
      is_committee: false,
    },
  },
  {
    email: 'b25003@astra.xlri.ac.in',
    profile: {
      name:         'Dev SAC Senior',
      year:         'second',
      batch:        'PGDM 2025',
      section:      'D',
      roll:         'DEV004',
      bio:          'SAC member who manages rooms + senior host',
      can_host_gd:  true,
      can_host_pi:  true,
      is_crisp:     false,
      is_sac:       true,
      is_committee: false,
    },
  },
  {
    email: 'b25004@astra.xlri.ac.in',
    profile: {
      name:         'Dev Committee Senior',
      year:         'second',
      batch:        'PGDM 2025',
      section:      'E',
      roll:         'DEV005',
      bio:          'Content committee member — posts knowledge articles + senior host',
      can_host_gd:  true,
      can_host_pi:  true,
      is_crisp:     false,
      is_sac:       false,
      is_committee: true,
    },
  },
]

async function seedUser(user: (typeof DEV_USERS)[number]) {
  console.log(`\nProcessing: ${user.email}`)

  const { data: existing } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const existingUser = existing?.users?.find((u) => u.email === user.email)

  let userId: string

  if (existingUser) {
    userId = existingUser.id
    console.log(`  ↪ Auth user exists (${userId}) — updating password`)
    await admin.auth.admin.updateUserById(userId, { password: PASSWORD })
  } else {
    console.log(`  ↪ Creating auth user…`)
    const { data, error } = await admin.auth.admin.createUser({
      email:         user.email,
      password:      PASSWORD,
      email_confirm: true,
      user_metadata: { name: user.profile.name },
    })
    if (error || !data.user) {
      console.error(`  ✗ Failed: ${error?.message}`)
      return
    }
    userId = data.user.id
    console.log(`  ✓ Created auth user (${userId})`)
  }

  const { error: profileErr } = await admin
    .from('profiles')
    .upsert({
      id:         userId,
      email:      user.email,
      phone:      null,
      whatsapp:   null,
      avatar_url: null,
      mentor_id:  null,
      ...user.profile,
    }, { onConflict: 'id' })

  if (profileErr) {
    console.error(`  ✗ Profile upsert failed: ${profileErr.message}`)
  } else {
    console.log(`  ✓ Profile upserted (${user.profile.name})`)
  }
}

;(async () => {
  console.log('PrepMax — seeding dev test accounts (5 personas)')
  console.log(`Password for all: ${PASSWORD}`)
  for (const user of DEV_USERS) {
    await seedUser(user)
  }
  console.log('\n✓ Done! Test accounts ready.')
  console.log('\nDev login URL (local):  http://localhost:3000/dev-login')
  console.log('Dev login URL (prod):   https://prep-max-alpha.vercel.app/dev-login')
  console.log('\nCredentials:')
  for (const u of DEV_USERS) {
    console.log(`  ${u.profile.name.padEnd(24)} ${u.email}  /  ${PASSWORD}`)
  }
})()
