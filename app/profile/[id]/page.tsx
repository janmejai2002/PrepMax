import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { BottomNav } from '@/components/nav/bottom-nav'
import { AppHeader } from '@/components/nav/app-header'
import { profileToNavRole } from '@/lib/nav-role'
import { initials, formatSlotTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { SCORE_DIMS, SCORE_DIM_LABELS } from '@/lib/types'

interface OpenSlot {
  id: string
  type: string
  topic: string
  start_at: string
  capacity: number
  enrolled_count: number
  status: string
}

interface PublicProfile {
  id: string
  name: string
  email: string
  year: 'first' | 'second' | null
  batch: string | null
  section: string | null
  bio: string | null
  // junior fields
  slots_joined?: number
  slots_attended?: number
  gd_attended?: number
  pi_attended?: number
  no_shows?: number
  feedback_count?: number
  avg_clarity?: number | null
  avg_content?: number | null
  avg_confidence?: number | null
  avg_structure?: number | null
  // senior fields
  slots_hosted?: number
  slots_judged?: number
  open_slots?: OpenSlot[]
  // error
  error?: string
}

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: viewer } = await supabase
    .from('profiles')
    .select('name, is_crisp, is_sac, can_host_gd, can_host_pi')
    .eq('id', user.id)
    .single()

  // Own profile → redirect to /profile
  if (id === user.id) redirect('/profile')

  const { data, error } = await supabase.rpc('get_public_profile', {
    p_user_id: id,
  })

  if (error || !data || data.error === 'not_found') notFound()
  if (data.error) redirect('/login')

  const profile = data as PublicProfile
  const isJunior = profile.year === 'first'
  const isSenior = profile.year === 'second'

  const avgScores = [
    { dim: 'clarity',    val: profile.avg_clarity    },
    { dim: 'content',    val: profile.avg_content    },
    { dim: 'confidence', val: profile.avg_confidence },
    { dim: 'structure',  val: profile.avg_structure  },
  ].filter((s) => s.val != null) as { dim: string; val: number }[]

  return (
    <div className="min-h-screen bg-background pb-nav">
      <AppHeader name={viewer?.name ?? ''} role={profileToNavRole(viewer ?? {})} />
      <div className="mx-auto max-w-md px-4 pt-10 space-y-6">

        {/* Header */}
        <div className="flex flex-col items-center gap-3 text-center">
          <span className={cn(
            'flex h-20 w-20 items-center justify-center rounded-full text-xl font-bold',
            isJunior ? 'bg-muted text-muted-foreground' : 'bg-gd-soft text-gd',
          )}>
            {initials(profile.name)}
          </span>
          <div>
            <h1 className="text-xl font-bold">{profile.name}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">{profile.email}</p>
          </div>
          {(profile.batch || profile.section) && (
            <p className="text-xs text-muted-foreground">
              {[profile.batch, profile.section && `Section ${profile.section}`]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}
          <span className={cn(
            'rounded-full px-3 py-1 text-[11px] font-semibold',
            isJunior ? 'bg-muted text-muted-foreground'
              : isSenior ? 'bg-gd-soft text-gd'
              : 'bg-secondary text-secondary-foreground',
          )}>
            {isJunior ? 'Junior' : isSenior ? 'Senior' : 'Committee'}
          </span>
        </div>

        {/* Bio */}
        {profile.bio && (
          <div className="rounded-2xl border bg-card p-4">
            <p className="text-xs font-semibold text-muted-foreground mb-1">About</p>
            <p className="text-sm leading-relaxed">{profile.bio}</p>
          </div>
        )}

        {/* ── Junior section ── */}
        {isJunior && (
          <>
            <div>
              <h2 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wide">
                Practice activity
              </h2>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'Sessions joined',    val: profile.slots_joined    ?? 0 },
                  { label: 'Sessions attended',  val: profile.slots_attended  ?? 0 },
                  { label: 'GD sessions',        val: profile.gd_attended     ?? 0 },
                  { label: 'PI sessions',        val: profile.pi_attended     ?? 0 },
                ].map(({ label, val }) => (
                  <div key={label} className="rounded-2xl border bg-card p-3 text-center">
                    <p className="text-2xl font-bold tabular-nums">{val}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{label}</p>
                  </div>
                ))}
              </div>
            </div>

            {avgScores.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wide">
                  Feedback averages
                </h2>
                <div className="grid grid-cols-2 gap-2">
                  {avgScores.map(({ dim, val }) => (
                    <div key={dim} className="rounded-2xl border bg-card p-3 text-center">
                      <p className="text-2xl font-bold tabular-nums text-gd">{val}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {SCORE_DIM_LABELS[dim as keyof typeof SCORE_DIM_LABELS]}
                      </p>
                    </div>
                  ))}
                </div>
                <p className="mt-1.5 text-right text-[10px] text-muted-foreground/60">
                  based on {profile.feedback_count} session{profile.feedback_count !== 1 ? 's' : ''}
                </p>
              </div>
            )}
          </>
        )}

        {/* ── Senior section ── */}
        {isSenior && (
          <>
            <div>
              <h2 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wide">
                Hosting stats
              </h2>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'Slots hosted',  val: profile.slots_hosted ?? 0 },
                  { label: 'Slots judged',  val: profile.slots_judged ?? 0 },
                ].map(({ label, val }) => (
                  <div key={label} className="rounded-2xl border bg-card p-3 text-center">
                    <p className="text-2xl font-bold tabular-nums">{val}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{label}</p>
                  </div>
                ))}
              </div>
            </div>

            {(profile.open_slots?.length ?? 0) > 0 && (
              <div>
                <h2 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wide">
                  Open slots — join now
                </h2>
                <div className="space-y-2">
                  {profile.open_slots!.map((slot) => (
                    <div
                      key={slot.id}
                      className="rounded-2xl border bg-card p-4 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className={cn(
                            'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold',
                            slot.type === 'GD' ? 'bg-gd-soft text-gd' : 'bg-pi-soft text-pi',
                          )}>
                            {slot.type}
                          </span>
                          <p className="text-sm font-medium truncate">{slot.topic}</p>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          {formatSlotTime(slot.start_at)} ·{' '}
                          {slot.enrolled_count}/{slot.capacity} seats
                        </p>
                      </div>
                      <Link
                        href={`/slots/${slot.id}`}
                        className={cn(
                          'shrink-0 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors',
                          slot.status === 'full'
                            ? 'bg-secondary text-secondary-foreground'
                            : 'bg-gd text-white hover:bg-gd/90',
                        )}
                      >
                        {slot.status === 'full' ? 'Waitlist' : 'Join'}
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

      </div>

      <BottomNav
        isSenior={!!(viewer?.can_host_gd || viewer?.can_host_pi)}
        isCrisp={!!viewer?.is_crisp}
        isSac={!!viewer?.is_sac}
      />
    </div>
  )
}
