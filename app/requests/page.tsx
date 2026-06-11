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

  const [{ data: profile }, { data: raw }] = await Promise.all([
    supabase
      .from('profiles')
      .select('year, can_host_gd, can_host_pi, is_crisp, is_sac')
      .eq('id', user.id)
      .single(),
    supabase.rpc('get_open_requests'),
  ])

  if (!profile) redirect('/onboarding')

  // CRISP/SAC accounts see only the knowledge/post view
  if (profile.is_crisp || profile.is_sac) redirect('/knowledge')

  const isSenior =
    profile.can_host_gd ||
    profile.can_host_pi

  // Juniors can't browse the anonymous senior feed — redirect to their own page
  if (!isSenior) redirect('/my-requests')
  const requests: OpenRequest[] = Array.isArray(raw) ? raw : []

  return (
    <div className="min-h-screen bg-background pb-nav">
      <RequestsFeedClient initialRequests={requests} />
      <BottomNav
        isSenior={isSenior}
      />
    </div>
  )
}
