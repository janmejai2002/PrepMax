import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import OnboardingForm from './onboarding-form'

export default async function OnboardingPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', user.id)
    .single()

  if (profile) redirect('/')

  const { data: mentors } = await supabase
    .from('mentor_directory')
    .select('id, name, year')
    .order('name')

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Complete your profile</h1>
          <p className="text-sm text-muted-foreground">
            This takes 30 seconds and won&apos;t be asked again.
          </p>
        </div>
        <OnboardingForm
          userId={user.id}
          email={user.email ?? ''}
          mentors={mentors ?? []}
        />
      </div>
    </div>
  )
}
