import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { BottomNav } from '@/components/nav/bottom-nav'
import { AppHeader, profileToNavRole } from '@/components/nav/app-header'
import { RoomNowClient } from './room-now-client'
import {
  BarChart3, CheckCircle2, XCircle, Users, Radio,
  Activity, Building2, Users2
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface DailyStats {
  total_slots: number
  completed_slots: number
  cancelled_slots: number
  live_slots: number
  total_attendees: number
  total_no_shows: number
  active_hosts: number
}

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

function StatCard({ icon, label, value, sub, accent }: {
  icon: React.ReactNode
  label: string
  value: number
  sub?: string
  accent?: string
}) {
  return (
    <div className="rounded-2xl border bg-card p-3 flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span className="text-[11px] font-medium">{label}</span>
      </div>
      <p className={cn('text-2xl font-bold tabular-nums', accent)}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  )
}

export default async function AdminStatsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: profile }, { data: statsData }, { data: roomsData }] = await Promise.all([
    supabase.from('profiles').select('name, is_crisp, is_sac').eq('id', user.id).single(),
    supabase.from('daily_stats').select('*').single(),
    supabase.from('room_now').select('*').order('room_name'),
  ])

  if (!profile?.is_crisp && !profile?.is_sac) redirect('/')

  const stats = statsData as DailyStats | null
  const rooms: RoomNowRow[] = (roomsData ?? []) as RoomNowRow[]

  const today = new Date().toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long',
    timeZone: 'Asia/Kolkata',
  })

  return (
    <div className="min-h-screen bg-background pb-nav">
      <AppHeader name={profile?.name ?? ''} role={profileToNavRole(profile ?? {})} />
      <div className="mx-auto max-w-md px-4 pt-6 space-y-6">
        {/* Header */}
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <BarChart3 className="h-5 w-5 text-gd" />
            <h1 className="text-lg font-bold">CRISP Dashboard</h1>
          </div>
          <p className="text-[11px] text-muted-foreground">{today}</p>
        </div>

        {/* Admin nav tabs */}
        <div className="flex gap-2 flex-wrap">
          <Link href="/admin/rooms"
            className="flex-1 rounded-xl border bg-muted px-3 py-2 text-center text-xs font-medium text-muted-foreground hover:bg-card transition-colors">
            <Building2 className="h-3.5 w-3.5 inline mr-1" />
            Rooms
          </Link>
          <span className="flex-1 rounded-xl border bg-card px-3 py-2 text-center text-xs font-medium">
            <BarChart3 className="h-3.5 w-3.5 inline mr-1" />
            Stats
          </span>
          <Link href="/mentor"
            className="flex-1 rounded-xl border bg-muted px-3 py-2 text-center text-xs font-medium text-muted-foreground hover:bg-card transition-colors">
            <Users className="h-3.5 w-3.5 inline mr-1" />
            Juniors
          </Link>
          <Link href="/admin/roles"
            className="flex-1 rounded-xl border bg-muted px-3 py-2 text-center text-xs font-medium text-muted-foreground hover:bg-card transition-colors">
            <Users2 className="h-3.5 w-3.5 inline mr-1" />
            Roles
          </Link>
        </div>

        {/* Today's stats */}
        {stats ? (
          <div>
            <h2 className="text-sm font-semibold mb-3">Today's activity</h2>
            <div className="grid grid-cols-2 gap-2">
              <StatCard
                icon={<Activity className="h-3.5 w-3.5" />}
                label="Total sessions"
                value={stats.total_slots}
              />
              <StatCard
                icon={<Radio className="h-3.5 w-3.5" />}
                label="Live now"
                value={stats.live_slots}
                accent={stats.live_slots > 0 ? 'text-success' : undefined}
              />
              <StatCard
                icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                label="Completed"
                value={stats.completed_slots}
                accent="text-gd"
              />
              <StatCard
                icon={<XCircle className="h-3.5 w-3.5" />}
                label="Cancelled"
                value={stats.cancelled_slots}
                accent={stats.cancelled_slots > 0 ? 'text-destructive' : undefined}
              />
              <StatCard
                icon={<Users className="h-3.5 w-3.5" />}
                label="Attendees"
                value={stats.total_attendees}
              />
              <StatCard
                icon={<XCircle className="h-3.5 w-3.5" />}
                label="No-shows"
                value={stats.total_no_shows}
                accent={stats.total_no_shows > 0 ? 'text-amber-500' : undefined}
              />
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No data for today.</p>
        )}

        {/* Room-Now board */}
        <div>
          <h2 className="text-sm font-semibold mb-3">Room-Now</h2>
          <RoomNowClient initialRooms={rooms} />
        </div>
      </div>
      <BottomNav isAdmin isCrisp />
    </div>
  )
}
