'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { Radio, Clock, AlertCircle } from 'lucide-react'

interface RoomNowRow {
  room_id: string
  room_name: string
  location: string | null
  is_live: boolean
  current_slot_id: string | null
  current_type: string | null
  current_topic: string | null
  current_host: string | null
  current_ends_at: string | null
  next_slot_id: string | null
  next_type: string | null
  next_topic: string | null
  next_host: string | null
  next_starts_at: string | null
}

interface Props {
  initialRooms: RoomNowRow[]
}

function fmtTime(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata',
  })
}

function minUntil(iso: string | null): number {
  if (!iso) return Infinity
  return Math.round((new Date(iso).getTime() - Date.now()) / 60_000)
}

export function RoomNowClient({ initialRooms }: Props) {
  const [rooms, setRooms] = useState(initialRooms)
  const supabase = createClient()

  const refresh = useCallback(async () => {
    const { data } = await supabase.from('room_now').select('*').order('room_name')
    if (data) setRooms(data as RoomNowRow[])
  }, [supabase])

  useEffect(() => {
    // Subscribe to slot changes for realtime updates
    const channel = supabase
      .channel('room-now-slots')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'slots' }, refresh)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [supabase, refresh])

  if (rooms.length === 0) {
    return <p className="text-sm text-muted-foreground">No rooms configured.</p>
  }

  return (
    <div className="space-y-2">
      {rooms.map(room => {
        const isLive = !!room.current_slot_id
        const hasNext = !!room.next_slot_id
        const minsLeft = isLive ? minUntil(room.current_ends_at) : Infinity
        const minsUntilNext = hasNext ? minUntil(room.next_starts_at) : Infinity

        return (
          <div key={room.room_id} className={cn(
            'rounded-2xl border p-3 space-y-1.5',
            isLive ? 'border-success/40 bg-success/5' : 'bg-card'
          )}>
            <div className="flex items-center gap-2">
              <span className={cn(
                'flex h-2 w-2 rounded-full shrink-0',
                !room.is_live ? 'bg-muted-foreground/40' :
                isLive ? 'bg-success animate-pulse' : 'bg-muted-foreground/40'
              )} />
              <span className="text-sm font-semibold">{room.room_name}</span>
              {room.location && (
                <span className="text-[10px] text-muted-foreground">{room.location}</span>
              )}
              {!room.is_live && (
                <span className="ml-auto text-[10px] text-muted-foreground rounded-full bg-muted px-2 py-0.5">Offline</span>
              )}
            </div>

            {isLive ? (
              <div className="pl-4 space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <Radio className="h-3 w-3 text-success" />
                  <span className="text-[12px] font-medium text-success">Live</span>
                  <span className="text-[11px] text-muted-foreground">
                    · {room.current_type}: {room.current_topic}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {room.current_host}
                  {minsLeft < 120 ? ` · ends in ${minsLeft}m` : ` · ends ${fmtTime(room.current_ends_at)}`}
                </p>
              </div>
            ) : room.is_live ? (
              <p className="pl-4 text-[11px] text-muted-foreground">Empty</p>
            ) : null}

            {hasNext && (
              <div className={cn(
                'pl-4 flex items-center gap-1.5',
                minsUntilNext <= 30 ? 'text-amber-500' : 'text-muted-foreground'
              )}>
                <Clock className="h-3 w-3 shrink-0" />
                <span className="text-[11px]">
                  Next: {room.next_type}: {room.next_topic} · {room.next_host} · {fmtTime(room.next_starts_at)}
                  {minsUntilNext <= 60 && ` (${minsUntilNext}m)`}
                </span>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
