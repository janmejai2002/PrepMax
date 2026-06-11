'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  Clock, MapPin, MessageCircle, Loader2, Send, Users,
  LogOut, Pencil, Trash2, MoreVertical, Play, Star,
} from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { formatSlotTime, waPhone, initials } from '@/lib/format'
import { buildSlotConfirmation, buildGmailCompose } from '@/lib/email'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { EditSlotSheet } from '@/components/slots/edit-slot-sheet'
import type { SlotDetail, Me, ConfirmSlotResult, RosterEntry } from '@/lib/types'

function ReviewBox({ slotId }: { slotId: string }) {
  const [rating, setRating] = useState<number>(0)
  const [text, setText] = useState('')
  const [status, setStatus] = useState<'idle' | 'submitting' | 'done' | 'already'>('idle')
  const supabase = createClient()

  async function submit() {
    if (rating === 0) return
    setStatus('submitting')
    const { data } = await supabase.rpc('submit_review', {
      p_slot_id: slotId,
      p_rating: rating,
      p_text: text.trim() || null,
    })
    if (data?.status === 'already_reviewed') { setStatus('already'); return }
    setStatus('done')
  }

  if (status === 'done' || status === 'already') {
    return (
      <div className="rounded-2xl border bg-card p-4 text-center text-sm text-muted-foreground">
        {status === 'done' ? 'Review submitted — thanks!' : 'You already reviewed this session.'}
      </div>
    )
  }

  return (
    <div className="rounded-2xl border bg-card p-4 space-y-3">
      <p className="text-sm font-semibold">Leave a review</p>
      <div className="flex gap-1">
        {[1,2,3,4,5].map(n => (
          <button key={n} onClick={() => setRating(n)} className="p-0.5">
            <Star className={cn('h-6 w-6 transition-colors', n <= rating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30')} />
          </button>
        ))}
      </div>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Optional note (anonymous)"
        rows={2}
        maxLength={1000}
        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
      />
      <button
        onClick={submit}
        disabled={rating === 0 || status === 'submitting'}
        className="flex h-10 w-full items-center justify-center rounded-full bg-foreground text-background text-sm font-semibold disabled:opacity-50"
      >
        {status === 'submitting' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Submit review'}
      </button>
    </div>
  )
}

function durationMins(start: string, end: string) {
  return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60_000)
}

function StatusChip({ status }: { status: RosterEntry['status'] }) {
  return (
    <span className={cn(
      'rounded-full px-2 py-0.5 text-[10px] font-semibold',
      status === 'attended'  && 'bg-success/15 text-success',
      status === 'confirmed' && 'bg-gd-soft text-gd',
      status === 'no_show'   && 'bg-destructive/10 text-destructive',
    )}>
      {status === 'attended'  ? 'Attended' :
       status === 'confirmed' ? 'Confirmed' : 'No-show'}
    </span>
  )
}

export function SlotDetailClient({ slot: initialSlot, me }: { slot: SlotDetail; me: Me }) {
  const [slot, setSlot] = useState<SlotDetail>(initialSlot)
  const [joining, setJoining] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [starting, setStarting] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const supabase = createClient()

  const isGD = slot.type === 'GD'
  const enrollment = slot.my_enrollment
  const isOwnSlot = slot.host_id === me.id
  const canManageThis = isOwnSlot || slot.is_admin || slot.is_judge
  const isFull = slot.status === 'full' || (slot.capacity - slot.enrolled_count) <= 0
  const isLive = slot.status === 'live'
  const isCompleted = slot.status === 'completed'
  const isCancelled = slot.status === 'cancelled'
  const canJoin = !isLive && !isCompleted && !isCancelled && !enrollment && !slot.confirmed_at
  const mins = durationMins(slot.start_at, slot.end_at)

  async function handleJoin() {
    setJoining(true)
    const { data, error } = await supabase.rpc('join_slot', {
      p_slot_id: slot.id,
      p_user_id: me.id,
    })
    setJoining(false)
    if (error || data?.error) {
      toast.error(data?.error === 'slot_not_joinable' ? 'Slot just closed.' : 'Something went wrong.')
      return
    }
    if (data.status === 'confirmed') {
      toast.success(`You're in! Seat #${data.position}`)
      setSlot(s => ({
        ...s,
        my_enrollment: { status: 'confirmed', position: data.position },
        enrolled_count: data.idempotent ? s.enrolled_count : s.enrolled_count + 1,
      }))
    } else {
      toast(`Waitlist #${data.position} — we'll grab you a seat if someone drops.`)
      setSlot(s => ({ ...s, my_enrollment: { status: 'waitlist', position: data.position } }))
    }
  }

  async function handleLeave() {
    const wasConfirmed = enrollment?.status === 'confirmed'
    setLeaving(true)
    const { data, error } = await supabase.rpc('leave_slot', {
      p_slot_id: slot.id, p_user_id: me.id,
    })
    setLeaving(false)
    if (error || data?.error) { toast.error('Could not leave — try again.'); return }
    const seatFreed = wasConfirmed && data.seat_freed
    setSlot(s => ({
      ...s,
      my_enrollment: null,
      enrolled_count: seatFreed ? s.enrolled_count - 1 : s.enrolled_count,
      status: seatFreed && s.status === 'full' ? 'open' : s.status,
    }))
    toast.success(wasConfirmed ? 'You gave up your seat.' : 'You left the waitlist.')
  }

  async function handleConfirm() {
    setConfirming(true)
    const { data, error } = await supabase.rpc('confirm_slot', { p_slot_id: slot.id })
    setConfirming(false)
    if (error || data?.error) {
      const msg = data?.error === 'no_confirmed_students'
        ? 'No confirmed seats yet — nothing to notify.'
        : 'Could not confirm — try again.'
      toast.error(msg)
      return
    }
    const result = data as ConfirmSlotResult
    const { subject, body } = buildSlotConfirmation(result.slot)
    window.open(buildGmailCompose({ to: result.to, cc: result.cc, subject, body }), '_blank', 'noopener')
    setSlot(s => ({ ...s, confirmed_at: s.confirmed_at ?? new Date().toISOString() }))
    toast.success(`Gmail opened — ${result.to.length} student${result.to.length === 1 ? '' : 's'} to notify.`)
  }

  async function handleStart() {
    setStarting(true)
    const { data, error } = await supabase.rpc('start_slot', { p_slot_id: slot.id })
    setStarting(false)
    if (error || data?.error) { toast.error('Could not start slot.'); return }
    setSlot(s => ({ ...s, status: 'live' }))
    toast.success('Session started — cockpit is live.')
  }

  async function handleCancel() {
    setCancelling(true)
    const { data, error } = await supabase.rpc('cancel_slot', { p_slot_id: slot.id })
    setCancelling(false)
    setConfirmCancel(false)
    if (error || data?.error) { toast.error('Could not cancel — try again.'); return }
    setSlot(s => ({ ...s, status: 'cancelled' }))
    toast.success('Slot cancelled.')
  }

  const whatsappUrl = (() => {
    const phone = waPhone(slot.host?.whatsapp ?? null)
    if (!phone) return null
    const text = encodeURIComponent(
      `Hi, I am ${me.name}. I've joined your ${slot.type} slot for ${formatSlotTime(slot.start_at)}.`
    )
    return `https://wa.me/${phone}?text=${text}`
  })()

  const rosterEntries = Array.isArray(slot.roster) ? slot.roster as RosterEntry[] : null
  const rosterCount  = !Array.isArray(slot.roster) ? (slot.roster as { count: number }).count : null

  return (
    <article className="space-y-4 px-4 pb-6">
      {/* type + status header */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className={cn(
          'rounded-lg px-2.5 py-1 text-[12px] font-bold tracking-wide',
          isGD ? 'bg-gd-soft text-gd' : 'bg-pi-soft text-pi'
        )}>
          {slot.type}
        </span>
        {isLive && (
          <span className="flex items-center gap-1.5 rounded-full bg-destructive/10 px-2.5 py-1 text-[11px] font-semibold text-destructive">
            <span className="h-1.5 w-1.5 rounded-full bg-destructive animate-pulse-dot" />
            Live
          </span>
        )}
        {isCompleted && (
          <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">Completed</span>
        )}
        {isCancelled && (
          <span className="rounded-full bg-destructive/10 px-2.5 py-1 text-[11px] font-medium text-destructive">Cancelled</span>
        )}
        {slot.confirmed_at && !isLive && !isCompleted && (
          <span className="rounded-full bg-success/15 px-2.5 py-1 text-[11px] font-semibold text-success">
            Lineup confirmed
          </span>
        )}

        {canManageThis && !isCancelled && !isCompleted && (
          <div className="ml-auto">
            <DropdownMenu>
              <DropdownMenuTrigger className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted">
                <MoreVertical className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {!isLive && (
                  <DropdownMenuItem onClick={() => setEditOpen(true)}>
                    <Pencil className="h-4 w-4" /> Edit slot
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem variant="destructive" onClick={() => setConfirmCancel(true)}>
                  <Trash2 className="h-4 w-4" /> Cancel slot
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {/* title */}
      <div>
        <h1 className="text-xl font-bold leading-snug">{slot.topic}</h1>
        {slot.internship && (
          <p className="mt-0.5 text-sm font-medium text-muted-foreground">{slot.internship}</p>
        )}
      </div>

      {/* tags */}
      {slot.expert_areas.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {slot.expert_areas.map((area) => (
            <span key={area} className="rounded-full border border-border/70 px-2.5 py-0.5 text-[11px] text-muted-foreground">
              {area}
            </span>
          ))}
        </div>
      )}

      {/* meta row */}
      <div className="rounded-2xl border bg-card p-4 space-y-3">
        <div className="flex items-center gap-3 text-sm">
          <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div>
            <span className="font-medium">{formatSlotTime(slot.start_at)}</span>
            <span className="ml-1.5 text-xs text-muted-foreground">({mins} min)</span>
          </div>
        </div>
        {slot.room && (
          <div className="flex items-center gap-3 text-sm">
            <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="font-medium">{slot.room.name}</span>
            {slot.room.location && <span className="text-xs text-muted-foreground">· {slot.room.location}</span>}
          </div>
        )}
        <div className="flex items-center gap-3 text-sm">
          <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="font-medium">{slot.enrolled_count}/{slot.capacity} seats</span>
          {!isFull && canJoin && (
            <span className="text-xs text-muted-foreground">
              · {slot.capacity - slot.enrolled_count} left
            </span>
          )}
        </div>
      </div>

      {/* seat meter */}
      <div className="flex gap-1">
        {Array.from({ length: slot.capacity }).map((_, i) => (
          <span key={i} className={cn(
            'h-1.5 flex-1 rounded-full transition-colors',
            i < slot.enrolled_count ? (isGD ? 'bg-gd' : 'bg-pi') : 'bg-muted'
          )} />
        ))}
      </div>

      {/* description */}
      {slot.description && (
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-sm font-semibold text-muted-foreground mb-1.5">About this slot</p>
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{slot.description}</p>
        </div>
      )}

      {/* GD format note */}
      {slot.gd_type_desc && (
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-sm font-semibold text-muted-foreground mb-1.5">Format</p>
          <p className="text-sm leading-relaxed">{slot.gd_type_desc}</p>
        </div>
      )}

      {/* judges panel */}
      <div className="rounded-2xl border bg-card p-4 space-y-3">
        <p className="text-sm font-semibold text-muted-foreground">
          {slot.co_judges.length > 0 ? 'Judges' : 'Host'}
        </p>
        {/* host */}
        <div className="flex items-center gap-3">
          <span className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
            isGD ? 'bg-gd-soft text-gd' : 'bg-pi-soft text-pi'
          )}>
            {slot.host ? initials(slot.host.name) : '?'}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{isOwnSlot ? 'You' : (slot.host?.name ?? 'Senior host')}</p>
            <p className="text-[11px] text-muted-foreground">Host</p>
          </div>
          {!isOwnSlot && whatsappUrl && (
            <a href={whatsappUrl} target="_blank" rel="noopener noreferrer"
               className="flex h-8 w-8 items-center justify-center rounded-full bg-success/10 text-success hover:bg-success/20">
              <MessageCircle className="h-4 w-4" />
            </a>
          )}
        </div>
        {/* co-judges */}
        {slot.co_judges.map((j) => (
          <div key={j.id} className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-bold text-muted-foreground">
              {initials(j.name)}
            </span>
            <div>
              <p className="text-sm font-medium">{j.name}</p>
              <p className="text-[11px] text-muted-foreground">Co-judge</p>
            </div>
          </div>
        ))}
      </div>

      {/* roster (visible to eligible viewers) */}
      {rosterEntries !== null && rosterEntries.length > 0 && (
        <div className="rounded-2xl border bg-card p-4 space-y-3">
          <p className="text-sm font-semibold text-muted-foreground">
            Participants ({rosterEntries.length})
          </p>
          {rosterEntries.map((r) => (
            <div key={r.user_id} className="flex items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground">
                {initials(r.name)}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {r.user_id === me.id ? `${r.name} (you)` : r.name}
                </p>
                {r.position && !['attended', 'no_show'].includes(r.status) && (
                  <p className="text-[11px] text-muted-foreground">Seat #{r.position}</p>
                )}
              </div>
              <StatusChip status={r.status} />
            </div>
          ))}
        </div>
      )}

      {rosterCount !== null && rosterCount > 0 && (
        <div className="rounded-2xl border bg-card px-4 py-3 flex items-center gap-2 text-sm text-muted-foreground">
          <Users className="h-4 w-4" />
          <span>{rosterCount} seat{rosterCount === 1 ? '' : 's'} taken</span>
          <span className="text-xs">· join to see the participant list</span>
        </div>
      )}

      {/* main action zone */}
      <div className="space-y-2.5">
        {/* host/judge: cockpit link when live */}
        {(isOwnSlot || slot.is_judge) && isLive && (
          <Link
            href={`/cockpit/${slot.id}`}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-destructive text-white font-semibold text-sm transition-all active:scale-[0.97]"
          >
            <span className="h-2 w-2 rounded-full bg-white animate-pulse-dot" />
            Open cockpit
          </Link>
        )}

        {/* host: start session (when not yet live) */}
        {isOwnSlot && !isLive && !isCompleted && !isCancelled && (
          <button
            onClick={handleStart}
            disabled={starting}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-destructive/90 text-white font-semibold text-sm transition-all active:scale-[0.97] disabled:opacity-70"
          >
            {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {starting ? 'Starting…' : 'Start session'}
          </button>
        )}

        {/* host: confirm & notify */}
        {isOwnSlot && !isLive && !isCompleted && !isCancelled && (
          <button
            onClick={handleConfirm}
            disabled={confirming}
            className={cn(
              'flex h-11 w-full items-center justify-center gap-2 rounded-full text-sm font-semibold transition-all active:scale-[0.97] disabled:opacity-70',
              slot.confirmed_at
                ? 'border border-border bg-secondary text-secondary-foreground hover:bg-secondary/80'
                : 'bg-foreground text-background hover:opacity-90'
            )}
          >
            {confirming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            {slot.confirmed_at ? 'Re-send notifications' : 'Confirm & notify'}
          </button>
        )}

        {/* student: join / waitlist / leave */}
        {!isOwnSlot && !slot.is_judge && !isCompleted && !isCancelled && (
          enrollment?.status === 'confirmed' ? (
            <div className="flex gap-2">
              <span className="flex flex-1 h-11 items-center justify-center rounded-full bg-success/15 text-sm font-semibold text-success">
                You&apos;re in ✓
              </span>
              {whatsappUrl && (
                <a href={whatsappUrl} target="_blank" rel="noopener noreferrer"
                   className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-success/15 text-success hover:bg-success/25">
                  <MessageCircle className="h-4 w-4" />
                </a>
              )}
              {!slot.confirmed_at && (
                <button onClick={handleLeave} disabled={leaving}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-60">
                  {leaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                </button>
              )}
            </div>
          ) : enrollment?.status === 'waitlist' ? (
            <div className="flex gap-2">
              <span className="flex flex-1 h-11 items-center justify-center rounded-full bg-warn/15 text-sm font-semibold text-warn">
                Waitlist #{enrollment.position}
              </span>
              <button onClick={handleLeave} disabled={leaving}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-60">
                {leaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
              </button>
            </div>
          ) : canJoin ? (
            <button onClick={handleJoin} disabled={joining}
              className={cn(
                'flex h-12 w-full items-center justify-center rounded-full text-sm font-semibold transition-all active:scale-[0.97] disabled:opacity-70',
                isFull
                  ? 'border border-border bg-secondary text-secondary-foreground hover:bg-secondary/80'
                  : isGD ? 'bg-gd text-white hover:opacity-90' : 'bg-pi text-black hover:opacity-90'
              )}
            >
              {joining ? <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Grabbing…</span>
                : isFull ? 'Join waitlist' : 'Join slot'}
            </button>
          ) : isLive ? (
            <div className="flex h-11 items-center justify-center rounded-full bg-muted text-sm text-muted-foreground">
              Session in progress
            </div>
          ) : slot.confirmed_at ? (
            <div className="flex h-11 items-center justify-center rounded-full bg-muted text-sm text-muted-foreground">
              Lineup is locked
            </div>
          ) : null
        )}
      </div>

      {/* cockpit link for host when live */}
      {(isOwnSlot || slot.is_judge) && isLive && (
        <p className="text-center text-xs text-muted-foreground">
          Use the cockpit to manage attendance and give feedback
        </p>
      )}

      {/* Review section — shown to attended participants after slot completes */}
      {isCompleted && enrollment?.status === 'attended' && (
        <ReviewBox slotId={slot.id} />
      )}

      <EditSlotSheet
        open={editOpen}
        onOpenChange={setEditOpen}
        slot={slot}
        onSlotChange={(updated) => setSlot(s => ({ ...s, ...updated }))}
      />

      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this slot?</AlertDialogTitle>
            <AlertDialogDescription>
              {slot.enrolled_count > 0
                ? `${slot.enrolled_count} junior${slot.enrolled_count === 1 ? '' : 's'} will lose their spot. This can't be undone.`
                : "This removes the slot. This can't be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleCancel() }}
              disabled={cancelling}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {cancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Cancel slot'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </article>
  )
}
