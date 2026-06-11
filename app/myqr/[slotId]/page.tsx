import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { MyQrClient } from './myqr-client'

interface Props {
  params: Promise<{ slotId: string }>
}

export default async function MyQrPage({ params }: Props) {
  const { slotId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Verify slot exists and is live before rendering
  const { data: slot } = await supabase
    .from('slots')
    .select('id, topic, type, status')
    .eq('id', slotId)
    .single()

  if (!slot || slot.status !== 'live') {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="text-center space-y-2">
          <p className="text-lg font-semibold">Session not active</p>
          <p className="text-sm text-muted-foreground">
            This session hasn&apos;t started yet or has already ended.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <MyQrClient slotId={slotId} slotTopic={slot.topic ?? ''} slotType={slot.type} />
      </div>
    </div>
  )
}
