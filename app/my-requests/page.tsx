import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { BottomNav } from '@/components/nav/bottom-nav'
import { AppHeader } from '@/components/nav/app-header'
import { profileToNavRole } from '@/lib/nav-role'
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

  const isSenior = !!(profile.can_host_gd || profile.can_host_pi)
  const hasSeniorCapability = isSenior || !!profile.is_crisp || !!profile.is_sac

  // Senior-capability users browse /requests (the anonymous feed); juniors stay here
  if (hasSeniorCapability) redirect('/requests')
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
