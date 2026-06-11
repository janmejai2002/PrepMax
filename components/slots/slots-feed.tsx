'use client'

import { useEffect, useMemo, useState } from 'react'
import { Search, Sparkles, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import dynamic from 'next/dynamic'
import { SlotCard } from './slot-card'

const HostSlotSheet = dynamic(() =>
  import('./host-slot-sheet').then((m) => ({ default: m.HostSlotSheet })),
  { ssr: false }
)
import type {
  FeedSlot,
  HostCapabilities,
  JudgeOption,
  Me,
  RoomOption,
  SlotType,
} from '@/lib/types'

type Filter = 'all' | SlotType
type View = 'discover' | 'mine'

interface SlotsFeedProps {
  initialSlots: FeedSlot[]
  me: Me
  myWhatsapp: string | null
  capabilities: HostCapabilities
  canJoinSlots?: boolean
  rooms: RoomOption[]
  judges: JudgeOption[]
}

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'GD', label: 'GD' },
  { value: 'PI', label: 'PI' },
]

function greeting(): string {
  const h = new Date().getHours()
  if (h < 5) return 'Burning the midnight oil'
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

export function SlotsFeed({
  initialSlots,
  me,
  myWhatsapp,
  capabilities,
  canJoinSlots = true,
  rooms,
  judges,
}: SlotsFeedProps) {
  const [slots, setSlots] = useState<FeedSlot[]>(initialSlots)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [view, setView] = useState<View>('discover')
  const [hostOpen, setHostOpen] = useState(false)

  // canManageRooms is for the /admin/rooms page, not for creating slots.
  // Committee accounts with canManageRooms should NOT see the hosting form here.
  const canHost = capabilities.canHostGd || capabilities.canHostPi

  // Realtime: seat counts + status changes broadcast to every browsing phone
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('slots-feed')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'slots' },
        (payload) => {
          const next = payload.new as Partial<FeedSlot> & { id: string }
          // A slot that leaves the joinable states drops out of the live feed.
          if (next.status === 'cancelled' || next.status === 'completed') {
            setSlots((prev) => prev.filter((s) => s.id !== next.id))
            return
          }
          setSlots((prev) =>
            prev.map((s) =>
              s.id === next.id
                ? {
                    ...s,
                    enrolled_count: next.enrolled_count ?? s.enrolled_count,
                    status: next.status ?? s.status,
                    confirmed_at: next.confirmed_at ?? s.confirmed_at,
                    topic: next.topic ?? s.topic,
                    start_at: next.start_at ?? s.start_at,
                  }
                : s
            )
          )
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const myCount = useMemo(
    () => slots.filter((s) => s.my_enrollment).length,
    [slots]
  )

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return slots.filter((s) => {
      if (view === 'mine' && !s.my_enrollment) return false
      if (filter !== 'all' && s.type !== filter) return false
      if (!q) return true
      return (
        s.topic.toLowerCase().includes(q) ||
        (s.internship ?? '').toLowerCase().includes(q) ||
        s.expert_areas.some((a) => a.toLowerCase().includes(q)) ||
        (s.host?.name ?? '').toLowerCase().includes(q)
      )
    })
  }, [slots, query, filter, view])

  function handleSlotChange(updated: FeedSlot) {
    setSlots((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))
  }

  function handleSlotRemoved(slotId: string) {
    setSlots((prev) => prev.filter((s) => s.id !== slotId))
  }

  function handleSlotCreated(created: FeedSlot) {
    // Keep the feed ordered by start time, newest-relevant first.
    setSlots((prev) =>
      [created, ...prev].sort(
        (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
      )
    )
  }

  const firstName = me.name.split(' ')[0]

  return (
    <div className="mx-auto max-w-md">
      {/* header */}
      <header className="px-4 pt-6 pb-2">
        <p className="text-[13px] text-muted-foreground">{greeting()},</p>
        <h1 className="text-[22px] font-bold tracking-tight">
          {firstName} <span className="align-middle">👋</span>
        </h1>
      </header>

      {/* Discover / My Slots toggle */}
      <div className="px-4 pt-2">
        <div className="flex h-10 items-center gap-1 rounded-full border border-border/70 bg-card p-1">
          {([
            { value: 'discover', label: 'Discover' },
            { value: 'mine', label: 'My Slots' },
          ] as const).map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setView(value)}
              className={cn(
                'flex h-full flex-1 items-center justify-center gap-1.5 rounded-full text-[13px] font-semibold transition-all',
                view === value
                  ? 'bg-secondary text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {label}
              {value === 'mine' && myCount > 0 && (
                <span
                  className={cn(
                    'flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold tabular-nums',
                    view === 'mine'
                      ? 'bg-gd text-white'
                      : 'bg-muted text-muted-foreground'
                  )}
                >
                  {myCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* search + filter — sticky while scrolling the feed */}
      <div className="sticky top-0 z-40 space-y-3 bg-background/85 px-4 py-3 backdrop-blur-xl">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search topics, companies, seniors…"
            className="h-11 w-full rounded-full border border-border/70 bg-card pl-10 pr-4 text-sm outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-ring"
          />
        </div>

        <div className="flex h-10 items-center gap-1 rounded-full border border-border/70 bg-card p-1">
          {FILTERS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              className={cn(
                'h-full flex-1 rounded-full text-[13px] font-semibold transition-all',
                filter === value
                  ? value === 'GD'
                    ? 'bg-gd-soft text-gd'
                    : value === 'PI'
                      ? 'bg-pi-soft text-pi'
                      : 'bg-secondary text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* feed */}
      <main className="space-y-3 px-4 pt-1">
        {visible.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gd-soft">
              <Sparkles className="h-5 w-5 text-gd" />
            </span>
            <p className="text-sm font-medium">
              {view === 'mine' && !query && filter === 'all'
                ? "You haven't joined any slots yet"
                : query || filter !== 'all'
                  ? 'Nothing matches that — try widening the search.'
                  : 'No slots yet'}
            </p>
            <p className="max-w-60 text-xs leading-relaxed text-muted-foreground">
              {view === 'mine' && !query && filter === 'all'
                ? 'Slots you join or waitlist for will show up here.'
                : query || filter !== 'all'
                  ? 'New slots drop through the day.'
                  : 'Seniors usually post around evenings. Check back after dinner 👀'}
            </p>
          </div>
        ) : (
          visible.map((slot) => (
            <SlotCard
              key={slot.id}
              slot={slot}
              me={me}
              canManage={capabilities.canManageRooms}
              canJoin={canJoinSlots}
              onSlotChange={handleSlotChange}
              onSlotRemoved={handleSlotRemoved}
            />
          ))
        )}
      </main>

      {/* Host a slot — capable seniors only */}
      {canHost && (
        <>
          <button
            onClick={() => setHostOpen(true)}
            className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] left-1/2 z-40 flex h-12 -translate-x-1/2 items-center gap-2 rounded-full bg-foreground px-5 text-sm font-semibold text-background shadow-lg shadow-black/25 transition-transform active:scale-95"
            aria-label="Host a slot"
          >
            <Plus className="h-4.5 w-4.5" />
            Host a slot
          </button>
          <HostSlotSheet
            open={hostOpen}
            onOpenChange={setHostOpen}
            me={me}
            myWhatsapp={myWhatsapp}
            capabilities={capabilities}
            rooms={rooms}
            judges={judges}
            onCreated={handleSlotCreated}
          />
        </>
      )}
    </div>
  )
}
