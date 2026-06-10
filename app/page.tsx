import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function HomePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('name, year, is_crisp_admin')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/onboarding')

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 text-center gap-4">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Hey, {profile.name.split(' ')[0]}</h1>
        <p className="text-muted-foreground text-sm">
          Slots will appear here — seniors post around evenings.
        </p>
      </div>
      {profile.is_crisp_admin && (
        <a
          href="/admin/rooms"
          className="text-xs underline underline-offset-2 text-muted-foreground"
        >
          Admin: Manage rooms
        </a>
      )}
    </div>
  )
}
