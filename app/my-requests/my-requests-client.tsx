'use client'

import { useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import {
  MapPin,
  Clock,
  Plus,
  MessageCircle,
  CheckCircle2,
  X,
  Handshake,
  ClipboardList,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { MySlotRequest, InterestedSenior } from '@/lib/types'
import { REQUEST_LOCATIONS, FUNCTION_TAGS } from '@/lib/types'

function statusColor(status: string) {
  if (status === 'open') return 'bg-green-500/15 text-green-600 border-green-500/30'
  if (status === 'matched') return 'bg-blue-500/15 text-blue-500 border-blue-500/30'
  return 'bg-muted text-muted-foreground'
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

function buildWaUrl(senior: InterestedSenior, juniorName: string) {
  const phone = (senior.whatsapp || senior.phone || '').replace(/\D/g, '')
  if (!phone) return null
  const msg = encodeURIComponent(
    `Hi ${senior.name}! 👋 I'm ${juniorName} from XLRI. I posted a practice request on PrepMax and saw you're interested. Would love to prep together — when works for you? 🙏`
  )
  return `https://wa.me/${phone}?text=${msg}`
}

function SeniorRow({
  senior,
  requestId,
  juniorName,
  onConfirmed,
}: {
  senior: InterestedSenior
  requestId: string
  juniorName: string
  onConfirmed: (requestId: string, seniorId: string, seniorName: string, waUrl: string | null) => void
}) {
  const [pending, startTransition] = useTransition()
  const sb = createClient()
  const waUrl = buildWaUrl(senior, juniorName)

  function confirmMatch() {
    startTransition(async () => {
      const { data } = await sb.rpc('confirm_match', {
        p_request_id: requestId,
        p_senior_id: senior.senior_id,
      })
      if (data?.error) { toast.error(data.error); return }
      navigator.vibrate?.([50, 50, 100])
      onConfirmed(requestId, senior.senior_id, senior.name, buildWaUrl(senior, juniorName))
    })
  }

  return (
    <div className="flex items-center justify-between py-2 border-b border-border/40 last:border-0">
      <div>
        <p className="text-sm font-medium">{senior.name}</p>
        <p className="text-xs text-muted-foreground">
          {new Date(senior.interested_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {waUrl && (
          <a href={waUrl} target="_blank" rel="noreferrer">
            <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs">
              <MessageCircle className="h-3.5 w-3.5" />
              WhatsApp
            </Button>
          </a>
        )}
        <Button
          size="sm"
          variant="default"
          className="gap-1.5 h-8 text-xs bg-blue-600 hover:bg-blue-700"
          disabled={pending}
          onClick={confirmMatch}
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          Confirm
        </Button>
      </div>
    </div>
  )
}

function RequestCard({
  req,
  juniorName,
  onCancelled,
  onConfirmed,
}: {
  req: MySlotRequest
  juniorName: string
  onCancelled: (id: string) => void
  onConfirmed: (requestId: string, seniorId: string, seniorName: string, waUrl: string | null) => void
}) {
  const [pending, startTransition] = useTransition()
  const sb = createClient()

  function cancel() {
    startTransition(async () => {
      const { data } = await sb.rpc('cancel_slot_request', { p_request_id: req.id })
      if (data?.error) { toast.error(data.error); return }
      toast.success('Request cancelled')
      onCancelled(req.id)
    })
  }

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <span className="font-medium text-foreground">{req.location}</span>
              <span className="mx-1">·</span>
              <Clock className="h-3.5 w-3.5 shrink-0" />
              <span>{formatPreferred(req.preferred_at)}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={`text-xs capitalize ${statusColor(req.status)}`}
            >
              {req.status}
            </Badge>
            {req.status === 'open' && (
              <button
                onClick={cancel}
                disabled={pending}
                className="text-muted-foreground hover:text-destructive transition-colors"
                title="Cancel request"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-4 pb-4 space-y-3">
        <p className="text-sm text-muted-foreground line-clamp-2">{req.description}</p>

        {/* Multi-interviewer progress */}
        {(req.interviewer_count ?? 1) > 1 && (
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              {Array.from({ length: req.interviewer_count ?? 1 }).map((_, i) => (
                <span
                  key={i}
                  className={cn(
                    'h-2 w-5 rounded-full',
                    i < (req.confirmed_count ?? 0) ? 'bg-blue-500' : 'bg-muted'
                  )}
                />
              ))}
            </div>
            <span className="text-xs text-muted-foreground">
              {req.confirmed_count ?? 0}/{req.interviewer_count} interviewers confirmed
            </span>
          </div>
        )}

        {req.status === 'open' && (
          <>
            {req.interested_seniors.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">
                No seniors have expressed interest yet — check back soon.
              </p>
            ) : (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  {req.interested_seniors.length} senior{req.interested_seniors.length > 1 ? 's' : ''} interested
                </p>
                <div className="divide-y divide-border/30">
                  {req.interested_seniors.map((s) => (
                    <SeniorRow
                      key={s.senior_id}
                      senior={s}
                      requestId={req.id}
                      juniorName={juniorName}
                      onConfirmed={onConfirmed}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {req.status === 'matched' && req.matched_senior_id && (() => {
          const matched = req.interested_seniors.find(
            (s) => s.senior_id === req.matched_senior_id
          )
          if (!matched) return null
          const waUrl = buildWaUrl(matched, juniorName)
          return (
            <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-3">
              <div className="flex items-center gap-2 mb-2">
                <Handshake className="h-4 w-4 text-blue-500" />
                <p className="text-sm font-medium text-blue-500">Matched with {matched.name}</p>
              </div>
              {waUrl && (
                <a href={waUrl} target="_blank" rel="noreferrer">
                  <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs w-full">
                    <MessageCircle className="h-3.5 w-3.5" />
                    Open WhatsApp intro
                  </Button>
                </a>
              )}
            </div>
          )
        })()}
      </CardContent>
    </Card>
  )
}

function NewRequestSheet({
  onCreated,
}: {
  onCreated: (req: MySlotRequest) => void
}) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [location, setLocation] = useState<string>('')
  const [preferredAt, setPreferredAt] = useState('')
  const [background, setBackground] = useState('')
  const [description, setDescription] = useState('')
  const [interviewerCount, setInterviewerCount] = useState(1)
  const [functionTag, setFunctionTag] = useState<string>('')
  const sb = createClient()

  function submit() {
    if (!location) { toast.error('Pick a location'); return }
    if (!preferredAt) { toast.error('Set a preferred time'); return }
    if (background.trim().length < 5) { toast.error('Add some background info'); return }
    if (description.trim().length < 10) { toast.error('Describe what you want to practice'); return }

    startTransition(async () => {
      const { data } = await sb.rpc('create_slot_request', {
        p_location:          location,
        p_preferred_at:      new Date(preferredAt).toISOString(),
        p_background:        background.trim(),
        p_description:       description.trim(),
        p_interviewer_count: interviewerCount,
        p_function_tag:      functionTag || null,
      })
      if (data?.error) { toast.error(data.error); return }
      navigator.vibrate?.(50)
      toast.success('Request posted! Seniors can now see it.')
      const newReq: MySlotRequest = {
        id: data.id,
        location,
        preferred_at: new Date(preferredAt).toISOString(),
        background: background.trim(),
        description: description.trim(),
        status: 'open',
        matched_senior_id: null,
        matched_at: null,
        created_at: new Date().toISOString(),
        interested_seniors: [],
        interviewer_count: interviewerCount,
        confirmed_count: 0,
        function_tag: functionTag || null,
      }
      onCreated(newReq)
      setOpen(false)
      setLocation('')
      setPreferredAt('')
      setBackground('')
      setDescription('')
      setInterviewerCount(1)
      setFunctionTag('')
    })
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={
        <Button size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" />
          New request
        </Button>
      } />
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[92vh] overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle>Post a practice request</SheetTitle>
        </SheetHeader>

        <div className="space-y-4 pb-6">
          <div className="space-y-1.5">
            <Label>Location</Label>
            <Select value={location} onValueChange={(v) => setLocation(v ?? '')}>
              <SelectTrigger>
                <SelectValue placeholder="Where do you want to meet?" />
              </SelectTrigger>
              <SelectContent>
                {REQUEST_LOCATIONS.map((l) => (
                  <SelectItem key={l} value={l}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Preferred date & time</Label>
            <Input
              type="datetime-local"
              value={preferredAt}
              onChange={(e) => setPreferredAt(e.target.value)}
              min={new Date().toISOString().slice(0, 16)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>How many interviewers? <span className="text-muted-foreground font-normal">(for PI)</span></Label>
            <div className="flex gap-2">
              {[1, 2, 3, 4].map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setInterviewerCount(n)}
                  className={cn(
                    'flex-1 rounded-xl border py-2 text-sm font-medium transition-colors',
                    interviewerCount === n
                      ? 'border-foreground bg-foreground text-background'
                      : 'border-border hover:bg-secondary'
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              For GD sessions, keep this at 1.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Function domain <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <select
              value={functionTag}
              onChange={e => setFunctionTag(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Any function</option>
              {FUNCTION_TAGS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label>Your background <span className="text-muted-foreground font-normal">(shown anonymously)</span></Label>
            <Textarea
              placeholder="E.g. First year, no prior GD practice, Finance background, 2 PI mocks done..."
              value={background}
              onChange={(e) => setBackground(e.target.value)}
              rows={3}
              maxLength={300}
            />
            <p className="text-xs text-muted-foreground text-right">
              {background.length}/300 — don't include your name here
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>What do you want to practice?</Label>
            <Textarea
              placeholder="E.g. Mock GD on a business case topic, PI for FMCG companies, stress interview prep..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={400}
            />
            <p className="text-xs text-muted-foreground text-right">
              {description.length}/400
            </p>
          </div>

          <Button className="w-full" disabled={pending} onClick={submit}>
            {pending ? 'Posting...' : 'Post request'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

export function MyRequestsClient({
  initialRequests,
  userName,
}: {
  initialRequests: MySlotRequest[]
  userName: string
}) {
  const [requests, setRequests] = useState(initialRequests)

  function handleCreated(req: MySlotRequest) {
    setRequests((prev) => [req, ...prev])
  }

  function handleCancelled(id: string) {
    setRequests((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: 'cancelled' as const } : r))
    )
  }

  function handleConfirmed(requestId: string, seniorId: string, _seniorName: string, _waUrl: string | null) {
    setRequests((prev) =>
      prev.map((r) => {
        if (r.id !== requestId) return r
        const newConfirmed = (r.confirmed_count ?? 0) + 1
        const interviewerCount = r.interviewer_count ?? 1
        const nowMatched = newConfirmed >= interviewerCount
        return {
          ...r,
          confirmed_count: newConfirmed,
          status: nowMatched ? 'matched' as const : r.status,
          matched_senior_id: nowMatched ? seniorId : r.matched_senior_id,
          matched_at: nowMatched ? new Date().toISOString() : r.matched_at,
        }
      })
    )
  }

  return (
    <div className="mx-auto max-w-md px-4 pt-6">
      <div className="mb-5 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold">My Requests</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Post a practice request — seniors see it anonymously and mark interest.
          </p>
        </div>
        <NewRequestSheet onCreated={handleCreated} />
      </div>

      {requests.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground">
          <ClipboardList className="mx-auto h-10 w-10 mb-3 opacity-30" />
          <p className="font-medium">No requests yet</p>
          <p className="text-sm mt-1">Post a request and seniors will reach out to help you prep.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <RequestCard
              key={r.id}
              req={r}
              juniorName={userName}
              onCancelled={handleCancelled}
              onConfirmed={handleConfirmed}
            />
          ))}
        </div>
      )}
    </div>
  )
}
