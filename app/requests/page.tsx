import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { BottomNav } from '@/components/nav/bottom-nav'
import { AppHeader } from '@/components/nav/app-header'
import { profileToNavRole } from '@/lib/nav-role'
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
      .select('name, year, can_host_gd, can_host_pi, is_crisp, is_sac, is_committee')
      .eq('id', user.id)
      .single(),
    supabase.rpc('get_open_requests'),
  ])

  if (!profile) redirect('/onboarding')

  const isSenior = !!(profile.can_host_gd || profile.can_host_pi)

  // Capabilities are additive — CRISP/SAC seniors can browse the request feed too.
  // Only pure juniors (no senior host flags) use /my-requests.
  const hasSeniorCapability = isSenior || !!profile.is_crisp || !!profile.is_sac
  if (!hasSeniorCapability) redirect('/my-requests')
  const requests: OpenRequest[] = Array.isArray(raw) ? raw : []

  return (
    <div className="min-h-screen bg-background pb-nav">
      <AppHeader name={profile.name} role={profileToNavRole(profile)} />
      <RequestsFeedClient initialRequests={requests} />
      <BottomNav
        isSenior={isSenior}
        isCrisp={!!profile.is_crisp}
        isSac={!!profile.is_sac}
        isCommittee={!!profile.is_committee}
      />
    </div>
  )
}
