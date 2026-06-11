'use client'

import { useEffect, useState } from 'react'
import { CalendarDays, Clock, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'

interface SlotBlock {
  id: string
  type: string
  topic: string
  start_at: string
  end_at: string
  status: string
}

interface FreeWindow {
  start: Date
  end: Date
}

interface RoomScheduleSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  roomId: string
  roomName: string
  durationMin: number
  onSelect: (startAt: Date) => void
}

function fmt(d: Date) {
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function dayLabel(d: Date, ref: Date): string {
  const diff = dayStart(d).getTime() - dayStart(ref).getTime()
  const days = Math.round(diff / 86_400_000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  return d.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' })
}

function dayStart(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function dayEnd(d: Date): Date {
  const x = new Date(d)
  x.setHours(23, 59, 59, 999)
  return x
}

// Compute free windows in a day given occupied slots and minimum duration
function computeFreeWindows(
  slots: SlotBlock[],
  dayDate: Date,
  durationMin: number,
  now: Date,
): FreeWindow[] {
  const BUSINESS_START_H = 7
  const BUSINESS_END_H   = 22

  const dayS = dayStart(dayDate)
  const startBound = new Date(dayS)
  startBound.setHours(BUSINESS_START_H, 0, 0, 0)
  const endBound = new Date(dayS)
  endBound.setHours(BUSINESS_END_H, 0, 0, 0)

  // Occupied intervals within this day, sorted
  const occupied = slots
    .filter((s) => {
      const ss = new Date(s.start_at)
      const se = new Date(s.end_at)
      return ss < endBound && se > startBound
    })
    .map((s) => ({ start: new Date(s.start_at), end: new Date(s.end_at) }))
    .sort((a, b) => a.start.getTime() - b.start.getTime())

  const minMs = durationMin * 60_000
  const minBookableStart = new Date(now.getTime() + 5 * 60_000) // at least 5 min from now

  const windows: FreeWindow[] = []
  let cursor = startBound

  for (const block of occupied) {
    // Gap between cursor and block.start
    const gapEnd = block.start < endBound ? block.start : endBound
    const gapStart = cursor > startBound ? cursor : startBound

    if (gapEnd.getTime() - gapStart.getTime() >= minMs) {
      // Clamp so we don't suggest a slot starting in the past
      const bookableStart = gapStart < minBookableStart ? minBookableStart : gapStart
      if (bookableStart < gapEnd && gapEnd.getTime() - bookableStart.getTime() >= minMs) {
        windows.push({ start: bookableStart, end: gapEnd })
      }
    }

    cursor = block.end > cursor ? block.end : cursor
  }

  // Gap after last occupied slot
  if (cursor < endBound && endBound.getTime() - cursor.getTime() >= minMs) {
    const bookableStart = cursor < minBookableStart ? minBookableStart : cursor
    if (bookableStart < endBound && endBound.getTime() - bookableStart.getTime() >= minMs) {
      windows.push({ start: bookableStart, end: endBound })
    }
  }

  return windows
}

export function RoomScheduleSheet({
  open,
  onOpenChange,
  roomId,
  roomName,
  durationMin,
  onSelect,
}: RoomScheduleSheetProps) {
  const [slots, setSlots] = useState<SlotBlock[]>([])
  const [loading, setLoading] = useState(false)
  const sb = createClient()

  useEffect(() => {
    if (!open || !roomId) return
    let cancelled = false

    setLoading(true)
    const now = new Date()
    const rangeStart = dayStart(now)
    const rangeEnd = dayEnd(new Date(now.getTime() + 2 * 86_400_000))

    sb.from('slots')
      .select('id, type, topic, start_at, end_at, status')
      .eq('room_id', roomId)
      .gte('start_at', rangeStart.toISOString())
      .lte('start_at', rangeEnd.toISOString())
      .neq('status', 'cancelled')
      .order('start_at')
      .then(({ data }) => {
        if (!cancelled) {
          setSlots((data as SlotBlock[]) ?? [])
          setLoading(false)
        }
      })

    return () => { cancelled = true }
  }, [open, roomId]) // eslint-disable-line react-hooks/exhaustive-deps

  const now = new Date()
  const days = [now, new Date(now.getTime() + 86_400_000), new Date(now.getTime() + 2 * 86_400_000)]

  function handlePick(win: FreeWindow) {
    onSelect(win.start)
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[80dvh] rounded-t-2xl px-0 pb-0">
        <SheetHeader className="px-4 pt-2 pb-3 border-b border-border/50">
          <SheetTitle className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            {roomName} — next 3 days
          </SheetTitle>
          <p className="text-xs text-muted-foreground -mt-1">
            {durationMin}m slots · tap a free window to book it
          </p>
        </SheetHeader>

        <div className="overflow-y-auto pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading schedule…
            </div>
          ) : (
            days.map((dayDate) => {
              const label = dayLabel(dayDate, now)
              const dayS = dayStart(dayDate)
              const dayE = dayEnd(dayDate)

              const daySlots = slots.filter((s) => {
                const t = new Date(s.start_at)
                return t >= dayS && t <= dayE
              }).sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())

              const freeWindows = computeFreeWindows(daySlots, dayDate, durationMin, now)

              return (
                <div key={label} className="border-b border-border/40 last:border-0">
                  <div className="sticky top-0 bg-background/95 backdrop-blur-sm px-4 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                      {label} · {dayDate.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
                    </p>
                  </div>

                  <div className="px-4 pb-3 space-y-1.5">
                    {daySlots.length === 0 && freeWindows.length === 0 && (
                      <p className="py-2 text-xs text-muted-foreground/60 italic">
                        No bookings today — room is free all day
                      </p>
                    )}

                    {/* Render slots and free windows interleaved by time */}
                    {(() => {
                      const items: Array<
                        | { kind: 'slot'; slot: SlotBlock }
                        | { kind: 'free'; win: FreeWindow }
                      > = [
                        ...daySlots.map((s) => ({ kind: 'slot' as const, slot: s })),
                        ...freeWindows.map((w) => ({ kind: 'free' as const, win: w })),
                      ].sort((a, b) => {
                        const ta = a.kind === 'slot' ? new Date(a.slot.start_at) : a.win.start
                        const tb = b.kind === 'slot' ? new Date(b.slot.start_at) : b.win.start
                        return ta.getTime() - tb.getTime()
                      })

                      return items.map((item, i) =>
                        item.kind === 'slot' ? (
                          <div
                            key={item.slot.id}
                            className="flex items-center gap-2 rounded-xl border border-border/50 bg-muted/40 px-3 py-2"
                          >
                            <span className={cn(
                              'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold',
                              item.slot.type === 'GD' ? 'bg-gd-soft text-gd' : 'bg-pi-soft text-pi',
                            )}>
                              {item.slot.type}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="text-[12px] font-medium truncate">{item.slot.topic}</p>
                              <p className="text-[11px] text-muted-foreground">
                                {fmt(new Date(item.slot.start_at))} – {fmt(new Date(item.slot.end_at))}
                              </p>
                            </div>
                            <span className="shrink-0 rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
                              booked
                            </span>
                          </div>
                        ) : (
                          <button
                            key={`free-${i}`}
                            type="button"
                            onClick={() => handlePick(item.win)}
                            className="w-full flex items-center gap-2 rounded-xl border border-gd/30 bg-gd-soft/30 px-3 py-2 text-left transition-colors hover:bg-gd-soft/60"
                          >
                            <Clock className="h-3.5 w-3.5 shrink-0 text-gd" />
                            <div className="min-w-0 flex-1">
                              <p className="text-[12px] font-semibold text-gd">Free window</p>
                              <p className="text-[11px] text-muted-foreground">
                                {fmt(item.win.start)} – {fmt(item.win.end)}
                              </p>
                            </div>
                            <span className="shrink-0 rounded-full bg-gd text-white px-2 py-0.5 text-[10px] font-bold">
                              Book {fmt(item.win.start)}
                            </span>
                          </button>
                        )
                      )
                    })()}

                    {daySlots.length > 0 && freeWindows.length === 0 && (
                      <p className="py-1 text-xs text-muted-foreground/60 italic">
                        No free windows long enough for a {durationMin}m slot
                      </p>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
