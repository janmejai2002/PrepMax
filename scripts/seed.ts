import { createClient } from '@supabase/supabase-js'
import { faker } from '@faker-js/faker'
import * as dotenv from 'dotenv'
import { resolve } from 'path'

dotenv.config({ path: resolve(process.cwd(), '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const ROOMS = [
  { name: 'Room 101 — MDC Block', location: 'MDC Block, Ground Floor', capacity: 12, is_live: true },
  { name: 'Seminar Hall A', location: 'Academic Block, 1st Floor', capacity: 20, is_live: true },
  { name: 'Conference Room B', location: 'Admin Building, 2nd Floor', capacity: 8, is_live: true },
  { name: 'Room 203 — New Academic Block', location: 'New Academic Block, 2nd Floor', capacity: 15, is_live: false },
  { name: 'Board Room — Faculty Block', location: 'Faculty Block, Ground Floor', capacity: 10, is_live: false },
]

const TEST_ACCOUNTS = [
  {
    email: 'killgod.obsidian@gmail.com',
    name: 'Janmejai Singh',
    year: 'first' as const,
    batch: 'PGP 2025-27',
    section: 'A',
    roll: 'P25001',
    phone: '+91 9000000001',
    whatsapp: '+91 9000000001',
    can_host_gd: false,
    can_host_pi: false,
    is_mentor: false,
    is_committee: false,
    is_crisp_admin: false,
  },
  {
    email: 'b25349@astra.xlri.ac.in',
    name: 'CRISP Senior Admin',
    year: 'second' as const,
    batch: 'PGP 2024-26',
    section: 'B',
    roll: 'P24349',
    phone: '+91 9000000002',
    whatsapp: '+91 9000000002',
    can_host_gd: true,
    can_host_pi: true,
    is_mentor: true,
    is_committee: true,
    is_crisp_admin: true,
    is_sac: true,
  },
]

async function getOrCreateAuthUser(email: string): Promise<string> {
  const { data: list } = await supabase.auth.admin.listUsers({ perPage: 1000 })
  const existing = list?.users.find((u) => u.email === email)
  if (existing) return existing.id

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
  })
  if (error) throw new Error(`Failed to create user ${email}: ${error.message}`)
  return data.user.id
}

async function seedRooms() {
  const { error } = await supabase.from('rooms').upsert(ROOMS, { onConflict: 'name' })
  if (error) throw error
  console.log(`✓ ${ROOMS.length} rooms seeded`)
}

async function seedTestAccounts() {
  for (const account of TEST_ACCOUNTS) {
    const { email, ...profile } = account
    const id = await getOrCreateAuthUser(email)
    const { error } = await supabase.from('profiles').upsert({ id, email, ...profile })
    if (error) throw new Error(`Profile upsert failed for ${email}: ${error.message}`)
    console.log(`✓ Test account: ${email}`)
  }
}

const XLRI_NAMES = [
  'Aarav', 'Vivaan', 'Aditya', 'Vihaan', 'Arjun', 'Reyansh', 'Sai', 'Ayaan', 'Krishna', 'Ishaan',
  'Shaurya', 'Atharv', 'Advik', 'Pranav', 'Dhruv', 'Kabir', 'Ritvik', 'Aarush', 'Shaan', 'Darsh',
  'Ananya', 'Diya', 'Piya', 'Aanya', 'Radhika', 'Tara', 'Meera', 'Ishita', 'Kavya', 'Saanvi',
  'Aisha', 'Nisha', 'Priya', 'Shreya', 'Riya', 'Divya', 'Neha', 'Pooja', 'Anjali', 'Simran',
]

const SURNAMES = [
  'Sharma', 'Verma', 'Singh', 'Gupta', 'Kumar', 'Patel', 'Shah', 'Mehta', 'Joshi', 'Mishra',
  'Agarwal', 'Bansal', 'Kapoor', 'Malhotra', 'Chopra', 'Bhat', 'Rao', 'Reddy', 'Nair', 'Iyer',
]

function randomName() {
  return `${faker.helpers.arrayElement(XLRI_NAMES)} ${faker.helpers.arrayElement(SURNAMES)}`
}

async function seedFakerProfiles(count: number) {
  const { data: list } = await supabase.auth.admin.listUsers({ perPage: 1000 })
  const existingEmails = new Set(list?.users.map((u) => u.email) ?? [])

  let created = 0
  const batchSize = 10

  for (let i = 0; i < count; i += batchSize) {
    const batch = Array.from({ length: Math.min(batchSize, count - i) }, (_, j) => ({
      index: i + j,
    }))

    await Promise.all(
      batch.map(async ({ index }) => {
        const isSecond = index < 80
        const year: 'first' | 'second' = isSecond ? 'second' : 'first'
        const batchStr = isSecond ? 'PGP 2024-26' : 'PGP 2025-27'
        const roll = `${isSecond ? 'P24' : 'P25'}${String(100 + index).padStart(3, '0')}`
        const email = `${roll.toLowerCase()}@astra.xlri.ac.in`

        if (existingEmails.has(email)) return

        const canHostGd = index < 12
        const canHostPi = index < 10
        const isMentor = index < 3
        const isCommittee = index < 2

        const id = await getOrCreateAuthUser(email)
        await supabase.from('profiles').upsert({
          id,
          email,
          name: randomName(),
          phone: `+91 9${faker.string.numeric(9)}`,
          whatsapp: `+91 9${faker.string.numeric(9)}`,
          year,
          batch: batchStr,
          section: faker.helpers.arrayElement(['A', 'B', 'C']),
          roll,
          can_host_gd: canHostGd,
          can_host_pi: canHostPi,
          is_mentor: isMentor,
          is_committee: isCommittee,
          is_crisp_admin: false,
        })
        created++
      })
    )

    console.log(`  profiles: ${Math.min(i + batchSize, count)}/${count}`)
  }

  console.log(`✓ ${created} fake profiles seeded`)
}

async function main() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ SUPABASE_SERVICE_ROLE_KEY is not set in .env.local')
    process.exit(1)
  }

  console.log('Seeding PrepMax...')
  await seedRooms()
  await seedTestAccounts()
  await seedFakerProfiles(200)
  console.log('✅ Seed complete')
}

main().catch((err) => {
  console.error('❌ Seed failed:', err)
  process.exit(1)
})
