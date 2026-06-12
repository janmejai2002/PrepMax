import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { BottomNav } from '@/components/nav/bottom-nav'
import { AppHeader } from '@/components/nav/app-header'
import { profileToNavRole } from '@/lib/nav-role'
import { CrispNetClient } from './crisp-net-client'
import type { FeedbackRow, TaskRow } from './crisp-net-client'

export default async function CrispNetPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { tab: tabParam } = await searchParams

  const [{ data: profile }, feedbackRes, tasksRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('name, year, can_host_gd, can_host_pi, is_crisp, is_sac, is_committee')
      .eq('id', user.id)
      .single(),
    supabase.rpc('get_my_feedback_anon'),
    supabase
      .from('task_assignments')
      .select('id, status, task_id, tasks(id, title, description, deadline)')
      .eq('junior_id', user.id)
      .order('updated_at', { ascending: false }),
  ])

  if (!profile) redirect('/onboarding')

  const isSenior = !!(profile.can_host_gd || profile.can_host_pi)
  const hasSeniorCapability = isSenior || !!profile.is_crisp || !!profile.is_sac || !!profile.is_committee

  // Only juniors use CRISPNet; seniors get redirected
  if (hasSeniorCapability) redirect('/')

  const feedback: FeedbackRow[] = (feedbackRes.data ?? []) as FeedbackRow[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tasks: TaskRow[] = ((tasksRes.data ?? []) as any[]).map((a) => {
    const t = Array.isArray(a.tasks) ? a.tasks[0] : a.tasks
    return {
      id:            t?.id ?? a.task_id,
      title:         t?.title ?? '',
      description:   t?.description ?? null,
      deadline:      t?.deadline ?? '',
      assignment_id: a.id,
      status:        a.status as TaskRow['status'],
    }
  }).filter((t: TaskRow) => t.title)

  const defaultTab = tabParam === 'tasks' ? 'tasks' : 'feedback'

  return (
    <div className="min-h-screen bg-background pb-nav">
      <AppHeader name={profile.name} role={profileToNavRole(profile)} />
      <CrispNetClient
        initialFeedback={feedback}
        initialTasks={tasks}
        defaultTab={defaultTab}
      />
      <BottomNav isSenior={false} />
    </div>
  )
}
