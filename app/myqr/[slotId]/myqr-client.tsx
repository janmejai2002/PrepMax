'use client'

import { useCallback, useEffect, useState } from 'react'
import QRCode from 'react-qr-code'
import { Loader2, RefreshCw, Check, AlertCircle, ShieldCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

const TOKEN_TTL_MS   = 90_000   // matches server-side 90s
const REFRESH_BEFORE = 15_000   // refresh 15s before expiry

type State = 'loading' | 'ready' | 'attended' | 'error'

interface TokenState {
  token:     string
  expiresAt: Date
}

export function MyQrClient({
  slotId,
  slotTopic,
  slotType,
}: {
  slotId:    string
  slotTopic: string
  slotType:  string
}) {
  const [state, setState]       = useState<State>('loading')
  const [tokenData, setToken]   = useState<TokenState | null>(null)
  const [secondsLeft, setLeft]  = useState(0)
  const [errMsg, setErr]        = useState('')
  const supabase = createClient()

  const fetchToken = useCallback(async () => {
    setState('loading')
    const { data, error } = await supabase.rpc('generate_checkin_token', {
      p_slot_id: slotId,
    })
    if (error) {
      setState('error')
      setErr('Network error — check your connection.')
      return
    }
    if (data?.error === 'already_attended') {
      setState('attended')
      return
    }
    if (data?.error) {
      setState('error')
      const msgs: Record<string, string> = {
        not_enrolled:  "You're not enrolled in this session.",
        not_confirmed: "You're on the waitlist — only confirmed seats can check in.",
        slot_not_live: 'This session is not currently live.',
      }
      setErr(msgs[data.error] ?? 'Something went wrong. Ask your host for help.')
      return
    }
    setToken({ token: data.token, expiresAt: new Date(data.expires_at) })
    setState('ready')
  }, [slotId, supabase])

  // Initial fetch
  useEffect(() => { fetchToken() }, [fetchToken])

  // Countdown + auto-refresh
  useEffect(() => {
    if (!tokenData) return
    const tick = setInterval(() => {
      const left = tokenData.expiresAt.getTime() - Date.now()
      setLeft(Math.max(0, Math.round(left / 1000)))
      if (left < REFRESH_BEFORE) {
        clearInterval(tick)
        fetchToken()
      }
    }, 1000)
    return () => clearInterval(tick)
  }, [tokenData, fetchToken])

  const isGD      = slotType === 'GD'
  const pct       = tokenData ? Math.min(100, (secondsLeft / (TOKEN_TTL_MS / 1000)) * 100) : 0
  const isUrgent  = secondsLeft <= 15 && secondsLeft > 0

  return (
    <div className="space-y-6">
      {/* header */}
      <div className="text-center space-y-1">
        <div className={cn(
          'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold mb-1',
          isGD ? 'bg-gd-soft text-gd' : 'bg-pi-soft text-pi'
        )}>
          {slotType}
        </div>
        <h1 className="text-lg font-bold leading-snug">{slotTopic}</h1>
        <div className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-success" />
          Your personal check-in QR
        </div>
      </div>

      {/* QR area */}
      {state === 'loading' && (
        <div className="flex flex-col items-center gap-4 py-16">
          <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Generating your QR…</p>
        </div>
      )}

      {state === 'ready' && tokenData && (
        <div className="flex flex-col items-center gap-4 rounded-2xl border bg-card p-6">
          <div className="rounded-xl bg-white p-3 shadow-sm">
            <QRCode value={tokenData.token} size={220} />
          </div>

          <div className="w-full text-center space-y-2">
            <div className={cn(
              'text-sm font-semibold tabular-nums transition-colors',
              isUrgent ? 'text-destructive' : 'text-muted-foreground'
            )}>
              {isUrgent ? `Refreshing in ${secondsLeft}s…` : `Valid for ${secondsLeft}s`}
            </div>
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-1000',
                  isUrgent ? 'bg-destructive' : 'bg-success'
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground text-center max-w-xs">
            Show this QR to your host. It rotates automatically — do not share or screenshot it.
          </p>
        </div>
      )}

      {state === 'attended' && (
        <div className="flex flex-col items-center gap-4 rounded-2xl border bg-card p-8 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-success/15">
            <Check className="h-8 w-8 text-success" />
          </span>
          <div>
            <p className="text-lg font-bold">You&apos;re checked in!</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Your attendance has been recorded. Enjoy the session.
            </p>
          </div>
        </div>
      )}

      {state === 'error' && (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-destructive/30 bg-destructive/5 p-8 text-center">
          <AlertCircle className="h-10 w-10 text-destructive" />
          <div>
            <p className="text-base font-semibold">Could not generate QR</p>
            <p className="mt-1 text-sm text-muted-foreground">{errMsg}</p>
          </div>
          <button
            onClick={fetchToken}
            className="flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Try again
          </button>
        </div>
      )}
    </div>
  )
}
