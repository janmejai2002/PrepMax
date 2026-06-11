import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { BottomNav } from '@/components/nav/bottom-nav'
import { RequestsFeedClient } from './requests-feed-client'
import type { OpenRequest } from '@/lib/types'

export default async function RequestsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('year, can_host_gd, can_host_pi, is_committee, is_crisp_admin, is_sac, is_mentor')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/onboarding')

  const isSenior =
    profile.can_host_gd ||
    profile.can_host_pi ||
    profile.is_committee ||
    profile.is_crisp_admin ||
    profile.is_sac

  // Juniors can't browse the anonymous senior feed — redirect to their own page
  if (!isSenior) redirect('/my-requests')

  const { data: raw } = await supabase.rpc('get_open_requests')
  const requests: OpenRequest[] = Array.isArray(raw) ? raw : []

  return (
    <div className="min-h-screen bg-background pb-nav">
      <RequestsFeedClient initialRequests={requests} />
      <BottomNav
        isAdmin={!!(profile.is_crisp_admin || profile.is_sac)}
        isMentor={!!profile.is_mentor}
        isSenior={isSenior}
      />
    </div>
  )
}
