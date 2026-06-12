import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { BottomNav } from '@/components/nav/bottom-nav'
import { AppHeader } from '@/components/nav/app-header'
import { profileToNavRole } from '@/lib/nav-role'
import { AskClient } from './ask-client'
import type { MySlotRequest, Doubt } from '@/lib/types'

export default async function AskPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { tab: tabParam } = await searchParams

  const [{ data: profile }, requestsRes, doubtsRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('name, year, can_host_gd, can_host_pi, is_crisp, is_sac, is_committee')
      .eq('id', user.id)
      .single(),
    supabase.rpc('get_my_requests'),
    supabase
      .from('doubts_feed')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  if (!profile) redirect('/onboarding')

  const isSenior = !!(profile.can_host_gd || profile.can_host_pi)
  const hasSeniorCapability = isSenior || !!profile.is_crisp || !!profile.is_sac || !!profile.is_committee

  // Seniors use /requests, not /ask
  if (hasSeniorCapability) redirect('/requests')

  const requests: MySlotRequest[] = Array.isArray(requestsRes.data) ? requestsRes.data : []
  const doubts: Doubt[] = (doubtsRes.data ?? []) as Doubt[]
  const defaultTab = tabParam === 'qa' ? 'qa' : 'practice'

  return (
    <div className="min-h-screen bg-background pb-nav">
      <AppHeader name={profile.name} role={profileToNavRole(profile)} />
      <AskClient
        initialRequests={requests}
        initialDoubts={doubts}
        userName={profile.name}
        userId={user.id}
        defaultTab={defaultTab}
      />
      <BottomNav isSenior={false} />
    </div>
  )
}
