import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SlotsFeed } from '@/components/slots/slots-feed'
import { BottomNav } from '@/components/nav/bottom-nav'
import { AppHeader } from '@/components/nav/app-header'
import { profileToNavRole } from '@/lib/nav-role'
import type { FeedSlot, HostCapabilities, RoomOption, JudgeOption } from '@/lib/types'

export default async function HomePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Fire all queries in a single round trip — rooms/judges are lightweight and
  // always fetched so seniors don't pay a second serial hop.
  const nowIso = new Date().toISOString()
  const [profileRes, slotsRes, hostsRes, enrollRes, roomsRes, judgesRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('name, whatsapp, year, can_host_gd, can_host_pi, is_crisp, is_sac, is_committee, domain_1, domain_2')
      .eq('id', user.id)
      .single(),
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
    supabase.from('room_status').select('id, name, location, status').order('name'),
    supabase.from('host_directory').select('id, name').order('name'),
  ])

  const profile = profileRes.data
  if (!profile) redirect('/onboarding')

  const isSenior = !!(profile.can_host_gd || profile.can_host_pi)
  const isCrisp = !!profile.is_crisp

  // Juniors (no senior capability) land on /ask — the slot feed is for seniors only
  if (!isSenior && !isCrisp && !profile.is_sac && !profile.is_committee) {
    redirect('/ask')
  }

  const capabilities: HostCapabilities = {
    canHostGd: !!profile.can_host_gd,
    canHostPi: !!profile.can_host_pi,
    canManageRooms: isCrisp || !!profile.is_sac,
  }

  const canCreateSlot = capabilities.canHostGd || capabilities.canHostPi
  const rooms: RoomOption[] = canCreateSlot ? ((roomsRes.data ?? []) as RoomOption[]) : []
  const judges: JudgeOption[] = canCreateSlot
    ? ((judgesRes.data ?? []).filter((j) => j.id !== user.id) as JudgeOption[])
    : []

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
      <AppHeader name={profile.name} role={profileToNavRole(profile)} />
      <SlotsFeed
        initialSlots={slots}
        me={{ id: user.id, name: profile.name, isSenior }}
        myWhatsapp={profile.whatsapp ?? null}
        capabilities={capabilities}
        canJoinSlots={!isSenior}
        rooms={rooms}
        judges={judges}
        hasDomains={!!(profile.domain_1 || profile.domain_2) || isCrisp || !!profile.is_sac}
      />
      <BottomNav
        isSenior={isSenior}
        isSac={!!profile.is_sac}
        isCrisp={isCrisp}
        isCommittee={!!profile.is_committee}
      />
    </div>
  )
}
