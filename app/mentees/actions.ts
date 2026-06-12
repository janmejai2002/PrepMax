'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function createTask(formData: {
  title: string
  description: string
  deadline: string
  scope: 'all' | 'specific'
  juniorIds?: string[]
}) {
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('create_task', {
    p_title:       formData.title.trim(),
    p_description: formData.description || null,
    p_deadline:    new Date(formData.deadline).toISOString(),
    p_scope:       formData.scope,
    p_junior_ids:  formData.scope === 'specific' ? formData.juniorIds ?? [] : null,
  })

  if (error) return { error: error.message }
  if (data?.error) return { error: data.error as string }

  revalidatePath('/mentees')
  return { ok: true, taskId: data.task_id as string }
}
