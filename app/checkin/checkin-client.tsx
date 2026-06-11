'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Check, Loader2, XCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type State = 'loading' | 'attended' | 'already' | 'error'
const ERROR_MSGS: Record<string, string> = {
  invalid_or_expired_token: 'QR code has expired. Ask your host to show the latest QR.',
  not_enrolled:             "You're not enrolled in this slot.",
  not_confirmed:            "You're on the waitlist — attendance is for confirmed seats only.",
}

export function CheckinClient({ slotId, token }: { slotId: string; token: string }) {
  const [state, setState] = useState<State>('loading')
  const [errMsg, setErrMsg] = useState('')
  const supabase = createClient()

  useEffect(() => {
    async function run() {
      const { data, error } = await supabase.rpc('check_in', {
        p_slot_id: slotId,
        p_token:   token,
      })
      if (error) { setState('error'); setErrMsg('Network error — try scanning again.'); return }
      if (data?.status === 'attended' || data?.status === 'already_attended') {
        setState(data.status === 'already_attended' ? 'already' : 'attended')
      } else {
        setState('error')
        setErrMsg(ERROR_MSGS[data?.error] ?? 'Something went wrong.')
      }
    }
    run()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="space-y-6 text-center">
      {state === 'loading' && (
        <>
          <Loader2 className="h-12 w-12 mx-auto animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Checking you in…</p>
        </>
      )}

      {(state === 'attended' || state === 'already') && (
        <>
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success/15">
            <Check className="h-8 w-8 text-success" />
          </span>
          <div>
            <h1 className="text-xl font-bold">
              {state === 'attended' ? "You're checked in!" : 'Already checked in'}
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {state === 'attended'
                ? 'Your attendance has been recorded. Enjoy the session!'
                : 'Your attendance was already marked earlier.'}
            </p>
          </div>
          <Link href="/"
            className="inline-flex items-center justify-center h-11 w-full rounded-full bg-foreground text-background text-sm font-semibold">
            Back to home
          </Link>
        </>
      )}

      {state === 'error' && (
        <>
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
            <XCircle className="h-8 w-8 text-destructive" />
          </span>
          <div>
            <h1 className="text-xl font-bold">Check-in failed</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">{errMsg}</p>
          </div>
          <Link href="/"
            className="inline-flex items-center justify-center h-11 w-full rounded-full border text-sm font-semibold">
            Go to home
          </Link>
        </>
      )}
    </div>
  )
}
