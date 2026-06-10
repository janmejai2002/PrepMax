/**
 * Dev-only helper: mint a real Supabase session for a test account and print the
 * exact @supabase/ssr cookies, so Playwright can drive the app as that user
 * (our /auth/callback is PKCE, so we can't just follow a magic link headlessly).
 *
 * Usage:  npx tsx scripts/dev-session.ts [email]
 * Prints: JSON array of { name, value, domain, path } cookies on stdout.
 * NEVER used in production — service role key required.
 */
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import * as dotenv from 'dotenv'
import { resolve } from 'path'
import { writeFileSync } from 'fs'

dotenv.config({ path: resolve(process.cwd(), '.env.local'), quiet: true })

const URL     = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON    = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!

const email = process.argv[2] ?? 'b25349@astra.xlri.ac.in'

async function main() {
  const admin = createClient(URL, SERVICE, { auth: { persistSession: false } })

  // Generate a magic-link token for the (existing) user without sending email.
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  if (error) throw error
  const tokenHash = data.properties?.hashed_token
  if (!tokenHash) throw new Error('no hashed_token returned')

  // Verify it through a server client whose cookie jar we capture — this yields
  // the precise cookie names/values @supabase/ssr expects.
  const jar: Record<string, string> = {}
  const sb = createServerClient(URL, ANON, {
    cookies: {
      getAll: () => Object.entries(jar).map(([name, value]) => ({ name, value })),
      setAll: (list) => list.forEach(({ name, value }) => { jar[name] = value }),
    },
  })

  const { error: vErr } = await sb.auth.verifyOtp({ type: 'magiclink', token_hash: tokenHash })
  if (vErr) throw vErr

  const cookies = Object.entries(jar).map(([name, value]) => ({
    name,
    value,
    domain: 'localhost',
    path: '/',
  }))
  writeFileSync(resolve(process.cwd(), '.tmp-session.json'), JSON.stringify(cookies))
  process.stdout.write(`wrote ${cookies.length} cookie(s) to .tmp-session.json\n`)
}

main().catch((e) => { console.error(e); process.exit(1) })
