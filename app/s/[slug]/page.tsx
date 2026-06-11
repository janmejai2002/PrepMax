import { notFound } from 'next/navigation'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'

interface Props {
  params: Promise<{ slug: string }>
}

async function getSlotBySlug(slug: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('slots')
    .select(`
      id, type, topic, description, start_at, end_at, status, capacity, enrolled_count,
      rooms ( name, location ),
      profiles!slots_host_id_fkey ( name )
    `)
    .eq('share_slug', slug)
    .single()
  return data
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const slot = await getSlotBySlug(slug)

  if (!slot) return { title: 'PrepMax' }

  const hostProfile = slot.profiles as unknown as { name: string } | null
  const roomData = slot.rooms as unknown as { name: string; location?: string } | null
  const host = hostProfile?.name ?? 'A senior'
  const room = roomData?.name ?? ''
  const when = new Date(slot.start_at).toLocaleString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata',
  })

  const title = `${slot.type}: ${slot.topic} — PrepMax`
  const description = `${host} is hosting a ${slot.type} practice session on "${slot.topic}". ${when}${room ? ` · ${room}` : ''}. ${slot.capacity - slot.enrolled_count} seat(s) left.`

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      siteName: 'PrepMax',
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
  }
}

export default async function SharePage({ params }: Props) {
  const { slug } = await params
  const slot = await getSlotBySlug(slug)
  if (!slot) notFound()
  // Redirect to the full slot detail page
  redirect(`/slots/${slot.id}`)
}
