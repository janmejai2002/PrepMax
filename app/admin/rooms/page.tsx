import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { BottomNav } from '@/components/nav/bottom-nav'
import RoomsClient from './rooms-client'
import { BarChart3, Building2, Users, Users2 } from 'lucide-react'

export default async function RoomsAdminPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_crisp_admin, is_sac')
    .eq('id', user.id)
    .single()

  // Mirrors can_manage_rooms() in the DB — SAC and CRISP admin both manage rooms
  if (!profile?.is_crisp_admin && !profile?.is_sac) redirect('/')

  const { data: rooms } = await supabase
    .from('rooms')
    .select('*')
    .order('name')

  return (
    <div className="min-h-screen bg-background pb-nav">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div>
          <h1 className="text-xl font-bold">Rooms</h1>
          <p className="text-sm text-muted-foreground">Toggle rooms live/offline and add new venues.</p>
        </div>

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

        <RoomsClient initialRooms={rooms ?? []} isSac={!!profile?.is_sac} />
      </div>
      <BottomNav isAdmin isCommittee />
    </div>
  )
}
