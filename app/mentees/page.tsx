import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { BottomNav } from '@/components/nav/bottom-nav'
import { AppHeader } from '@/components/nav/app-header'
import { profileToNavRole } from '@/lib/nav-role'
import Link from 'next/link'
import { Users } from 'lucide-react'

export default async function MenteesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('name, can_host_gd, can_host_pi, is_crisp, is_sac, is_committee')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/onboarding')
  if (!profile.is_crisp) redirect('/')

  const { data: mentees } = await supabase
    .from('profiles')
    .select('id, name, year, batch, roll')
    .eq('mentor_id', user.id)
    .order('name')

  return (
    <div className="min-h-screen bg-background pb-nav">
      <AppHeader name={profile.name} role={profileToNavRole(profile)} />

      {/* Admin sub-nav */}
      <div className="flex gap-3 px-4 pt-4 pb-2 text-xs font-medium text-muted-foreground border-b border-border/60">
        <Link href="/admin/stats" className="hover:text-foreground transition-colors">Stats</Link>
        <span>·</span>
        <Link href="/admin/rooms" className="hover:text-foreground transition-colors">Rooms</Link>
        <span>·</span>
        <Link href="/admin/roles" className="hover:text-foreground transition-colors">Roles</Link>
      </div>

      <div className="mx-auto max-w-md px-4 pt-6">
        <h1 className="text-xl font-bold mb-1">Mentees</h1>
        <p className="text-sm text-muted-foreground mb-5">
          {(mentees?.length ?? 0)} junior{(mentees?.length ?? 0) !== 1 ? 's' : ''} assigned to you.
        </p>

        {!mentees || mentees.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground">
            <Users className="mx-auto h-10 w-10 mb-3 opacity-30" />
            <p className="font-medium">No mentees yet</p>
            <p className="text-sm mt-1">Use Role Management to assign juniors to yourself.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {mentees.map(m => (
              <Link
                key={m.id}
                href={`/mentees/${m.id}`}
                className="flex items-center justify-between rounded-2xl border bg-card px-4 py-3 hover:bg-secondary/50 transition-colors"
              >
                <div>
                  <p className="text-sm font-semibold">{m.name}</p>
                  <p className="text-xs text-muted-foreground">{m.roll} · {m.batch}</p>
                </div>
                <span className="text-xs text-muted-foreground">View →</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      <BottomNav
        isSenior={!!(profile.can_host_gd || profile.can_host_pi)}
        isCrisp={!!profile.is_crisp}
        isSac={!!profile.is_sac}
        isCommittee={!!profile.is_committee}
      />
    </div>
  )
}
