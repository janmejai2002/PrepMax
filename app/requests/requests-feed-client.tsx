'use client'

import { useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { MapPin, Clock, HandHeart, CheckCircle2, Users } from 'lucide-react'
import { toast } from 'sonner'
import type { OpenRequest } from '@/lib/types'

function formatRelTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function formatPreferred(iso: string) {
  return new Date(iso).toLocaleString('en-IN', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function RequestCard({
  req,
  onInterestToggle,
}: {
  req: OpenRequest
  onInterestToggle: (id: string, interested: boolean) => void
}) {
  const [pending, startTransition] = useTransition()
  const sb = createClient()

  function toggle() {
    startTransition(async () => {
      if (req.i_am_interested) {
        const { data } = await sb.rpc('retract_interest', { p_request_id: req.id })
        if (data?.error) { toast.error(data.error); return }
        toast.success('Interest retracted')
        onInterestToggle(req.id, false)
      } else {
        const { data } = await sb.rpc('express_interest', { p_request_id: req.id })
        if (data?.error) { toast.error(data.error); return }
        navigator.vibrate?.(50)
        toast.success("You're interested — the junior can see your name now")
        onInterestToggle(req.id, true)
      }
    })
  }

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <span className="font-medium text-foreground">{req.location}</span>
              <span className="mx-1">·</span>
              <Clock className="h-3.5 w-3.5 shrink-0" />
              <span>{formatPreferred(req.preferred_at)}</span>
            </div>
            <p className="text-xs text-muted-foreground">{formatRelTime(req.created_at)}</p>
          </div>
          <Badge variant="secondary" className="shrink-0 text-xs gap-1">
            <Users className="h-3 w-3" />
            {req.interest_count} {req.interest_count === 1 ? 'senior' : 'seniors'}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="px-4 pb-4 space-y-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
            Background
          </p>
          <p className="text-sm leading-relaxed">{req.background}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
            What they want
          </p>
          <p className="text-sm leading-relaxed">{req.description}</p>
        </div>

        <Button
          size="sm"
          variant={req.i_am_interested ? 'default' : 'outline'}
          className={
            req.i_am_interested
              ? 'w-full gap-2 bg-green-600 hover:bg-green-700 text-white'
              : 'w-full gap-2'
          }
          disabled={pending}
          onClick={toggle}
        >
          {req.i_am_interested ? (
            <>
              <CheckCircle2 className="h-4 w-4" />
              Interested — tap to retract
            </>
          ) : (
            <>
              <HandHeart className="h-4 w-4" />
              I'm available to help
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  )
}

export function RequestsFeedClient({
  initialRequests,
}: {
  initialRequests: OpenRequest[]
}) {
  const [requests, setRequests] = useState(initialRequests)

  function handleInterestToggle(id: string, interested: boolean) {
    setRequests((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              i_am_interested: interested,
              interest_count: r.interest_count + (interested ? 1 : -1),
            }
          : r
      )
    )
  }

  return (
    <div className="mx-auto max-w-md px-4 pt-6">
      <div className="mb-5">
        <h1 className="text-xl font-bold">Practice Requests</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Juniors looking for practice sessions — identities revealed only after they confirm you.
        </p>
      </div>

      {requests.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground">
          <HandHeart className="mx-auto h-10 w-10 mb-3 opacity-30" />
          <p className="font-medium">No open requests right now</p>
          <p className="text-sm mt-1">Check back later — juniors post requests around evenings.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <RequestCard key={r.id} req={r} onInterestToggle={handleInterestToggle} />
          ))}
        </div>
      )}
    </div>
  )
}
