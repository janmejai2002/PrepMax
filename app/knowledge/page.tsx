import { redirect } from 'next/navigation'
import { BookOpen } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { BottomNav } from '@/components/nav/bottom-nav'

export default async function KnowledgePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_crisp_admin, is_sac')
    .eq('id', user.id)
    .single()

  return (
    <div className="min-h-screen bg-background pb-nav">
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-6 pt-40 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gd-soft">
          <BookOpen className="h-5 w-5 text-gd" />
        </span>
        <h1 className="text-lg font-bold">Knowledge feed</h1>
        <p className="max-w-64 text-sm leading-relaxed text-muted-foreground">
          Prep content from committees lands here — coming in a later phase.
        </p>
      </div>
      <BottomNav isAdmin={profile?.is_crisp_admin || profile?.is_sac} />
    </div>
  )
}
