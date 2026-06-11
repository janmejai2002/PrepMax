/**
 * seed-dev-users.ts
 *
 * Creates 4 test accounts for stakeholder demos / phone testing.
 * Run with: npx tsx scripts/seed-dev-users.ts
 *
 * Emails follow the XLRI batch-year convention:
 *   b26001@astra.xlri.ac.in  — first year (junior)
 *   b25001@astra.xlri.ac.in  — second year (senior), can_host_gd + can_host_pi + is_mentor
 *   b25002@astra.xlri.ac.in  — second year (senior), all flags + is_crisp_admin
 *   b25003@astra.xlri.ac.in  — second year (senior), all flags + is_crisp_admin + is_sac
 *
 *   Password: PrepMax@dev1
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl        = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceRoleKey     = process.env.SUPABASE_SERVICE_ROLE_KEY!

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
      name:          'Dev Junior',
      year:          'first',   // enforced by DB trigger (b26 → first)
      batch:         'PGDM 2026',
      section:       'A',
      roll:          'DEV001',
      can_host_gd:   false,
      can_host_pi:   false,
      is_mentor:     false,
      is_committee:  false,
      is_crisp_admin:false,
      is_sac:        false,
    },
  },
  {
    email: 'b25001@astra.xlri.ac.in',
    profile: {
      name:          'Dev Senior',
      year:          'second',  // enforced by DB trigger (b25 → second)
      batch:         'PGDM 2025',
      section:       'B',
      roll:          'DEV002',
      can_host_gd:   true,
      can_host_pi:   true,
      is_mentor:     true,
      is_committee:  false,
      is_crisp_admin:false,
      is_sac:        false,
    },
  },
  {
    email: 'b25002@astra.xlri.ac.in',
    profile: {
      name:          'Dev CRISP Admin',
      year:          'second',  // enforced by DB trigger (b25 → second)
      batch:         'PGDM 2025',
      section:       'C',
      roll:          'DEV003',
      can_host_gd:   true,
      can_host_pi:   true,
      is_mentor:     true,
      is_committee:  true,
      is_crisp_admin:true,
      is_sac:        false,
    },
  },
  {
    email: 'b25003@astra.xlri.ac.in',
    profile: {
      name:          'Dev SAC Admin',
      year:          'second',  // enforced by DB trigger (b25 → second)
      batch:         'PGDM 2025',
      section:       'D',
      roll:          'DEV004',
      can_host_gd:   true,
      can_host_pi:   true,
      is_mentor:     true,
      is_committee:  true,
      is_crisp_admin:true,
      is_sac:        true,
    },
  },
]

async function seedUser(user: (typeof DEV_USERS)[number]) {
  console.log(`\nProcessing: ${user.email}`)

  // Check if auth user already exists
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
      email:          user.email,
      password:       PASSWORD,
      email_confirm:  true,
      user_metadata:  { name: user.profile.name },
    })
    if (error || !data.user) {
      console.error(`  ✗ Failed: ${error?.message}`)
      return
    }
    userId = data.user.id
    console.log(`  ✓ Created auth user (${userId})`)
  }

  // Upsert profile using service role (bypasses RLS)
  const { error: profileErr } = await admin
    .from('profiles')
    .upsert({
      id:    userId,
      email: user.email,
      phone:    null,
      whatsapp: null,
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
  console.log('PrepMax — seeding dev test accounts')
  console.log(`Password for all: ${PASSWORD}`)
  for (const user of DEV_USERS) {
    await seedUser(user)
  }
  console.log('\n✓ Done! Test accounts ready.')
  console.log('\nTest login URL (local):  http://localhost:3000/dev-login')
  console.log('Test login URL (prod):   N/A (dev-login is disabled in production)')
  console.log('\nCredentials:')
  for (const u of DEV_USERS) {
    console.log(`  ${u.profile.name.padEnd(20)} ${u.email}  /  ${PASSWORD}`)
  }
})()
