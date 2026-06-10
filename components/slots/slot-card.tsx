'use client'

import { useState } from 'react'
import { Clock, MapPin, MessageCircle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { formatSlotTime, waPhone, initials } from '@/lib/format'
import type { FeedSlot, Me } from '@/lib/types'

interface SlotCardProps {
  slot: FeedSlot
  me: Me
  onSlotChange: (slot: FeedSlot) => void
}

export function SlotCard({ slot, me, onSlotChange }: SlotCardProps) {
  const [joining, setJoining] = useState(false)
  const supabase = createClient()

  const isGD = slot.type === 'GD'
  const seatsLeft = slot.capacity - slot.enrolled_count
  const isFull = slot.status === 'full' || seatsLeft <= 0
  const isLive = slot.status === 'live'
  const enrollment = slot.my_enrollment

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
      toast.success(`You're in! Seat #${data.position} 🎉`)
      onSlotChange({
        ...slot,
        my_enrollment: { status: 'confirmed', position: data.position },
        enrolled_count: data.idempotent ? slot.enrolled_count : slot.enrolled_count + 1,
      })
    } else if (data.status === 'waitlist') {
      toast(`Slot full — you're #${data.position} on the waitlist`, {
        description: 'We grab you a seat the moment someone drops.',
      })
      onSlotChange({
        ...slot,
        my_enrollment: { status: 'waitlist', position: data.position },
      })
    }
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
      <div
        className={cn(
          'absolute inset-y-0 left-0 w-[3px]',
          isGD ? 'bg-gd' : 'bg-pi'
        )}
      />

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
          <span className="ml-auto shrink-0">
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
          </span>
        </div>

        {/* topic */}
        <h3 className="text-[15px] font-semibold leading-snug">{slot.topic}</h3>

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
                  i < slot.enrolled_count
                    ? isGD
                      ? 'bg-gd'
                      : 'bg-pi'
                    : 'bg-muted'
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
                {slot.host?.name ?? 'Senior host'}
              </p>
              <p className="text-[10px] text-muted-foreground">hosting</p>
            </div>
          </div>

          {enrollment?.status === 'confirmed' ? (
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-success/15 px-3 py-1.5 text-xs font-semibold text-success">
                You&apos;re in ✓
              </span>
              {whatsappUrl && (
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-9 items-center gap-1.5 rounded-full bg-success/15 px-3 text-xs font-semibold text-success transition-colors hover:bg-success/25"
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                  Say hi
                </a>
              )}
            </div>
          ) : enrollment?.status === 'waitlist' ? (
            <span className="rounded-full bg-warn/15 px-3 py-1.5 text-xs font-semibold text-warn">
              Waitlist #{enrollment.position}
            </span>
          ) : isLive ? (
            <span className="text-xs font-medium text-muted-foreground">
              In session
            </span>
          ) : (
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
          )}
        </div>
      </div>
    </article>
  )
}
