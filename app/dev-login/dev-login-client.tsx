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
    description: 'First-year student (b26), no hosting rights, no flags',
    email: 'b26001@astra.xlri.ac.in',
    password: 'PrepMax@dev1',
    badge: 'bg-muted text-muted-foreground',
  },
  {
    label: 'Senior (host)',
    description: 'Second-year (b25), can host GD + PI',
    email: 'b25001@astra.xlri.ac.in',
    password: 'PrepMax@dev1',
    badge: 'bg-gd-soft text-gd',
  },
  {
    label: 'CRISP committee',
    description: 'Shared committee login — post view only',
    email: 'crisp@xlri.ac.in',
    password: 'PrepMax@dev1',
    badge: 'bg-pi-soft text-pi',
  },
  {
    label: 'SAC',
    description: 'Shared SAC login — post view + room edit',
    email: 'sacdelhi@xlri.ac.in',
    password: 'PrepMax@dev1',
    badge: 'bg-destructive/15 text-destructive',
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
        <p className="text-[11px] font-semibold text-muted-foreground">Credentials (all accounts)</p>
        <p className="font-mono text-xs">Password: <span className="font-bold">PrepMax@dev1</span></p>
        <p className="text-[11px] text-muted-foreground">
          Students: <code>b26001</code> / <code>b25001</code> · Committee: <code>crisp@</code> / <code>sacdelhi@xlri.ac.in</code>
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
