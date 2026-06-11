import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { BottomNav } from '@/components/nav/bottom-nav'
import { MyRequestsClient } from './my-requests-client'
import type { MySlotRequest } from '@/lib/types'

export default async function MyRequestsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('name, year, can_host_gd, can_host_pi, is_committee, is_crisp_admin, is_sac, is_mentor')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/onboarding')

  const isSenior =
    profile.can_host_gd ||
    profile.can_host_pi ||
    profile.is_committee ||
    profile.is_crisp_admin ||
    profile.is_sac

  // Seniors use the /requests page to browse the anonymous feed
  if (isSenior) redirect('/requests')

  const { data: raw } = await supabase.rpc('get_my_requests')
  const requests: MySlotRequest[] = Array.isArray(raw) ? raw : []

  return (
    <div className="min-h-screen bg-background pb-nav">
      <MyRequestsClient
        initialRequests={requests}
        userName={profile.name}
      />
      <BottomNav
        isAdmin={!!(profile.is_crisp_admin || profile.is_sac)}
        isMentor={!!profile.is_mentor}
        isSenior={false}
      />
    </div>
  )
}
