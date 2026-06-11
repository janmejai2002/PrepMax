import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { CheckinClient } from './checkin-client'

interface Props {
  searchParams: Promise<{ s?: string; t?: string }>
}

export default async function CheckinPage({ searchParams }: Props) {
  const { s: slotId, t: token } = await searchParams

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Self-check-in is disabled (migration 019). Redirect to personal QR page.
  if (slotId) redirect(`/myqr/${slotId}`)

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <CheckinClient slotId="" />
      </div>
    </div>
  )
}
