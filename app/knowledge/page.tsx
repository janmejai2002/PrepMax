import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { BottomNav } from '@/components/nav/bottom-nav'
import { KnowledgeFeedClient } from './knowledge-feed-client'
import type { KnowledgePost } from '@/lib/types'

export default async function KnowledgePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_committee, is_crisp_admin, is_sac')
    .eq('id', user.id)
    .single()

  const { data: posts } = await supabase
    .from('knowledge_posts')
    .select(`
      id, author_id, title, body, tags, function_tag, is_pinned, created_at, updated_at,
      profiles!knowledge_posts_author_id_fkey ( name )
    `)
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(50)

  const typedPosts: KnowledgePost[] = (posts ?? []).map((p: Record<string, unknown>) => ({
    ...(p as Omit<KnowledgePost, 'author_name'>),
    author_name: (p.profiles as { name: string } | null)?.name ?? 'Unknown',
  }))

  const canPost = !!(profile?.is_committee || profile?.is_crisp_admin || profile?.is_sac)
  const isAdmin = !!(profile?.is_crisp_admin || profile?.is_sac)

  return (
    <div className="min-h-screen bg-background pb-nav">
      <KnowledgeFeedClient initialPosts={typedPosts} canPost={canPost} />
      <BottomNav isAdmin={isAdmin} isSenior={!!(profile?.is_committee || profile?.is_crisp_admin || profile?.is_sac)} />
    </div>
  )
}
