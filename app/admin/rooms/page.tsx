import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { BottomNav } from '@/components/nav/bottom-nav'
import { AppHeader } from '@/components/nav/app-header'
import { profileToNavRole } from '@/lib/nav-role'
import RoomsClient from './rooms-client'
import { BarChart3, Building2, Users, Users2 } from 'lucide-react'

export default async function RoomsAdminPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const nowIso = new Date().toISOString()
  const [{ data: profile }, { data: rooms }, { data: activeSlots }] = await Promise.all([
    supabase.from('profiles').select('name, is_crisp, is_sac, can_host_gd, can_host_pi, is_committee').eq('id', user.id).single(),
    supabase.from('rooms').select('*').order('name'),
    supabase
      .from('slots')
      .select('id, room_id, type, topic, start_at, end_at, enrolled_count, capacity, host_id, profiles!host_id(name, whatsapp, phone)')
      .in('status', ['open', 'full', 'live'])
      .lte('start_at', nowIso)
      .gte('end_at', nowIso),
  ])

  const canManage = !!(profile?.is_crisp || profile?.is_sac)
  if (!canManage) redirect('/')

  const isSac = !!profile?.is_sac
  const isCrisp = !!profile?.is_crisp
  const isAdmin = !!(profile?.is_crisp || profile?.is_sac)

  return (
    <div className="min-h-screen bg-background pb-nav">
      <AppHeader name={profile?.name ?? ''} role={profileToNavRole(profile ?? {})} />
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div>
          <h1 className="text-xl font-bold">Rooms</h1>
          <p className="text-sm text-muted-foreground">Toggle rooms live/offline and add new venues.</p>
        </div>

        {/* Admin sub-nav: visible to CRISP members (CRISP+SAC combo also shows it) */}
        {isCrisp && (
          <div className="flex gap-2 flex-wrap">
            <span className="flex-1 rounded-xl border bg-card px-3 py-2 text-center text-xs font-medium">
              <Building2 className="h-3.5 w-3.5 inline mr-1" />
              Rooms
            </span>
            <Link href="/admin/stats"
              className="flex-1 rounded-xl border bg-muted px-3 py-2 text-center text-xs font-medium text-muted-foreground hover:bg-card transition-colors">
              <BarChart3 className="h-3.5 w-3.5 inline mr-1" />
              Stats
            </Link>
            <Link href="/mentees"
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
        )}

        <RoomsClient
          initialRooms={rooms ?? []}
          isSac={isSac}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          occupancy={(activeSlots ?? []).reduce<Record<string, any>>((acc, s) => {
            if (s.room_id) {
              const host = Array.isArray(s.profiles) ? s.profiles[0] : s.profiles
              acc[s.room_id] = {
                type: s.type,
                topic: s.topic,
                enrolled: s.enrolled_count,
                capacity: s.capacity,
                host_name: host?.name ?? null,
                host_whatsapp: host?.whatsapp ?? host?.phone ?? null,
                end_at: s.end_at,
              }
            }
            return acc
          }, {})}
        />
      </div>
      <BottomNav isSac={isSac} isCrisp={isCrisp} isSenior={isSac || isCrisp} />
    </div>
  )
}
