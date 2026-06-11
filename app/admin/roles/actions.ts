'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export interface RoleFlags {
  can_host_gd: boolean
  can_host_pi: boolean
  is_mentor: boolean
  is_crisp_member: boolean
  is_committee: boolean
  is_crisp_admin: boolean
  is_sac: boolean
}

export async function updateUserFlags(
  targetUserId: string,
  flags: Partial<RoleFlags>
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: caller } = await supabase
    .from('profiles')
    .select('is_crisp_admin, is_sac')
    .eq('id', user.id)
    .single()

  if (!caller?.is_crisp_admin && !caller?.is_sac) {
    return { error: 'Forbidden — requires CRISP admin or SAC role' }
  }

  const service = createServiceClient()
  const { error } = await service
    .from('profiles')
    .update(flags)
    .eq('id', targetUserId)

  if (error) return { error: error.message }
  return {}
}

export interface ProfileRow {
  id: string
  name: string
  email: string
  year: string | null
  batch: string | null
  can_host_gd: boolean
  can_host_pi: boolean
  is_mentor: boolean
  is_crisp_member: boolean
  is_committee: boolean
  is_crisp_admin: boolean
  is_sac: boolean
}

export async function listAllProfiles(): Promise<ProfileRow[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data: caller } = await supabase
    .from('profiles')
    .select('is_crisp_admin, is_sac')
    .eq('id', user.id)
    .single()

  if (!caller?.is_crisp_admin && !caller?.is_sac) return []

  const service = createServiceClient()
  const { data } = await service
    .from('profiles')
    .select('id, name, email, year, batch, can_host_gd, can_host_pi, is_mentor, is_crisp_member, is_committee, is_crisp_admin, is_sac')
    .order('year', { ascending: false, nullsFirst: false })
    .order('name')
    .limit(500)

  return (data ?? []) as ProfileRow[]
}
