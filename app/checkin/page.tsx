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

  if (!slotId || !token) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="text-center space-y-2">
          <p className="text-lg font-semibold">Invalid QR code</p>
          <p className="text-sm text-muted-foreground">Ask your host to show you the current QR.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <CheckinClient slotId={slotId} token={token} />
      </div>
    </div>
  )
}
