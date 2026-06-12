import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { BottomNav } from '@/components/nav/bottom-nav'
import { AppHeader } from '@/components/nav/app-header'
import { profileToNavRole } from '@/lib/nav-role'
import { initials } from '@/lib/format'
import { cn } from '@/lib/utils'
import { UserCheck, TrendingUp, AlertCircle } from 'lucide-react'

interface Junior360Row {
  user_id: string
  name: string
  email: string
  batch: string | null
  section: string | null
  roll: string | null
  mentor_id: string | null
  slots_joined: number
  slots_attended: number
  no_shows: number
  gd_attended: number
  pi_attended: number
  avg_clarity: number | null
  avg_content: number | null
  avg_confidence: number | null
  avg_structure: number | null
  feedback_count: number
}

function AttendancePct({ attended, joined }: { attended: number; joined: number }) {
  const pct = joined > 0 ? Math.round((attended / joined) * 100) : 0
  return (
    <span className={cn(
      'text-[12px] font-bold',
      pct >= 80 ? 'text-success' : pct >= 50 ? 'text-amber-500' : 'text-destructive'
    )}>
      {pct}%
    </span>
  )
}

export default async function MentorPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Fetch profile + full juniors list in parallel; filter by mentor_id in JS for
  // non-SAC CRISP members (avoids a second serial round trip).
  const [{ data: profile }, { data: allJuniors }] = await Promise.all([
    supabase.from('profiles').select('is_crisp, is_sac, name').eq('id', user.id).single(),
    supabase.from('junior_profile_360').select('*').order('name').limit(100),
  ])

  if (!profile?.is_crisp && !profile?.is_sac) redirect('/')

  const rows: Junior360Row[] = ((allJuniors ?? []) as Junior360Row[]).filter(
    (jr) => profile.is_sac || jr.mentor_id === user.id
  )

  const isAdmin = !!(profile.is_crisp || profile.is_sac)

  return (
    <div className="min-h-screen bg-background pb-nav">
      <AppHeader name={profile.name} role={profileToNavRole(profile)} />
      <div className="mx-auto max-w-md px-4 pt-6">
        {/* Header */}
        <div className="flex items-center gap-2 mb-6">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gd-soft">
            <UserCheck className="h-4 w-4 text-gd" />
          </span>
          <div>
            <h1 className="text-lg font-bold">
              {isAdmin ? 'All Juniors' : 'My Mentees'}
            </h1>
            <p className="text-[11px] text-muted-foreground">{rows.length} student{rows.length !== 1 ? 's' : ''}</p>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-20 text-center">
            <UserCheck className="h-8 w-8 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">
              {isAdmin ? 'No first-year profiles yet.' : 'No mentees assigned yet.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3 pb-6">
            {rows.map(jr => {
              const overallAvg = [jr.avg_clarity, jr.avg_content, jr.avg_confidence, jr.avg_structure]
                .filter((v): v is number => v !== null)
              const avg = overallAvg.length > 0
                ? Math.round(overallAvg.reduce((a, b) => a + b, 0) / overallAvg.length * 10) / 10
                : null

              return (
                <div key={jr.user_id} className="rounded-2xl border bg-card p-4 space-y-3">
                  {/* Junior header */}
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gd-soft text-sm font-bold text-gd">
                      {initials(jr.name)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold leading-snug truncate">{jr.name}</p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {jr.section ? `§${jr.section}` : ''} {jr.batch ?? ''}
                      </p>
                    </div>
                    {jr.no_shows > 0 && (
                      <span className="flex items-center gap-1 rounded-full bg-destructive/10 text-destructive px-2 py-0.5 text-[10px] font-medium">
                        <AlertCircle className="h-2.5 w-2.5" />
                        {jr.no_shows} no-show{jr.no_shows !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>

                  {/* Stats grid */}
                  <div className="grid grid-cols-4 gap-2">
                    <div className="text-center">
                      <p className="text-[18px] font-bold tabular-nums text-gd">{jr.gd_attended}</p>
                      <p className="text-[10px] text-muted-foreground">GDs</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[18px] font-bold tabular-nums text-pi">{jr.pi_attended}</p>
                      <p className="text-[10px] text-muted-foreground">PIs</p>
                    </div>
                    <div className="text-center">
                      <AttendancePct attended={jr.slots_attended} joined={jr.slots_joined} />
                      <p className="text-[10px] text-muted-foreground">Attended</p>
                    </div>
                    <div className="text-center">
                      {avg !== null ? (
                        <>
                          <p className="text-[18px] font-bold tabular-nums">
                            <span className={cn(
                              avg >= 4 ? 'text-success' : avg >= 3 ? 'text-amber-500' : 'text-destructive'
                            )}>{avg}</span>
                          </p>
                          <p className="text-[10px] text-muted-foreground">Avg score</p>
                        </>
                      ) : (
                        <>
                          <p className="text-[18px] font-bold tabular-nums text-muted-foreground">—</p>
                          <p className="text-[10px] text-muted-foreground">Avg score</p>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Score dims (show only if feedback exists) */}
                  {jr.feedback_count > 0 && (
                    <div className="grid grid-cols-2 gap-1.5">
                      {[
                        { label: 'Clarity', val: jr.avg_clarity },
                        { label: 'Content', val: jr.avg_content },
                        { label: 'Confidence', val: jr.avg_confidence },
                        { label: 'Structure', val: jr.avg_structure },
                      ].map(({ label, val }) => val !== null && (
                        <div key={label} className="flex items-center justify-between rounded-lg bg-muted px-2.5 py-1.5">
                          <span className="text-[11px] text-muted-foreground">{label}</span>
                          <span className="text-[12px] font-bold">{val}/5</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Contact */}
                  <div className="flex items-center gap-2 pt-1 border-t border-border/60">
                    <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-[11px] text-muted-foreground truncate">{jr.email}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
      <BottomNav isAdmin={isAdmin} isCrisp={!!profile.is_crisp} isSac={!!profile.is_sac} />
    </div>
  )
}
