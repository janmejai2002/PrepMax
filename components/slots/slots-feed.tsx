'use client'

import { useEffect, useMemo, useState } from 'react'
import { Search, Sparkles } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { SlotCard } from './slot-card'
import type { FeedSlot, Me, SlotType } from '@/lib/types'

type Filter = 'all' | SlotType

interface SlotsFeedProps {
  initialSlots: FeedSlot[]
  me: Me
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

export function SlotsFeed({ initialSlots, me }: SlotsFeedProps) {
  const [slots, setSlots] = useState<FeedSlot[]>(initialSlots)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')

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
          setSlots((prev) =>
            prev.map((s) =>
              s.id === next.id
                ? {
                    ...s,
                    enrolled_count: next.enrolled_count ?? s.enrolled_count,
                    status: next.status ?? s.status,
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

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return slots.filter((s) => {
      if (filter !== 'all' && s.type !== filter) return false
      if (!q) return true
      return (
        s.topic.toLowerCase().includes(q) ||
        (s.internship ?? '').toLowerCase().includes(q) ||
        s.expert_areas.some((a) => a.toLowerCase().includes(q)) ||
        (s.host?.name ?? '').toLowerCase().includes(q)
      )
    })
  }, [slots, query, filter])

  function handleSlotChange(updated: FeedSlot) {
    setSlots((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))
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
              {query || filter !== 'all'
                ? 'Nothing matches that — try widening the search.'
                : 'No slots yet'}
            </p>
            <p className="max-w-60 text-xs leading-relaxed text-muted-foreground">
              {query || filter !== 'all'
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
              onSlotChange={handleSlotChange}
            />
          ))
        )}
      </main>
    </div>
  )
}
