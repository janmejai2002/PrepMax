'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { AppNotification } from '@/lib/types'

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export function NotificationBell() {
  const router = useRouter()
  const sb = createClient()
  const [userId, setUserId] = useState<string | null>(null)
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [open, setOpen] = useState(false)
  const channelRef = useRef<ReturnType<typeof sb.channel> | null>(null)

  const unreadCount = notifications.filter((n) => !n.read_at).length

  // Load user + initial notifications
  useEffect(() => {
    let cancelled = false

    async function init() {
      const { data: { user } } = await sb.auth.getUser()
      if (!user || cancelled) return
      setUserId(user.id)

      const { data } = await sb.rpc('get_my_notifications')
      if (!cancelled && Array.isArray(data)) {
        setNotifications(data as AppNotification[])
      }
    }

    init()
    return () => { cancelled = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Realtime subscription for new notifications
  useEffect(() => {
    if (!userId) return

    const ch = sb
      .channel(`notif-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          setNotifications((prev) => [payload.new as AppNotification, ...prev])
        }
      )
      .subscribe()

    channelRef.current = ch
    return () => {
      sb.removeChannel(ch)
    }
  }, [userId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function markRead(n: AppNotification) {
    if (!n.read_at) {
      await sb.rpc('mark_notification_read', { p_notification_id: n.id })
      setNotifications((prev) =>
        prev.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x))
      )
    }
    if (n.link) {
      setOpen(false)
      router.push(n.link)
    }
  }

  async function markAllRead() {
    await sb.rpc('mark_all_notifications_read')
    setNotifications((prev) =>
      prev.map((x) => ({ ...x, read_at: x.read_at ?? new Date().toISOString() }))
    )
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        className="relative flex h-8 w-8 items-center justify-center rounded-full hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Notifications"
      >
        <Bell className="h-4 w-4 text-muted-foreground" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white leading-none">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </SheetTrigger>

      <SheetContent side="bottom" className="max-h-[75dvh] rounded-t-2xl px-0 pb-0">
        <SheetHeader className="flex-row items-center justify-between px-4 pt-2 pb-0">
          <SheetTitle>Notifications</SheetTitle>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground"
              onClick={markAllRead}
            >
              Mark all read
            </Button>
          )}
        </SheetHeader>

        <div className="overflow-y-auto pb-[env(safe-area-inset-bottom)]">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <Bell className="h-8 w-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No notifications yet</p>
            </div>
          ) : (
            <ul className="divide-y divide-border/40">
              {notifications.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => markRead(n)}
                    className={cn(
                      'w-full px-4 py-3 text-left transition-colors hover:bg-muted/40',
                      !n.read_at && 'bg-gd-soft/30'
                    )}
                  >
                    <div className="flex items-start gap-3">
                      {!n.read_at && (
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-gd" />
                      )}
                      <div className={cn('min-w-0 flex-1', n.read_at && 'pl-5')}>
                        <p className={cn('text-sm leading-snug', !n.read_at && 'font-semibold')}>
                          {n.title}
                        </p>
                        <p className="mt-0.5 text-[12px] text-muted-foreground leading-snug">
                          {n.body}
                        </p>
                        <p className="mt-1 text-[11px] text-muted-foreground/60">
                          {timeAgo(n.created_at)}
                        </p>
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
