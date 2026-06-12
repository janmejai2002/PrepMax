import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { BottomNav } from '@/components/nav/bottom-nav'
import { AppHeader } from '@/components/nav/app-header'
import { profileToNavRole } from '@/lib/nav-role'
import { DoubtsFeedClient } from './doubts-feed-client'
import type { Doubt } from '@/lib/types'

export default async function DoubtsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: profile }, { data: doubts }] = await Promise.all([
    supabase
      .from('profiles')
      .select('name, is_crisp, is_sac, can_host_gd, can_host_pi')
      .eq('id', user.id)
      .single(),
    supabase
      .from('doubts_feed')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  const isCrisp = !!profile?.is_crisp
  const isAdmin = isCrisp || !!profile?.is_sac
  const isSenior = !!(profile?.can_host_gd || profile?.can_host_pi)

  return (
    <div className="min-h-screen bg-background pb-nav">
      <AppHeader name={profile?.name ?? ''} role={profileToNavRole(profile ?? {})} />
      <DoubtsFeedClient initialDoubts={(doubts ?? []) as Doubt[]} myUserId={user.id} />
      <BottomNav isAdmin={isAdmin} isSenior={isSenior} isCrisp={isCrisp} />
    </div>
  )
}
