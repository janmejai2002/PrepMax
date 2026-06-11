'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * SAC-only: broadcast a notification to all CRISP committee members via the outbox.
 * The drain-notifications Edge Function will pick these up and send emails.
 */
export async function notifyCrispMembers(message: string): Promise<{ error?: string; count?: number }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'unauthorized' }

  const { data: caller } = await supabase
    .from('profiles')
    .select('is_sac')
    .eq('id', user.id)
    .single()

  if (!caller?.is_sac) return { error: 'unauthorized' }

  const service = createServiceClient()

  // Notify all CRISP members (excludes the SAC caller themselves)
  const { data: members } = await service
    .from('profiles')
    .select('id, email, name')
    .eq('is_crisp', true)
    .neq('id', user.id)

  if (!members?.length) return { error: 'no_members' }

  const events = members.map(m => ({
    event_type: 'sac_crisp_notify',
    payload: {
      to_user_id: m.id,
      to_email: m.email,
      to_name: m.name,
      message,
      sent_by: user.id,
    },
  }))

  const { error } = await service.from('outbox').insert(events)
  if (error) return { error: error.message }

  return { count: members.length }
}
