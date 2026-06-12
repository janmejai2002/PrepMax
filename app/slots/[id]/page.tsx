import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { BottomNav } from '@/components/nav/bottom-nav'
import { AppHeader } from '@/components/nav/app-header'
import { profileToNavRole } from '@/lib/nav-role'
import { SlotDetailClient } from './slot-detail-client'
import type { SlotDetail } from '@/lib/types'

interface Props {
  params: Promise<{ id: string }>
}

export default async function SlotDetailPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: profile }, { data: detail, error }] = await Promise.all([
    supabase
      .from('profiles')
      .select('name, can_host_gd, can_host_pi, is_crisp, is_sac')
      .eq('id', user.id)
      .single(),
    supabase.rpc('get_slot_detail', { p_slot_id: id }),
  ])

  if (!profile) redirect('/onboarding')
  if (error || !detail || detail.error) notFound()

  const slot = detail as SlotDetail
  const isSenior = !!(profile.can_host_gd || profile.can_host_pi)
  const isCrisp = !!profile.is_crisp

  return (
    <div className="min-h-screen bg-background pb-nav">
      <AppHeader name={profile.name} role={profileToNavRole(profile)} />
      <div className="mx-auto max-w-md">
        {/* Back nav */}
        <div className="px-4 pt-5 pb-2">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back to feed
          </Link>
        </div>

        <SlotDetailClient
          slot={slot}
          me={{ id: user.id, name: profile.name, isSenior }}
        />
      </div>
      <BottomNav
        isAdmin={isCrisp || !!profile.is_sac}
        isSenior={isSenior}
        isSac={!!profile.is_sac}
        isCrisp={isCrisp}
      />
    </div>
  )
}
