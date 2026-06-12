import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { BottomNav } from '@/components/nav/bottom-nav'
import { AppHeader } from '@/components/nav/app-header'
import { profileToNavRole } from '@/lib/nav-role'
import { RolesClient } from './roles-client'
import type { ProfileRow } from './actions'
import { Users2, Building2, BarChart3, ShieldCheck } from 'lucide-react'

export default async function RolesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  let service: ReturnType<typeof createServiceClient> | null = null
  try { service = createServiceClient() } catch { /* env key missing */ }

  const [{ data: profile }, serviceRes] = await Promise.all([
    supabase.from('profiles').select('name, is_crisp, is_sac').eq('id', user.id).single(),
    service
      ? service.from('profiles')
          .select('id, name, email, year, batch, can_host_gd, can_host_pi, is_crisp, is_sac')
          .order('year', { ascending: false, nullsFirst: false })
          .order('name')
          .limit(500)
      : Promise.resolve({ data: [] }),
  ])
  const rawProfiles = 'data' in serviceRes ? serviceRes.data : []

  if (!profile?.is_crisp && !profile?.is_sac) redirect('/')

  const profiles = (rawProfiles ?? []) as ProfileRow[]

  return (
    <div className="min-h-screen bg-background pb-nav">
      <AppHeader name={profile?.name ?? ''} role={profileToNavRole(profile ?? {})} />
      <div className="mx-auto max-w-md px-4 pt-6 space-y-6">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <ShieldCheck className="h-5 w-5 text-gd" />
            <h1 className="text-lg font-bold">Role Management</h1>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Toggle capability flags per user. Changes take effect immediately.
          </p>
        </div>

        <div className="flex gap-2">
          <Link href="/admin/rooms"
            className="flex-1 rounded-xl border bg-muted px-3 py-2 text-center text-xs font-medium text-muted-foreground hover:bg-card transition-colors">
            <Building2 className="h-3.5 w-3.5 inline mr-1" />
            Rooms
          </Link>
          <Link href="/admin/stats"
            className="flex-1 rounded-xl border bg-muted px-3 py-2 text-center text-xs font-medium text-muted-foreground hover:bg-card transition-colors">
            <BarChart3 className="h-3.5 w-3.5 inline mr-1" />
            Stats
          </Link>
          <span className="flex-1 rounded-xl border bg-card px-3 py-2 text-center text-xs font-medium">
            <Users2 className="h-3.5 w-3.5 inline mr-1" />
            Roles
          </span>
        </div>

        <RolesClient profiles={profiles} />
      </div>
      <BottomNav isAdmin isCrisp={!!profile?.is_crisp} isSac={!!profile?.is_sac} />
    </div>
  )
}
