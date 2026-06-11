'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'

const ERROR_MESSAGES: Record<string, string> = {
  domain: 'Only @astra.xlri.ac.in and @xlri.ac.in email addresses are allowed.',
  auth: 'Authentication failed. Please try again.',
}

interface Props {
  allowDevLogin?: boolean
}

export default function LoginClient({ allowDevLogin }: Props) {
  const params = useSearchParams()
  const error = params.get('error')

  const [email, setEmail] = useState('')
  const [magicLinkSent, setMagicLinkSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [magicError, setMagicError] = useState('')

  const supabase = createClient()

  async function signInWithGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${location.origin}/auth/callback` },
    })
  }

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault()
    setMagicError('')

    const exceptions = (process.env.NEXT_PUBLIC_ALLOWED_EXCEPTION_EMAILS ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
    const lower = email.toLowerCase()
    const allowed =
      lower.endsWith('@astra.xlri.ac.in') ||
      lower.endsWith('@xlri.ac.in') ||
      exceptions.includes(lower)

    if (!allowed) {
      setMagicError('Only @astra.xlri.ac.in or @xlri.ac.in addresses are allowed.')
      return
    }

    setLoading(true)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    })
    setLoading(false)

    if (error) {
      setMagicError(error.message)
    } else {
      setMagicLinkSent(true)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold tracking-tight">PrepMax</h1>
          <p className="text-sm text-muted-foreground">
            XLRI Placement Prep — sign in with your institute account
          </p>
        </div>

        {error && (
          <p className="text-sm text-destructive text-center rounded-md border border-destructive/30 bg-destructive/10 px-4 py-2">
            {ERROR_MESSAGES[error] ?? 'Something went wrong.'}
          </p>
        )}

        <div className="space-y-4">
          <Button className="w-full gap-2" onClick={signInWithGoogle} size="lg">
            <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            Sign in with Google
          </Button>

          <div className="flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="text-xs text-muted-foreground">or</span>
            <Separator className="flex-1" />
          </div>

          {magicLinkSent ? (
            <p className="text-sm text-center text-muted-foreground rounded-md border px-4 py-3">
              Check your email — a sign-in link is on its way.
            </p>
          ) : (
            <form onSubmit={sendMagicLink} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email (magic link fallback)</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@astra.xlri.ac.in or crisp@xlri.ac.in"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-11"
                />
              </div>
              {magicError && (
                <p className="text-xs text-destructive">{magicError}</p>
              )}
              <Button
                type="submit"
                variant="outline"
                className="w-full"
                disabled={loading}
              >
                {loading ? 'Sending…' : 'Send magic link'}
              </Button>
            </form>
          )}
        </div>

        {allowDevLogin && (
          <p className="text-center text-xs text-muted-foreground/60 mt-4">
            <Link href="/dev-login" className="underline hover:text-muted-foreground">
              Dev test login →
            </Link>
          </p>
        )}
      </div>
    </div>
  )
}
