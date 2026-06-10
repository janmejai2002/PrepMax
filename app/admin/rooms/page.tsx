import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import RoomsClient from './rooms-client'

export default async function RoomsAdminPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_crisp_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_crisp_admin) redirect('/')

  const { data: rooms } = await supabase
    .from('rooms')
    .select('*')
    .order('name')

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div>
          <h1 className="text-xl font-bold">Rooms</h1>
          <p className="text-sm text-muted-foreground">
            Toggle rooms live/offline and add new venues.
          </p>
        </div>
        <RoomsClient initialRooms={rooms ?? []} />
      </div>
    </div>
  )
}
