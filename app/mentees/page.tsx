import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { BottomNav } from '@/components/nav/bottom-nav'
import { AppHeader } from '@/components/nav/app-header'
import { profileToNavRole } from '@/lib/nav-role'
import { initials } from '@/lib/format'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { Users, AlertCircle } from 'lucide-react'

interface Junior360Row {
  user_id: string
  name: string
  email: string
  batch: string | null
  section: string | null
  roll: string | null
  mentor_id: string | null
  gd_attended: number
  pi_attended: number
  feedback_count: number
  no_shows: number
  avg_clarity: number | null
  avg_content: number | null
  avg_confidence: number | null
  avg_structure: number | null
}

function avgScore(row: Junior360Row): number | null {
  const vals = [row.avg_clarity, row.avg_content, row.avg_confidence, row.avg_structure]
    .filter((v): v is number => v !== null)
  return vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 10) / 10 : null
}

export default async function MenteesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: profile }, { data: allJuniors }] = await Promise.all([
    supabase
      .from('profiles')
      .select('name, can_host_gd, can_host_pi, is_crisp, is_sac, is_committee')
      .eq('id', user.id)
      .single(),
    supabase
      .from('junior_profile_360')
      .select('*')
      .order('name')
      .limit(200),
  ])

  if (!profile) redirect('/onboarding')
  if (!profile.is_crisp) redirect('/')

  const mentees = ((allJuniors ?? []) as Junior360Row[]).filter(
    jr => jr.mentor_id === user.id
  )

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
        <h1 className="text-xl font-bold mb-1">My Mentees</h1>
        <p className="text-sm text-muted-foreground mb-5">
          {mentees.length} junior{mentees.length !== 1 ? 's' : ''} assigned to you
        </p>

        {mentees.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground">
            <Users className="mx-auto h-10 w-10 mb-3 opacity-30" />
            <p className="font-medium">No mentees yet</p>
            <p className="text-sm mt-1">Go to Roles to assign juniors to yourself.</p>
            <Link href="/admin/roles" className="mt-3 inline-block text-sm underline">
              Open Role Management →
            </Link>
          </div>
        ) : (
          <div className="space-y-3 pb-6">
            {mentees.map(jr => {
              const avg = avgScore(jr)
              return (
                <Link
                  key={jr.user_id}
                  href={`/mentees/${jr.user_id}`}
                  className="block rounded-2xl border bg-card p-4 hover:bg-secondary/50 transition-colors"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gd-soft text-sm font-bold text-gd">
                      {initials(jr.name)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold leading-snug truncate">{jr.name}</p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {jr.roll ?? ''}{jr.section ? ` · §${jr.section}` : ''}{jr.batch ? ` · ${jr.batch}` : ''}
                      </p>
                    </div>
                    {jr.no_shows > 0 && (
                      <span className="flex items-center gap-1 rounded-full bg-destructive/10 text-destructive px-2 py-0.5 text-[10px] font-medium shrink-0">
                        <AlertCircle className="h-2.5 w-2.5" />
                        {jr.no_shows}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div>
                      <p className="text-base font-bold text-gd tabular-nums">{jr.gd_attended}</p>
                      <p className="text-[10px] text-muted-foreground">GDs</p>
                    </div>
                    <div>
                      <p className="text-base font-bold text-pi tabular-nums">{jr.pi_attended}</p>
                      <p className="text-[10px] text-muted-foreground">PIs</p>
                    </div>
                    <div>
                      <p className="text-base font-bold tabular-nums">{jr.feedback_count}</p>
                      <p className="text-[10px] text-muted-foreground">Reviews</p>
                    </div>
                    <div>
                      <p className={cn(
                        'text-base font-bold tabular-nums',
                        avg === null ? 'text-muted-foreground'
                        : avg >= 4  ? 'text-success'
                        : avg >= 3  ? 'text-amber-500'
                        :              'text-destructive'
                      )}>
                        {avg !== null ? avg : '—'}
                      </p>
                      <p className="text-[10px] text-muted-foreground">Avg</p>
                    </div>
                  </div>
                </Link>
              )
            })}
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
