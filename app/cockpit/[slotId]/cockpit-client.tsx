'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import QRCode from 'react-qr-code'
import { Check, Loader2, RefreshCw, Square, Users, MessageSquare, X } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { initials } from '@/lib/format'
import {
  SCORE_DIMS, SCORE_DIM_LABELS, FEEDBACK_TAGS_POSITIVE, FEEDBACK_TAGS_IMPROVE,
} from '@/lib/types'
import type { SlotDetail, Me, RosterEntry } from '@/lib/types'

const TOKEN_INTERVAL_MS = 55_000  // rotate every 55s (token TTL = 60s, gives 5s grace)

type Tab = 'roster' | 'qr'

interface TokenState {
  token: string
  expiresAt: Date
}

interface FeedbackState {
  scores: Record<string, number>
  tags: string[]
  notes: string
  submitting: boolean
  submitted: boolean
}

function emptyFeedback(): FeedbackState {
  return { scores: {}, tags: [], notes: '', submitting: false, submitted: false }
}

function ScorePicker({
  dim, value, onChange,
}: { dim: string; value: number | undefined; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 text-sm text-muted-foreground">{SCORE_DIM_LABELS[dim as keyof typeof SCORE_DIM_LABELS]}</span>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            onClick={() => onChange(n)}
            className={cn(
              'h-8 w-8 rounded-full text-sm font-semibold transition-all',
              value === n
                ? 'bg-gd text-white'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            )}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  )
}

function FeedbackDrawer({
  participant,
  slotId,
  onClose,
  onSubmitted,
}: {
  participant: RosterEntry
  slotId: string
  onClose: () => void
  onSubmitted: () => void
}) {
  const [fb, setFb] = useState<FeedbackState>(emptyFeedback())
  const supabase = createClient()

  function toggleTag(tag: string) {
    setFb((f) => ({
      ...f,
      tags: f.tags.includes(tag) ? f.tags.filter((t) => t !== tag) : [...f.tags, tag],
    }))
  }

  async function handleSubmit() {
    const allScored = SCORE_DIMS.every((d) => fb.scores[d] !== undefined)
    if (!allScored) { toast.error('Please fill in all four scores.'); return }

    setFb((f) => ({ ...f, submitting: true }))
    const { data, error } = await supabase.rpc('submit_feedback', {
      p_slot_id:    slotId,
      p_to_user_id: participant.user_id,
      p_scores:     fb.scores,
      p_tags:       fb.tags,
      p_notes:      fb.notes.trim() || null,
    })
    setFb((f) => ({ ...f, submitting: false }))

    if (error || data?.error) {
      toast.error('Could not save feedback — try again.')
      return
    }
    setFb((f) => ({ ...f, submitted: true }))
    toast.success(`Feedback saved for ${participant.name.split(' ')[0]}.`)
    onSubmitted()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md mx-auto rounded-t-3xl bg-background border-t border-border">
        {/* handle + header */}
        <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-muted" />
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground">
              {initials(participant.name)}
            </span>
            <div>
              <p className="text-sm font-semibold">{participant.name}</p>
              <p className="text-[11px] text-muted-foreground">Give feedback</p>
            </div>
          </div>
          <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-muted">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        <div className="overflow-y-auto max-h-[70vh] px-4 py-4 space-y-5">
          {fb.submitted ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-success/15">
                <Check className="h-6 w-6 text-success" />
              </span>
              <p className="text-sm font-semibold">Feedback saved!</p>
              <button onClick={onClose} className="text-sm text-muted-foreground underline">Close</button>
            </div>
          ) : (
            <>
              {/* scores */}
              <div className="space-y-3">
                <p className="text-sm font-semibold">Scores (1 = low, 5 = excellent)</p>
                {SCORE_DIMS.map((dim) => (
                  <ScorePicker
                    key={dim}
                    dim={dim}
                    value={fb.scores[dim]}
                    onChange={(v) => setFb((f) => ({ ...f, scores: { ...f.scores, [dim]: v } }))}
                  />
                ))}
              </div>

              {/* tags */}
              <div className="space-y-2.5">
                <p className="text-sm font-semibold">Highlights</p>
                <div className="flex flex-wrap gap-1.5">
                  {FEEDBACK_TAGS_POSITIVE.map((t) => (
                    <button key={t} onClick={() => toggleTag(t)}
                      className={cn(
                        'rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors',
                        fb.tags.includes(t)
                          ? 'bg-success/20 text-success border border-success/30'
                          : 'bg-muted text-muted-foreground'
                      )}>
                      {t}
                    </button>
                  ))}
                </div>
                <p className="text-sm font-semibold">Areas to improve</p>
                <div className="flex flex-wrap gap-1.5">
                  {FEEDBACK_TAGS_IMPROVE.map((t) => (
                    <button key={t} onClick={() => toggleTag(t)}
                      className={cn(
                        'rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors',
                        fb.tags.includes(t)
                          ? 'bg-destructive/15 text-destructive border border-destructive/20'
                          : 'bg-muted text-muted-foreground'
                      )}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* notes */}
              <div>
                <p className="text-sm font-semibold mb-1.5">Private notes (optional)</p>
                <textarea
                  value={fb.notes}
                  onChange={(e) => setFb((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Anything specific to mention…"
                  rows={3}
                  className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm resize-none outline-none focus:border-ring placeholder:text-muted-foreground/60"
                />
              </div>

              <button
                onClick={handleSubmit}
                disabled={fb.submitting}
                className="flex w-full h-11 items-center justify-center gap-2 rounded-full bg-foreground text-background font-semibold text-sm disabled:opacity-70"
              >
                {fb.submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Save feedback
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export function CockpitClient({ slot: initialSlot, me }: { slot: SlotDetail; me: Me }) {
  const [slot, setSlot] = useState<SlotDetail>(initialSlot)
  const [tab, setTab] = useState<Tab>('roster')
  const [tokenState, setTokenState] = useState<TokenState | null>(null)
  const [starting, setStarting] = useState(false)
  const [finalizing, setFinalizing] = useState(false)
  const [feedbackFor, setFeedbackFor] = useState<RosterEntry | null>(null)
  const [feedbackDone, setFeedbackDone] = useState<Set<string>>(new Set())
  const rotateRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [secondsLeft, setSecondsLeft] = useState(0)
  const supabase = createClient()

  const isGD = slot.type === 'GD'
  const isLive = slot.status === 'live'
  const isCompleted = slot.status === 'completed'
  const rosterEntries = Array.isArray(slot.roster) ? (slot.roster as RosterEntry[]) : []

  const attendedCount  = rosterEntries.filter((r) => r.status === 'attended').length
  const confirmedCount = rosterEntries.filter((r) => r.status === 'confirmed').length

  // Countdown tick
  useEffect(() => {
    if (!tokenState) return
    const tick = setInterval(() => {
      const left = Math.max(0, Math.round((tokenState.expiresAt.getTime() - Date.now()) / 1000))
      setSecondsLeft(left)
    }, 1000)
    return () => clearInterval(tick)
  }, [tokenState])

  // Auto-rotate token every TOKEN_INTERVAL_MS while live
  const rotate = useCallback(async () => {
    const { data, error } = await supabase.rpc('rotate_token', { p_slot_id: slot.id })
    if (error || data?.error) return
    setTokenState({ token: data.token, expiresAt: new Date(data.expires_at) })
  }, [slot.id, supabase])

  useEffect(() => {
    if (!isLive) return
    if (rotateRef.current) clearInterval(rotateRef.current)
    rotateRef.current = setInterval(rotate, TOKEN_INTERVAL_MS)
    return () => { if (rotateRef.current) clearInterval(rotateRef.current) }
  }, [isLive, rotate])

  // Realtime roster updates
  useEffect(() => {
    const channel = supabase
      .channel(`cockpit-${slot.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'enrollments' }, async () => {
        // Refresh roster via get_slot_detail
        const { data } = await supabase.rpc('get_slot_detail', { p_slot_id: slot.id })
        if (data && !data.error) setSlot(data as SlotDetail)
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [slot.id, supabase])

  async function handleStart() {
    setStarting(true)
    const { data, error } = await supabase.rpc('start_slot', { p_slot_id: slot.id })
    setStarting(false)
    if (error || data?.error) { toast.error('Could not start session.'); return }
    setSlot((s) => ({ ...s, status: 'live' }))
    setTokenState({ token: data.token, expiresAt: new Date(data.expires_at) })
    setTab('qr')
    toast.success('Session started! QR is live.')
  }

  async function handleFinalize() {
    setFinalizing(true)
    const { data, error } = await supabase.rpc('finalize_slot', { p_slot_id: slot.id })
    setFinalizing(false)
    if (error || data?.error) { toast.error('Could not end session.'); return }
    if (rotateRef.current) clearInterval(rotateRef.current)
    setSlot((s) => ({ ...s, status: 'completed' }))
    setTokenState(null)
    toast.success(`Session ended — ${data.attended} attended, ${data.no_show} no-show.`)
    setTab('roster')
    // Refresh roster
    const { data: fresh } = await supabase.rpc('get_slot_detail', { p_slot_id: slot.id })
    if (fresh && !fresh.error) setSlot(fresh as SlotDetail)
  }

  async function manualRotate() {
    await rotate()
    toast('QR refreshed')
  }

  const checkinUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/checkin?s=${slot.id}&t=${tokenState?.token ?? ''}`
    : ''

  return (
    <div className="px-4 pb-8 space-y-4">
      {/* slot header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className={cn(
            'rounded-md px-2 py-0.5 text-[11px] font-bold tracking-wide',
            isGD ? 'bg-gd-soft text-gd' : 'bg-pi-soft text-pi'
          )}>
            {slot.type}
          </span>
          {isLive && (
            <span className="flex items-center gap-1.5 rounded-full bg-destructive/10 px-2.5 py-1 text-[10px] font-semibold text-destructive">
              <span className="h-1.5 w-1.5 rounded-full bg-destructive animate-pulse-dot" />
              Live
            </span>
          )}
          {isCompleted && (
            <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
              Completed
            </span>
          )}
        </div>
        <h1 className="text-lg font-bold leading-snug">{slot.topic}</h1>
      </div>

      {/* stats row */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Confirmed', value: confirmedCount, color: 'text-gd' },
          { label: 'Attended',  value: attendedCount,  color: 'text-success' },
          { label: 'Capacity',  value: slot.capacity,  color: 'text-foreground' },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-xl border bg-card p-3 text-center">
            <p className={cn('text-2xl font-bold tabular-nums', color)}>{value}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* start / end session */}
      {!isLive && !isCompleted && (
        <button onClick={handleStart} disabled={starting}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-destructive/90 text-white font-semibold text-sm disabled:opacity-70">
          {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {starting ? 'Starting…' : 'Start session'}
        </button>
      )}
      {isLive && (
        <button onClick={handleFinalize} disabled={finalizing}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-full border border-destructive/60 text-destructive font-semibold text-sm hover:bg-destructive/10 disabled:opacity-70">
          {finalizing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
          {finalizing ? 'Ending…' : 'End session'}
        </button>
      )}

      {/* tabs */}
      <div className="flex h-10 items-center gap-1 rounded-full border border-border/70 bg-card p-1">
        {([
          { value: 'roster', label: 'Roster', icon: Users },
          { value: 'qr',     label: 'QR Code', icon: RefreshCw },
        ] as const).map(({ value, label, icon: Icon }) => (
          <button key={value} onClick={() => setTab(value)}
            className={cn(
              'flex h-full flex-1 items-center justify-center gap-1.5 rounded-full text-[13px] font-semibold transition-all',
              tab === value ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}>
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* QR tab */}
      {tab === 'qr' && (
        <div className="space-y-4">
          {isLive && tokenState ? (
            <>
              <div className="flex flex-col items-center gap-4 rounded-2xl border bg-card p-6">
                <div className="rounded-xl bg-white p-3">
                  <QRCode value={checkinUrl} size={200} />
                </div>
                <div className="text-center">
                  <p className="text-2xl font-mono font-bold tracking-widest">{tokenState.token}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Refreshes in {secondsLeft}s
                  </p>
                  <div className="mt-2 h-1 w-48 mx-auto rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-gd rounded-full transition-all duration-1000"
                      style={{ width: `${(secondsLeft / 60) * 100}%` }}
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground text-center max-w-xs">
                  Students scan this QR to mark attendance. Rotates automatically every minute.
                </p>
              </div>

              <button onClick={manualRotate}
                className="flex h-10 w-full items-center justify-center gap-2 rounded-full border text-sm text-muted-foreground hover:text-foreground hover:bg-muted">
                <RefreshCw className="h-3.5 w-3.5" />
                Refresh now
              </button>
            </>
          ) : (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <RefreshCw className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                {isCompleted ? 'Session ended — QR is no longer active.' : 'Start the session to display the QR code.'}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Roster tab */}
      {tab === 'roster' && (
        <div className="space-y-2">
          {rosterEntries.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No one has a confirmed seat yet.
            </div>
          ) : (
            rosterEntries.map((r) => (
              <div key={r.user_id}
                className="flex items-center gap-3 rounded-xl border bg-card px-3 py-2.5">
                <span className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
                  r.status === 'attended' ? 'bg-success/15 text-success' :
                  r.status === 'no_show'  ? 'bg-destructive/10 text-destructive' :
                  'bg-muted text-muted-foreground'
                )}>
                  {r.status === 'attended' ? <Check className="h-4 w-4" /> : initials(r.name)}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{r.name}</p>
                  <p className={cn(
                    'text-[10px] font-semibold',
                    r.status === 'attended' ? 'text-success' :
                    r.status === 'no_show'  ? 'text-destructive' : 'text-muted-foreground'
                  )}>
                    {r.status === 'attended' ? 'Attended' :
                     r.status === 'no_show'  ? 'No-show' : `Seat #${r.position}`}
                  </p>
                </div>
                {/* feedback button — visible after session ends */}
                {isCompleted && r.status !== 'no_show' && r.user_id !== me.id && (
                  <button
                    onClick={() => setFeedbackFor(r)}
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-full transition-colors',
                      feedbackDone.has(r.user_id)
                        ? 'bg-success/15 text-success'
                        : 'bg-muted text-muted-foreground hover:bg-gd-soft hover:text-gd'
                    )}
                    aria-label={`Give feedback to ${r.name}`}
                  >
                    {feedbackDone.has(r.user_id)
                      ? <Check className="h-3.5 w-3.5" />
                      : <MessageSquare className="h-3.5 w-3.5" />}
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Feedback drawer */}
      {feedbackFor && (
        <FeedbackDrawer
          participant={feedbackFor}
          slotId={slot.id}
          onClose={() => setFeedbackFor(null)}
          onSubmitted={() => {
            setFeedbackDone((s) => new Set([...s, feedbackFor.user_id]))
            setFeedbackFor(null)
          }}
        />
      )}
    </div>
  )
}
