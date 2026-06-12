import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { BottomNav } from '@/components/nav/bottom-nav'
import { AppHeader } from '@/components/nav/app-header'
import { profileToNavRole } from '@/lib/nav-role'
import { initials } from '@/lib/format'
import { SignOutButton } from './sign-out-button'
import { cn } from '@/lib/utils'
import type { ReceivedFeedback } from '@/lib/types'
import { SCORE_DIMS, SCORE_DIM_LABELS } from '@/lib/types'

const FLAG_LABELS: [key: string, label: string][] = [
  ['can_host_gd', 'GD Host'],
  ['can_host_pi', 'PI Host'],
  ['is_crisp', 'CRISP'],
  ['is_sac', 'SAC'],
]

export default async function ProfilePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: profile }, { data: feedbackRows }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase
      .from('my_received_feedback')
      .select('*')
      .order('slot_start_at', { ascending: false })
      .limit(20),
  ])

  if (!profile) redirect('/onboarding')

  const mentorRes = profile.mentor_id
    ? await supabase.from('mentor_directory').select('name').eq('id', profile.mentor_id).single()
    : { data: null }
  const mentorName: string | null = mentorRes.data?.name ?? null

  const feedback: ReceivedFeedback[] = (feedbackRows ?? []) as ReceivedFeedback[]

  // Compute average scores across all feedback
  type Avgs = Record<string, number>
  const avgScores: Avgs = {}
  if (feedback.length > 0) {
    const totals: Record<string, number> = {}
    const counts: Record<string, number> = {}
    for (const f of feedback) {
      for (const dim of SCORE_DIMS) {
        const v = f.scores[dim]
        if (v !== undefined) {
          totals[dim] = (totals[dim] ?? 0) + v
          counts[dim] = (counts[dim] ?? 0) + 1
        }
      }
    }
    for (const dim of SCORE_DIMS) {
      if (counts[dim]) avgScores[dim] = Math.round((totals[dim] / counts[dim]) * 10) / 10
    }
  }

  // Tag frequency
  const tagMap: Record<string, number> = {}
  for (const f of feedback) {
    for (const t of f.tags) tagMap[t] = (tagMap[t] ?? 0) + 1
  }
  const topTags = Object.entries(tagMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)

  const flags = FLAG_LABELS.filter(([key]) => profile[key])

  return (
    <div className="min-h-screen bg-background pb-nav">
      <AppHeader name={profile.name} role={profileToNavRole(profile)} />
      <div className="mx-auto max-w-md px-4 pt-10">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex h-20 w-20 items-center justify-center rounded-full bg-gd-soft text-xl font-bold text-gd">
            {initials(profile.name)}
          </span>
          <div>
            <h1 className="text-xl font-bold">{profile.name}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {profile.email}
            </p>
          </div>
          {flags.length > 0 && (
            <div className="flex flex-wrap justify-center gap-1.5">
              {flags.map(([key, label]) => (
                <span
                  key={key}
                  className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-medium"
                >
                  {label}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="mt-8 space-y-px overflow-hidden rounded-2xl border bg-card">
          {[
            ['Year', profile.year === 'first' ? 'First year' : 'Second year'],
            ['Batch', profile.batch],
            ['Section', profile.section],
            ['Roll', profile.roll],
            ['Phone', profile.phone],
            ['WhatsApp', profile.whatsapp],
            ['CRISP Mentor', mentorName],
          ].map(([label, value]) => (
            <div
              key={label}
              className="flex items-center justify-between border-b border-border/60 px-4 py-3 text-sm last:border-0"
            >
              <span className="text-muted-foreground">{label}</span>
              <span className="font-medium">{value || '—'}</span>
            </div>
          ))}
        </div>

        {/* Feedback section */}
        {feedback.length > 0 ? (
          <div className="mt-8 space-y-4">
            <h2 className="text-base font-bold">My Feedback</h2>

            {/* Average score cards */}
            {Object.keys(avgScores).length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                {SCORE_DIMS.filter((d) => avgScores[d] !== undefined).map((dim) => (
                  <div key={dim} className="rounded-2xl border bg-card p-3 text-center">
                    <p className="text-2xl font-bold tabular-nums text-gd">{avgScores[dim]}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{SCORE_DIM_LABELS[dim]}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Top tags */}
            {topTags.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold text-muted-foreground">Recurring themes</p>
                <div className="flex flex-wrap gap-1.5">
                  {topTags.map(([tag, count]) => (
                    <span key={tag}
                      className={cn(
                        'flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium',
                        ['Strong opener','Data-driven','Clear structure','Good listener',
                         'Inclusive','Concise','Confident delivery','Creative ideas'].includes(tag)
                          ? 'bg-success/15 text-success'
                          : 'bg-destructive/10 text-destructive'
                      )}>
                      {tag}
                      <span className="opacity-60">×{count}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Per-session cards */}
            <div className="space-y-3">
              {feedback.map((f) => (
                <div key={f.id} className="rounded-2xl border bg-card p-4 space-y-2">
                  <div className="flex items-start gap-2 justify-between">
                    <div>
                      <p className="text-sm font-semibold leading-snug">{f.slot_topic}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {f.slot_type} · {f.host_name} · {new Date(f.slot_start_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      </p>
                    </div>
                  </div>
                  {Object.keys(f.scores).length > 0 && (
                    <div className="flex gap-2 flex-wrap">
                      {SCORE_DIMS.filter((d) => f.scores[d] !== undefined).map((dim) => (
                        <span key={dim} className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px]">
                          <span className="text-muted-foreground">{SCORE_DIM_LABELS[dim]}</span>
                          <span className="font-bold">{f.scores[dim]}/5</span>
                        </span>
                      ))}
                    </div>
                  )}
                  {f.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {f.tags.map((t) => (
                        <span key={t} className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{t}</span>
                      ))}
                    </div>
                  )}
                  {f.notes && (
                    <p className="text-xs leading-relaxed text-muted-foreground border-t border-border/60 pt-2">{f.notes}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="mt-8 text-center text-[11px] text-muted-foreground/60">
            Feedback from your GD/PI sessions will appear here.
          </p>
        )}

        <div className="mt-6 flex justify-center">
          <SignOutButton />
        </div>
      </div>
      <BottomNav
        isAdmin={!!(profile.is_crisp || profile.is_sac)}
        isSenior={!!(profile.can_host_gd || profile.can_host_pi)}
        isCrisp={!!profile.is_crisp}
        isSac={!!profile.is_sac}
      />
    </div>
  )
}
