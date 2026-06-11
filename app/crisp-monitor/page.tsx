import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { BottomNav } from '@/components/nav/bottom-nav'
import { MenteeMonitorClient } from './mentee-monitor-client'

export default async function MenteeMonitorPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('name, is_crisp')
    .eq('id', user.id)
    .single()

  if (!profile?.is_crisp) redirect('/')

  const { data: result } = await supabase.rpc('get_all_juniors')

  const juniors: Array<{
    id: string
    name: string
    email: string
    batch: string | null
    section: string | null
    mentor_id: string | null
  }> = result?.juniors ?? []

  return (
    <div className="min-h-screen bg-background pb-nav">
      <div className="mx-auto max-w-md px-4 py-8 space-y-4">
        <div>
          <h1 className="text-xl font-bold">Mentee Monitor</h1>
          <p className="text-sm text-muted-foreground">
            View junior profiles and assign mentees.
          </p>
        </div>
        <MenteeMonitorClient
          juniors={juniors}
          myId={user.id}
        />
      </div>
      <BottomNav isSenior isCrisp />
    </div>
  )
}
