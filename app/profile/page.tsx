import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { BottomNav } from '@/components/nav/bottom-nav'
import { initials } from '@/lib/format'
import { SignOutButton } from './sign-out-button'

const FLAG_LABELS: [key: string, label: string][] = [
  ['can_host_gd', 'GD Host'],
  ['can_host_pi', 'PI Host'],
  ['is_mentor', 'Mentor'],
  ['is_committee', 'Committee'],
  ['is_crisp_admin', 'CRISP Admin'],
  ['is_sac', 'SAC'],
]

export default async function ProfilePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/onboarding')

  let mentorName: string | null = null
  if (profile.mentor_id) {
    const { data: mentor } = await supabase
      .from('mentor_directory')
      .select('name')
      .eq('id', profile.mentor_id)
      .single()
    mentorName = mentor?.name ?? null
  }

  const flags = FLAG_LABELS.filter(([key]) => profile[key])

  return (
    <div className="min-h-screen bg-background pb-nav">
      <div className="mx-auto max-w-md px-4 pt-10">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex h-20 w-20 items-center justify-center rounded-full bg-gd-soft text-xl font-bold text-gd">
            {initials(profile.name)}
          </span>
          <div>
            <h1 className="text-xl font-bold">{profile.name}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {profile.email}
            </p>
          </div>
          {flags.length > 0 && (
            <div className="flex flex-wrap justify-center gap-1.5">
              {flags.map(([key, label]) => (
                <span
                  key={key}
                  className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-medium"
                >
                  {label}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="mt-8 space-y-px overflow-hidden rounded-2xl border bg-card">
          {[
            ['Year', profile.year === 'first' ? 'First year' : 'Second year'],
            ['Batch', profile.batch],
            ['Section', profile.section],
            ['Roll', profile.roll],
            ['Phone', profile.phone],
            ['WhatsApp', profile.whatsapp],
            ['CRISP Mentor', mentorName],
          ].map(([label, value]) => (
            <div
              key={label}
              className="flex items-center justify-between border-b border-border/60 px-4 py-3 text-sm last:border-0"
            >
              <span className="text-muted-foreground">{label}</span>
              <span className="font-medium">{value || '—'}</span>
            </div>
          ))}
        </div>

        <div className="mt-6 flex justify-center">
          <SignOutButton />
        </div>

        <p className="mt-8 text-center text-[11px] text-muted-foreground/60">
          Your GD/PI history and feedback will appear here soon.
        </p>
      </div>
      <BottomNav isAdmin={profile.is_crisp_admin || profile.is_sac} />
    </div>
  )
}
