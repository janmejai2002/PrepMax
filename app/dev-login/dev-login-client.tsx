'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

interface DevPersona {
  label: string
  description: string
  email: string
  password: string
  badge: string
}

const PERSONAS: DevPersona[] = [
  {
    label: 'Junior',
    description: 'First-year student (b26001) — no hosting rights, no flags',
    email: 'b26001@astra.xlri.ac.in',
    password: 'PrepMax@dev1',
    badge: 'bg-muted text-muted-foreground',
  },
  {
    label: 'Senior',
    description: 'Second-year (b25001) — can host GD + PI, base senior nav',
    email: 'b25001@astra.xlri.ac.in',
    password: 'PrepMax@dev1',
    badge: 'bg-gd-soft text-gd',
  },
  {
    label: 'CRISP Senior',
    description: 'Senior (b25002) + CRISP flag — monitoring, admin stats, room management',
    email: 'b25002@astra.xlri.ac.in',
    password: 'PrepMax@dev1',
    badge: 'bg-amber-500/15 text-amber-500',
  },
  {
    label: 'SAC Senior',
    description: 'Senior (b25003) + SAC flag — full senior nav + Rooms tab',
    email: 'b25003@astra.xlri.ac.in',
    password: 'PrepMax@dev1',
    badge: 'bg-purple-500/15 text-purple-400',
  },
  {
    label: 'Committee Senior',
    description: 'Senior (b25004) + Committee flag — can post to Knowledge feed',
    email: 'b25004@astra.xlri.ac.in',
    password: 'PrepMax@dev1',
    badge: 'bg-sky-500/15 text-sky-400',
  },
]

export function DevLoginClient() {
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState('')
  const router = useRouter()
  const supabase = createClient()

  async function signIn(persona: DevPersona) {
    setError('')
    setLoading(persona.label)
    const { error: authErr } = await supabase.auth.signInWithPassword({
      email:    persona.email,
      password: persona.password,
    })
    setLoading(null)
    if (authErr) {
      setError(`Sign-in failed for ${persona.label}: ${authErr.message}`)
      return
    }
    router.push('/')
    router.refresh()
  }

  return (
    <div className="w-full max-w-sm space-y-6">
      <div className="space-y-1 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-warn/40 bg-warn/10 px-3 py-1 text-[11px] font-semibold text-warn mb-3">
          DEV ONLY — not in production
        </div>
        <h1 className="text-xl font-bold">Test login</h1>
        <p className="text-sm text-muted-foreground">
          One-tap login as any persona. Credentials shared with stakeholders.
        </p>
      </div>

      {error && (
        <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
          <br />
          <span className="text-xs opacity-70">
            Run <code className="font-mono">npx tsx scripts/seed-dev-users.ts</code> to create the accounts.
          </span>
        </p>
      )}

      <div className="space-y-2.5">
        {PERSONAS.map((p) => (
          <button
            key={p.label}
            onClick={() => signIn(p)}
            disabled={loading !== null}
            className={cn(
              'relative w-full rounded-2xl border bg-card px-4 py-3.5 text-left transition-all hover:bg-secondary/50 active:scale-[0.98] disabled:opacity-60',
              loading === p.label && 'opacity-60'
            )}
          >
            <div className="flex items-center gap-3">
              <span className={cn('rounded-full px-2.5 py-0.5 text-[11px] font-bold shrink-0', p.badge)}>
                {p.label}
              </span>
              {loading === p.label && <Loader2 className="ml-auto h-4 w-4 animate-spin text-muted-foreground" />}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{p.description}</p>
          </button>
        ))}
      </div>

      <div className="rounded-xl bg-muted px-4 py-3 space-y-1.5">
        <p className="text-[11px] font-semibold text-muted-foreground">All accounts — password</p>
        <p className="font-mono text-xs font-bold">PrepMax@dev1</p>
        <p className="text-[11px] text-muted-foreground">
          b26001 · b25001 · b25002 · b25003 · b25004 <span className="opacity-60">@astra.xlri.ac.in</span>
        </p>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Real login →{' '}
        <a href="/login" className="underline hover:text-foreground">
          /login
        </a>
      </p>
    </div>
  )
}
