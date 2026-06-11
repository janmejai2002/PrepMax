import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { BottomNav } from '@/components/nav/bottom-nav'
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

  const { data: profile } = await supabase
    .from('profiles')
    .select('name, is_crisp_admin, is_sac')
    .eq('id', user.id)
    .single()
  if (!profile) redirect('/onboarding')

  const { data: detail, error } = await supabase.rpc('get_slot_detail', {
    p_slot_id: id,
  })

  if (error || !detail || detail.error) notFound()

  const slot = detail as SlotDetail

  return (
    <div className="min-h-screen bg-background pb-nav">
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
          me={{ id: user.id, name: profile.name }}
        />
      </div>
      <BottomNav isAdmin={!!(profile.is_crisp_admin || profile.is_sac)} isSenior={!!(profile.is_crisp_admin || profile.is_sac)} />
    </div>
  )
}
