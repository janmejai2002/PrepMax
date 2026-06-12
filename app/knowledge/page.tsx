import { unstable_cache } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { BottomNav } from '@/components/nav/bottom-nav'
import { AppHeader } from '@/components/nav/app-header'
import { profileToNavRole } from '@/lib/nav-role'
import { KnowledgeFeedClient } from './knowledge-feed-client'
import type { KnowledgePost } from '@/lib/types'

// Knowledge posts are global (same for every user) — cache 60s on the server.
// Invalidated when a new post is created (via revalidateTag in the post action).
const getCachedPosts = unstable_cache(
  async () => {
    try {
      const sb = createServiceClient()
      const { data } = await sb
        .from('knowledge_posts')
        .select(`
          id, author_id, title, body, tags, function_tag, is_pinned, created_at, updated_at,
          profiles!knowledge_posts_author_id_fkey ( name )
        `)
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(50)
      return data ?? []
    } catch {
      return []
    }
  },
  ['knowledge-posts'],
  { revalidate: 60, tags: ['knowledge-posts'] }
)

export default async function KnowledgePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: profile }, posts] = await Promise.all([
    supabase
      .from('profiles')
      .select('name, is_crisp, is_sac')
      .eq('id', user.id)
      .single(),
    getCachedPosts(),
  ])

  const typedPosts: KnowledgePost[] = (posts ?? []).map((p: Record<string, unknown>) => ({
    ...(p as Omit<KnowledgePost, 'author_name'>),
    author_name: (p.profiles as { name: string } | null)?.name ?? 'Unknown',
  }))

  const isCrisp = !!profile?.is_crisp
  const canPost = isCrisp || !!profile?.is_sac
  const isAdmin = isCrisp || !!profile?.is_sac

  return (
    <div className="min-h-screen bg-background pb-nav">
      <AppHeader name={profile?.name ?? ''} role={profileToNavRole(profile ?? {})} />
      <KnowledgeFeedClient initialPosts={typedPosts} canPost={canPost} />
      <BottomNav isAdmin={isAdmin} isCrisp={isCrisp} />
    </div>
  )
}
