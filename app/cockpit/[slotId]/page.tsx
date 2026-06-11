import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { CockpitClient } from './cockpit-client'
import type { SlotDetail } from '@/lib/types'

interface Props {
  params: Promise<{ slotId: string }>
}

export default async function CockpitPage({ params }: Props) {
  const { slotId } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: detail, error } = await supabase.rpc('get_slot_detail', {
    p_slot_id: slotId,
  })

  if (error || !detail || detail.error) notFound()

  const slot = detail as SlotDetail

  // Gate: only host / co-judge / admin can open the cockpit
  if (!slot.is_host && !slot.is_judge && !slot.is_admin) {
    redirect(`/slots/${slotId}`)
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('name')
    .eq('id', user.id)
    .single()

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-md">
        {/* nav */}
        <div className="flex items-center justify-between px-4 pt-5 pb-2">
          <Link
            href={`/slots/${slotId}`}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Slot detail
          </Link>
          <span className="text-xs text-muted-foreground font-medium">Cockpit</span>
        </div>

        <CockpitClient
          slot={slot}
          me={{ id: user.id, name: profile?.name ?? 'Judge' }}
        />
      </div>
    </div>
  )
}
