import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { BottomNav } from '@/components/nav/bottom-nav'
import { AppHeader } from '@/components/nav/app-header'
import { profileToNavRole } from '@/lib/nav-role'
import { initials, formatSlotTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  ArrowLeft, AlertCircle, CheckCircle2,
  Clock, Star, MessageSquare,
} from 'lucide-react'

interface MenteeFull {
  id: string
  name: string
  email: string
  batch: string | null
  section: string | null
  roll: string | null
  year: string | null
  ug_degree: string | null
  short_bio: string | null
  domain_1: string | null
  domain_2: string | null
  whatsapp: string | null
  phone: string | null
}

interface Junior360Row {
  user_id: string
  slots_joined: number
  slots_attended: number
  no_shows: number
  gd_attended: number
  pi_attended: number
  feedback_count: number
  avg_clarity: number | null
  avg_content: number | null
  avg_confidence: number | null
  avg_structure: number | null
}

interface FeedbackRow {
  id: string
  slot_type: string
  slot_topic: string | null
  slot_start_at: string
  scores: Record<string, number> | null
  tags: string[] | null
  notes: string | null
  judge_name: string
  created_at: string
}

interface TaskAssignmentRow {
  id: string
  status: 'not_started' | 'in_process' | 'completed'
  task_id: string
  tasks: { id: string; title: string; description: string | null; deadline: string | null } | null
}

const STATUS_CONFIG = {
  not_started: { label: 'Not started', icon: Clock, color: 'text-muted-foreground', bg: 'bg-muted' },
  in_process:  { label: 'In progress', icon: Clock, color: 'text-amber-500',         bg: 'bg-amber-50 dark:bg-amber-950/30' },
  completed:   { label: 'Done',        icon: CheckCircle2, color: 'text-success',     bg: 'bg-success/10' },
}

export default async function MenteeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: menteeId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: myProfile } = await supabase
    .from('profiles')
    .select('name, can_host_gd, can_host_pi, is_crisp, is_sac, is_committee')
    .eq('id', user.id)
    .single()

  if (!myProfile) redirect('/onboarding')
  if (!myProfile.is_crisp) redirect('/')

  const [menteeRes, stats360Res, feedbackRes, tasksRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, name, email, batch, section, roll, year, ug_degree, short_bio, domain_1, domain_2, whatsapp, phone')
      .eq('id', menteeId)
      .single(),
    supabase
      .from('junior_profile_360')
      .select('*')
      .eq('user_id', menteeId)
      .single(),
    supabase.rpc('get_mentee_feedback_full', { p_junior_id: menteeId }),
    supabase
      .from('task_assignments')
      .select('id, status, task_id, tasks(id, title, description, deadline)')
      .eq('junior_id', menteeId)
      .order('updated_at', { ascending: false }),
  ])

  if (!menteeRes.data) notFound()
  const mentee = menteeRes.data as MenteeFull
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stats = (stats360Res.data ?? {}) as any as Junior360Row
  const feedback: FeedbackRow[] = (feedbackRes.data ?? []) as FeedbackRow[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const taskAssignments: TaskAssignmentRow[] = ((tasksRes.data ?? []) as any[]).map(a => ({
    ...a,
    tasks: Array.isArray(a.tasks) ? a.tasks[0] ?? null : a.tasks ?? null,
  }))

  const scoreVals = [stats.avg_clarity, stats.avg_content, stats.avg_confidence, stats.avg_structure]
    .filter((v): v is number => v !== null)
  const avgScore = scoreVals.length > 0
    ? Math.round(scoreVals.reduce((a, b) => a + b, 0) / scoreVals.length * 10) / 10
    : null

  const attendancePct = stats.slots_joined > 0
    ? Math.round((stats.slots_attended / stats.slots_joined) * 100)
    : 0

  return (
    <div className="min-h-screen bg-background pb-nav">
      <AppHeader name={myProfile.name} role={profileToNavRole(myProfile)} />

      <div className="mx-auto max-w-md px-4 pt-5 pb-8 space-y-5">
        {/* Back + header */}
        <div className="flex items-center gap-3">
          <Link href="/mentees" className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-secondary transition-colors shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="flex items-center gap-3 min-w-0">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gd-soft text-sm font-bold text-gd">
              {initials(mentee.name)}
            </span>
            <div className="min-w-0">
              <h1 className="text-base font-bold leading-snug truncate">{mentee.name}</h1>
              <p className="text-[11px] text-muted-foreground truncate">
                {[mentee.roll, mentee.section && `§${mentee.section}`, mentee.batch]
                  .filter(Boolean).join(' · ')}
              </p>
            </div>
          </div>
          {stats.no_shows > 0 && (
            <span className="ml-auto flex items-center gap-1 rounded-full bg-destructive/10 text-destructive px-2 py-0.5 text-[10px] font-medium shrink-0">
              <AlertCircle className="h-2.5 w-2.5" />
              {stats.no_shows} no-show{stats.no_shows !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Profile info */}
        <section className="rounded-2xl border bg-card p-4 space-y-2">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Profile</h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-muted-foreground text-[11px]">Email</dt>
            <dd className="truncate text-[12px] font-medium">{mentee.email}</dd>
            {mentee.ug_degree && (<>
              <dt className="text-muted-foreground text-[11px]">UG Degree</dt>
              <dd className="text-[12px] font-medium">{mentee.ug_degree}</dd>
            </>)}
            {(mentee.domain_1 || mentee.domain_2) && (<>
              <dt className="text-muted-foreground text-[11px]">Domains</dt>
              <dd className="text-[12px] font-medium">
                {[mentee.domain_1, mentee.domain_2].filter(Boolean).join(', ')}
              </dd>
            </>)}
            {mentee.short_bio && (<>
              <dt className="text-muted-foreground text-[11px] col-span-2">Short description</dt>
              <dd className="text-[12px] text-foreground/80 col-span-2 leading-snug">{mentee.short_bio}</dd>
            </>)}
          </dl>
        </section>

        {/* 360 stats */}
        <section className="rounded-2xl border bg-card p-4 space-y-3">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">360° Stats</h2>
          <div className="grid grid-cols-4 gap-2 text-center">
            <div>
              <p className="text-xl font-bold text-gd tabular-nums">{stats.gd_attended ?? 0}</p>
              <p className="text-[10px] text-muted-foreground">GDs</p>
            </div>
            <div>
              <p className="text-xl font-bold text-pi tabular-nums">{stats.pi_attended ?? 0}</p>
              <p className="text-[10px] text-muted-foreground">PIs</p>
            </div>
            <div>
              <p className={cn(
                'text-xl font-bold tabular-nums',
                attendancePct >= 80 ? 'text-success' : attendancePct >= 50 ? 'text-amber-500' : 'text-destructive'
              )}>
                {attendancePct}%
              </p>
              <p className="text-[10px] text-muted-foreground">Attended</p>
            </div>
            <div>
              <p className={cn(
                'text-xl font-bold tabular-nums',
                avgScore === null ? 'text-muted-foreground'
                : avgScore >= 4 ? 'text-success' : avgScore >= 3 ? 'text-amber-500' : 'text-destructive'
              )}>
                {avgScore ?? '—'}
              </p>
              <p className="text-[10px] text-muted-foreground">Avg</p>
            </div>
          </div>

          {stats.feedback_count > 0 && (
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { label: 'Clarity',    val: stats.avg_clarity },
                { label: 'Content',    val: stats.avg_content },
                { label: 'Confidence', val: stats.avg_confidence },
                { label: 'Structure',  val: stats.avg_structure },
              ].filter(d => d.val !== null).map(({ label, val }) => (
                <div key={label} className="flex items-center justify-between rounded-lg bg-muted px-2.5 py-1.5">
                  <span className="text-[11px] text-muted-foreground">{label}</span>
                  <span className="text-[12px] font-bold">{val}/5</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Tasks */}
        <section className="rounded-2xl border bg-card p-4 space-y-3">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Tasks <span className="ml-1 font-normal text-foreground/60">({taskAssignments.length})</span>
          </h2>
          {taskAssignments.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">No tasks assigned yet.</p>
          ) : (
            <div className="space-y-2">
              {taskAssignments.map(a => {
                const cfg = STATUS_CONFIG[a.status]
                const Icon = cfg.icon
                return (
                  <div key={a.id} className={cn('rounded-xl px-3 py-2.5 flex items-start gap-2', cfg.bg)}>
                    <Icon className={cn('h-3.5 w-3.5 mt-0.5 shrink-0', cfg.color)} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium leading-snug truncate">
                        {a.tasks?.title ?? '(untitled)'}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={cn('text-[10px] font-medium', cfg.color)}>{cfg.label}</span>
                        {a.tasks?.deadline && (
                          <span className="text-[10px] text-muted-foreground">
                            · Due {new Date(a.tasks.deadline).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* Feedback history */}
        <section className="rounded-2xl border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Feedback history <span className="ml-1 font-normal text-foreground/60">({feedback.length})</span>
            </h2>
          </div>

          {feedback.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <MessageSquare className="h-7 w-7 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No sessions attended yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {feedback.map(fb => {
                const scores = fb.scores ?? {}
                const dimVals = Object.values(scores).filter((v): v is number => typeof v === 'number')
                const fbAvg = dimVals.length > 0
                  ? Math.round(dimVals.reduce((a, b) => a + b, 0) / dimVals.length * 10) / 10
                  : null

                return (
                  <div key={fb.id} className="rounded-xl border border-border/60 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className={cn(
                          'rounded px-1.5 py-0.5 text-[10px] font-bold uppercase',
                          fb.slot_type === 'GD' ? 'bg-gd-soft text-gd' : 'bg-pi-soft text-pi'
                        )}>
                          {fb.slot_type}
                        </span>
                        {fb.slot_topic && (
                          <span className="text-[11px] text-muted-foreground truncate max-w-[140px]">
                            {fb.slot_topic}
                          </span>
                        )}
                      </div>
                      {fbAvg !== null && (
                        <span className="flex items-center gap-0.5 text-[11px] font-bold">
                          <Star className="h-3 w-3 text-amber-400 fill-amber-400" />
                          {fbAvg}
                        </span>
                      )}
                    </div>

                    <p className="text-[11px] text-muted-foreground">
                      {formatSlotTime(fb.slot_start_at)} · by {fb.judge_name}
                    </p>

                    {Object.keys(scores).length > 0 && (
                      <div className="grid grid-cols-2 gap-1">
                        {Object.entries(scores).map(([dim, val]) => typeof val === 'number' && (
                          <div key={dim} className="flex items-center justify-between rounded bg-muted/60 px-2 py-1">
                            <span className="text-[10px] text-muted-foreground capitalize">{dim}</span>
                            <span className="text-[10px] font-bold">{val}/5</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {fb.tags && fb.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {fb.tags.map(tag => (
                          <span key={tag} className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}

                    {fb.notes && (
                      <p className="text-[11px] text-foreground/80 leading-relaxed border-t border-border/60 pt-2">
                        {fb.notes}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>

      <BottomNav
        isSenior={!!(myProfile.can_host_gd || myProfile.can_host_pi)}
        isCrisp={!!myProfile.is_crisp}
        isSac={!!myProfile.is_sac}
        isCommittee={!!myProfile.is_committee}
      />
    </div>
  )
}
