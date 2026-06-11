'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  Clock,
  MapPin,
  MessageCircle,
  Loader2,
  MoreVertical,
  Pencil,
  Trash2,
  LogOut,
  Send,
  ChevronRight,
} from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { formatSlotTime, waPhone, initials } from '@/lib/format'
import { buildSlotConfirmation, buildGmailCompose } from '@/lib/email'
import type { ConfirmSlotResult } from '@/lib/types'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import dynamic from 'next/dynamic'
const EditSlotSheet = dynamic(() =>
  import('./edit-slot-sheet').then((m) => ({ default: m.EditSlotSheet })),
  { ssr: false }
)
import type { FeedSlot, Me } from '@/lib/types'

interface SlotCardProps {
  slot: FeedSlot
  me: Me
  canManage: boolean
  canJoin?: boolean
  onSlotChange: (slot: FeedSlot) => void
  onSlotRemoved: (slotId: string) => void
}

export function SlotCard({ slot, me, canManage, canJoin = true, onSlotChange, onSlotRemoved }: SlotCardProps) {
  const [joining, setJoining] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const supabase = createClient()

  const isGD = slot.type === 'GD'
  const seatsLeft = slot.capacity - slot.enrolled_count
  const isFull = slot.status === 'full' || seatsLeft <= 0
  const isLive = slot.status === 'live'
  const enrollment = slot.my_enrollment
  const isOwnSlot = slot.host_id === me.id
  const canManageThis = isOwnSlot || canManage

  async function handleJoin() {
    setJoining(true)
    const { data, error } = await supabase.rpc('join_slot', {
      p_slot_id: slot.id,
      p_user_id: me.id,
    })
    setJoining(false)

    if (error || data?.error) {
      const msg =
        data?.error === 'slot_not_joinable'
          ? 'This slot just closed — try another one.'
          : 'Something went wrong. Give it another tap.'
      toast.error(msg)
      return
    }

    if (data.status === 'confirmed') {
      navigator.vibrate?.([30, 20, 60])
      toast.success(`You're in! Seat #${data.position} 🎉`)
      onSlotChange({
        ...slot,
        my_enrollment: { status: 'confirmed', position: data.position },
        enrolled_count: data.idempotent ? slot.enrolled_count : slot.enrolled_count + 1,
      })
    } else if (data.status === 'waitlist') {
      navigator.vibrate?.(30)
      toast(`Slot full — you're #${data.position} on the waitlist`, {
        description: 'We grab you a seat the moment someone drops.',
      })
      onSlotChange({
        ...slot,
        my_enrollment: { status: 'waitlist', position: data.position },
      })
    }
  }

  async function handleLeave() {
    const wasConfirmed = enrollment?.status === 'confirmed'
    setLeaving(true)
    const { data, error } = await supabase.rpc('leave_slot', {
      p_slot_id: slot.id,
      p_user_id: me.id,
    })
    setLeaving(false)

    if (error || data?.error) {
      toast.error('Could not leave the slot — try again.')
      return
    }
    navigator.vibrate?.(30)

    // A confirmed leaver with no waitlist behind them frees the seat.
    const seatFreed = wasConfirmed && data.seat_freed
    onSlotChange({
      ...slot,
      my_enrollment: null,
      enrolled_count: seatFreed ? slot.enrolled_count - 1 : slot.enrolled_count,
      status: seatFreed && slot.status === 'full' ? 'open' : slot.status,
    })
    toast.success(wasConfirmed ? 'You gave up your seat.' : 'You left the waitlist.')
  }

  async function handleCancel() {
    setCancelling(true)
    const { data, error } = await supabase.rpc('cancel_slot', { p_slot_id: slot.id })
    setCancelling(false)
    setConfirmCancel(false)

    if (error || data?.error) {
      const msg =
        data?.error === 'unauthorized'
          ? "You're not allowed to cancel this slot."
          : data?.error === 'slot_not_cancellable'
            ? 'This slot can no longer be cancelled.'
            : 'Could not cancel the slot — try again.'
      toast.error(msg)
      return
    }

    toast.success('Slot cancelled — enrolled juniors have been released.')
    onSlotRemoved(slot.id)
  }

  async function handleConfirm() {
    setConfirming(true)
    const { data, error } = await supabase.rpc('confirm_slot', { p_slot_id: slot.id })
    setConfirming(false)

    if (error || data?.error) {
      const msg =
        data?.error === 'unauthorized'
          ? "You're not allowed to confirm this slot."
          : data?.error === 'no_confirmed_students'
            ? 'No one has a confirmed seat yet — nobody to notify.'
            : data?.error === 'slot_not_confirmable'
              ? 'This slot can no longer be confirmed.'
              : 'Could not prepare the email — try again.'
      toast.error(msg)
      return
    }

    const result = data as ConfirmSlotResult
    const { subject, body } = buildSlotConfirmation(result.slot)
    const url = buildGmailCompose({ to: result.to, cc: result.cc, subject, body })
    window.open(url, '_blank', 'noopener,noreferrer')

    // Reflect the now-final lineup locally (joins are blocked server-side)
    onSlotChange({
      ...slot,
      confirmed_at: slot.confirmed_at ?? new Date().toISOString(),
    })
    toast.success(
      `Gmail opened — ${result.to.length} student${result.to.length === 1 ? '' : 's'} to notify.`
    )
  }

  const whatsappUrl = (() => {
    const phone = waPhone(slot.host?.whatsapp ?? null)
    if (!phone) return null
    const text = encodeURIComponent(
      `Hi, I am ${me.name}. I've joined the ${slot.type} slot you posted for ${formatSlotTime(
        slot.start_at
      )}. If any prep is needed, I'd like to come prepared.`
    )
    return `https://wa.me/${phone}?text=${text}`
  })()

  return (
    <article
      className={cn(
        'relative overflow-hidden rounded-2xl border bg-card shadow-sm transition-colors',
        enrollment?.status === 'confirmed' && 'border-success/30'
      )}
    >
      {/* type identity accent */}
      <div className={cn('absolute inset-y-0 left-0 w-[3px]', isGD ? 'bg-gd' : 'bg-pi')} />

      <div className="space-y-3 p-4 pl-5">
        {/* header row */}
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'rounded-md px-2 py-0.5 text-[11px] font-bold tracking-wide',
              isGD ? 'bg-gd-soft text-gd' : 'bg-pi-soft text-pi'
            )}
          >
            {slot.type}
          </span>
          {slot.internship && (
            <span className="truncate text-xs font-medium text-muted-foreground">
              {slot.internship}
            </span>
          )}
          <div className="ml-auto flex shrink-0 items-center gap-1">
            {isLive ? (
              <span className="flex items-center gap-1.5 rounded-full bg-destructive/10 px-2.5 py-1 text-[11px] font-semibold text-destructive">
                <span className="h-1.5 w-1.5 rounded-full bg-destructive animate-pulse-dot" />
                Live
              </span>
            ) : isFull && !enrollment ? (
              <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                Full
              </span>
            ) : seatsLeft <= 2 && !enrollment ? (
              <span className="rounded-full bg-warn/15 px-2.5 py-1 text-[11px] font-semibold text-warn">
                {seatsLeft} {seatsLeft === 1 ? 'seat' : 'seats'} left
              </span>
            ) : null}

            {slot.confirmed_at && (
              <span className="rounded-full bg-success/15 px-2.5 py-1 text-[11px] font-semibold text-success">
                Lineup confirmed
              </span>
            )}

            {canManageThis && (
              <DropdownMenu>
                <DropdownMenuTrigger
                  className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label="Manage slot"
                >
                  <MoreVertical className="h-4 w-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setEditOpen(true)}>
                    <Pencil className="h-4 w-4" />
                    Edit slot
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => setConfirmCancel(true)}
                  >
                    <Trash2 className="h-4 w-4" />
                    Cancel slot
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        {/* topic — tappable to detail page */}
        <Link href={`/slots/${slot.id}`} className="group flex items-start gap-1">
          <h3 className="flex-1 text-[15px] font-semibold leading-snug group-hover:text-gd transition-colors">
            {slot.topic}
          </h3>
          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors" />
        </Link>

        {/* expert areas */}
        {slot.expert_areas.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {slot.expert_areas.map((area) => (
              <span
                key={area}
                className="rounded-full border border-border/70 px-2 py-0.5 text-[11px] text-muted-foreground"
              >
                {area}
              </span>
            ))}
          </div>
        )}

        {/* time + room */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            {formatSlotTime(slot.start_at)}
          </span>
          {slot.room && (
            <span className="flex items-center gap-1.5 truncate">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{slot.room.name}</span>
            </span>
          )}
        </div>

        {/* seat meter */}
        <div className="flex items-center gap-2.5">
          <div className="flex flex-1 gap-1">
            {Array.from({ length: slot.capacity }).map((_, i) => (
              <span
                key={i}
                className={cn(
                  'h-1 flex-1 rounded-full transition-colors',
                  i < slot.enrolled_count ? (isGD ? 'bg-gd' : 'bg-pi') : 'bg-muted'
                )}
              />
            ))}
          </div>
          <span className="text-[11px] font-medium tabular-nums text-muted-foreground">
            {slot.enrolled_count}/{slot.capacity}
          </span>
        </div>

        {/* host + action */}
        <div className="flex items-center gap-3 border-t border-border/60 pt-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span
              className={cn(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
                isGD ? 'bg-gd-soft text-gd' : 'bg-pi-soft text-pi'
              )}
            >
              {slot.host ? initials(slot.host.name) : '?'}
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs font-medium">
                {isOwnSlot ? 'You' : (slot.host?.name ?? 'Senior host')}
              </p>
              <p className="text-[10px] text-muted-foreground">hosting</p>
            </div>
          </div>

          {isOwnSlot ? (
            <button
              onClick={handleConfirm}
              disabled={confirming}
              className={cn(
                'flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-xs font-semibold transition-all active:scale-[0.97] disabled:opacity-70',
                slot.confirmed_at
                  ? 'border border-border bg-secondary text-secondary-foreground hover:bg-secondary/80'
                  : 'bg-foreground text-background hover:opacity-90'
              )}
            >
              {confirming ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              {slot.confirmed_at ? 'Re-send' : 'Confirm & notify'}
            </button>
          ) : enrollment?.status === 'confirmed' ? (
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-success/15 px-3 py-1.5 text-xs font-semibold text-success">
                You&apos;re in ✓
              </span>
              {whatsappUrl && (
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-success/15 text-success transition-colors hover:bg-success/25"
                  aria-label="Say hi on WhatsApp"
                >
                  <MessageCircle className="h-4 w-4" />
                </a>
              )}
              <button
                onClick={handleLeave}
                disabled={leaving}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-60"
                aria-label="Leave slot"
              >
                {leaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <LogOut className="h-4 w-4" />
                )}
              </button>
            </div>
          ) : enrollment?.status === 'waitlist' ? (
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-warn/15 px-3 py-1.5 text-xs font-semibold text-warn">
                Waitlist #{enrollment.position}
              </span>
              <button
                onClick={handleLeave}
                disabled={leaving}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-60"
                aria-label="Leave waitlist"
              >
                {leaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <LogOut className="h-4 w-4" />
                )}
              </button>
            </div>
          ) : isLive ? (
            <span className="text-xs font-medium text-muted-foreground">In session</span>
          ) : slot.confirmed_at ? (
            <span className="rounded-full bg-secondary px-3 py-1.5 text-xs font-semibold text-muted-foreground">
              Lineup confirmed
            </span>
          ) : canJoin ? (
            <button
              onClick={handleJoin}
              disabled={joining}
              className={cn(
                'h-10 shrink-0 rounded-full px-5 text-[13px] font-semibold transition-all active:scale-[0.97] disabled:opacity-70',
                isFull
                  ? 'border border-border bg-secondary text-secondary-foreground hover:bg-secondary/80'
                  : isGD
                    ? 'bg-gd text-white hover:opacity-90'
                    : 'bg-pi text-black hover:opacity-90'
              )}
            >
              {joining ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Grabbing…
                </span>
              ) : isFull ? (
                'Join waitlist'
              ) : (
                'Join slot'
              )}
            </button>
          ) : null}
        </div>
      </div>

      {/* host/admin: edit sheet */}
      {canManageThis && (
        <EditSlotSheet
          open={editOpen}
          onOpenChange={setEditOpen}
          slot={slot}
          onSlotChange={onSlotChange}
        />
      )}

      {/* host/admin: cancel confirmation */}
      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this slot?</AlertDialogTitle>
            <AlertDialogDescription>
              {slot.enrolled_count > 0
                ? `${slot.enrolled_count} junior${slot.enrolled_count === 1 ? '' : 's'} will lose their spot. This can't be undone.`
                : "This removes the slot from the feed. This can't be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>Keep slot</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handleCancel()
              }}
              disabled={cancelling}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {cancelling ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Cancelling…
                </span>
              ) : (
                'Cancel slot'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </article>
  )
}
