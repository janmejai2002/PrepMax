import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SlotsFeed } from '@/components/slots/slots-feed'
import { BottomNav } from '@/components/nav/bottom-nav'
import type { FeedSlot, HostCapabilities, RoomOption, JudgeOption } from '@/lib/types'

export default async function HomePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('name, whatsapp, year, can_host_gd, can_host_pi, is_crisp_admin, is_sac, is_mentor')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/onboarding')

  const capabilities: HostCapabilities = {
    canHostGd: !!profile.can_host_gd,
    canHostPi: !!profile.can_host_pi,
    canManageRooms: !!profile.is_crisp_admin || !!profile.is_sac,
  }
  const canHost =
    capabilities.canHostGd || capabilities.canHostPi || capabilities.canManageRooms

  // Hosting-only data: rooms to pick from + eligible co-judges. Loaded only when
  // the user can actually post a slot, so juniors pay no extra query cost.
  let rooms: RoomOption[] = []
  let judges: JudgeOption[] = []
  if (canHost) {
    const [roomsRes, judgesRes] = await Promise.all([
      supabase.from('room_status').select('id, name, location, status').order('name'),
      supabase.from('host_directory').select('id, name').order('name'),
    ])
    rooms = (roomsRes.data ?? []) as RoomOption[]
    judges = (judgesRes.data ?? []).filter((j) => j.id !== user.id)
  }

  const nowIso = new Date().toISOString()
  const [slotsRes, hostsRes, enrollRes] = await Promise.all([
    supabase
      .from('slots')
      .select('*, rooms(name, location)')
      .in('status', ['open', 'full', 'live'])
      .gte('end_at', nowIso)
      .order('start_at'),
    supabase.from('host_directory').select('id, name, whatsapp'),
    supabase
      .from('enrollments')
      .select('slot_id, status, position')
      .eq('user_id', user.id),
  ])

  const hosts = new Map((hostsRes.data ?? []).map((h) => [h.id, h]))
  const myEnrollments = new Map(
    (enrollRes.data ?? []).map((e) => [e.slot_id, e])
  )

  const slots: FeedSlot[] = (slotsRes.data ?? []).map((s) => ({
    ...s,
    room: s.rooms ?? null,
    host: hosts.get(s.host_id) ?? null,
    my_enrollment: myEnrollments.get(s.id)
      ? {
          status: myEnrollments.get(s.id)!.status,
          position: myEnrollments.get(s.id)!.position,
        }
      : null,
  }))

  return (
    <div className="min-h-screen bg-background pb-nav">
      <SlotsFeed
        initialSlots={slots}
        me={{ id: user.id, name: profile.name }}
        myWhatsapp={profile.whatsapp ?? null}
        capabilities={capabilities}
        rooms={rooms}
        judges={judges}
      />
      <BottomNav
        isAdmin={!!(profile.is_crisp_admin || profile.is_sac)}
        isMentor={!!profile.is_mentor}
        isSenior={!!(profile.can_host_gd || profile.can_host_pi || profile.is_committee || profile.is_crisp_admin || profile.is_sac)}
      />
    </div>
  )
}
