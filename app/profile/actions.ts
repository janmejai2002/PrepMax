'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function updateProfile(data: {
  ug_degree: string
  bio: string
  domain_1: string
  domain_2: string
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { error } = await supabase
    .from('profiles')
    .update({
      ug_degree: data.ug_degree.trim() || null,
      bio:       data.bio.trim()       || null,
      domain_1:  data.domain_1         || null,
      domain_2:  data.domain_2         || null,
    })
    .eq('id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/profile')
  return { ok: true }
}
