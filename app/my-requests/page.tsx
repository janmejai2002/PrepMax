import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { BottomNav } from '@/components/nav/bottom-nav'
import { AppHeader, profileToNavRole } from '@/components/nav/app-header'
import { MyRequestsClient } from './my-requests-client'
import type { MySlotRequest } from '@/lib/types'

export default async function MyRequestsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: profile }, { data: raw }] = await Promise.all([
    supabase
      .from('profiles')
      .select('name, year, can_host_gd, can_host_pi, is_crisp, is_sac')
      .eq('id', user.id)
      .single(),
    supabase.rpc('get_my_requests'),
  ])

  if (!profile) redirect('/onboarding')

  // CRISP/SAC accounts see only the knowledge/post view
  if (profile.is_crisp || profile.is_sac) redirect('/knowledge')

  const isSenior =
    profile.can_host_gd ||
    profile.can_host_pi

  // Seniors use the /requests page to browse the anonymous feed
  if (isSenior) redirect('/requests')
  const requests: MySlotRequest[] = Array.isArray(raw) ? raw : []

  return (
    <div className="min-h-screen bg-background pb-nav">
      <AppHeader name={profile.name} role={profileToNavRole(profile)} />
      <MyRequestsClient
        initialRequests={requests}
        userName={profile.name}
      />
      <BottomNav
        isSenior={false}
      />
    </div>
  )
}
