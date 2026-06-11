'use client'

import { useState } from 'react'
import { BookOpen, Pin, Plus, X, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import type { KnowledgePost } from '@/lib/types'
import { FUNCTION_TAGS } from '@/lib/types'

interface Props {
  initialPosts: KnowledgePost[]
  canPost: boolean
}

const ALL_FILTER = 'All'

export function KnowledgeFeedClient({ initialPosts, canPost }: Props) {
  const [posts, setPosts] = useState(initialPosts)
  const [filter, setFilter] = useState<string>(ALL_FILTER)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)

  // Form state
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [funcTag, setFuncTag] = useState<string>('')
  const [posting, setPosting] = useState(false)
  const [formErr, setFormErr] = useState('')

  const supabase = createClient()

  const filtered = filter === ALL_FILTER
    ? posts
    : posts.filter(p => p.function_tag === filter)

  async function submitPost(e: React.FormEvent) {
    e.preventDefault()
    setFormErr('')
    setPosting(true)
    const { data, error } = await supabase.rpc('create_knowledge_post', {
      p_title: title.trim(),
      p_body: body.trim(),
      p_function_tag: funcTag || null,
      p_tags: [],
      p_is_pinned: false,
    })
    setPosting(false)
    if (error || data?.error) {
      setFormErr(error?.message ?? data?.error ?? 'Failed to post')
      return
    }
    // Reload fresh from server by adding optimistically
    const newPost: KnowledgePost = {
      id: data.id,
      author_id: '',
      title: title.trim(),
      body: body.trim(),
      tags: [],
      function_tag: funcTag || null,
      is_pinned: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      author_name: 'You',
    }
    setPosts([newPost, ...posts])
    setTitle('')
    setBody('')
    setFuncTag('')
    setShowForm(false)
  }

  return (
    <div className="mx-auto max-w-md px-4 pt-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gd-soft">
            <BookOpen className="h-4 w-4 text-gd" />
          </span>
          <h1 className="text-lg font-bold">Knowledge</h1>
        </div>
        {canPost && (
          <Button size="sm" onClick={() => setShowForm(!showForm)} className="gap-1.5">
            <Plus className="h-4 w-4" />
            Post
          </Button>
        )}
      </div>

      {/* New post form */}
      {showForm && (
        <form onSubmit={submitPost} className="mb-4 rounded-2xl border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">New post</p>
            <button type="button" onClick={() => setShowForm(false)}>
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="kp-title">Title</Label>
            <Input id="kp-title" value={title} onChange={e => setTitle(e.target.value)}
              placeholder="e.g. How to structure a GD argument" required maxLength={200} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="kp-body">Content</Label>
            <Textarea id="kp-body" value={body} onChange={e => setBody(e.target.value)}
              placeholder="Share tips, frameworks, or insights…" required rows={5} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="kp-func">Function (optional)</Label>
            <select
              id="kp-func"
              value={funcTag}
              onChange={e => setFuncTag(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">All functions</option>
              {FUNCTION_TAGS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          {formErr && <p className="text-xs text-destructive">{formErr}</p>}
          <Button type="submit" className="w-full" disabled={posting}>
            {posting ? 'Posting…' : 'Publish'}
          </Button>
        </form>
      )}

      {/* Filter chips */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none mb-4">
        {[ALL_FILTER, ...FUNCTION_TAGS].map(tag => (
          <button
            key={tag}
            onClick={() => setFilter(tag)}
            className={cn(
              'shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors',
              filter === tag
                ? 'bg-gd text-white'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            )}
          >
            {tag}
          </button>
        ))}
      </div>

      {/* Feed */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-20 text-center">
          <BookOpen className="h-8 w-8 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">No posts yet for this filter.</p>
        </div>
      ) : (
        <div className="space-y-3 pb-6">
          {filtered.map(post => {
            const expanded = expandedId === post.id
            const preview = post.body.slice(0, 160)
            const needsExpand = post.body.length > 160
            return (
              <article key={post.id} className="rounded-2xl border bg-card p-4 space-y-2">
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {post.is_pinned && <Pin className="h-3 w-3 text-gd shrink-0" />}
                      <h2 className="text-[15px] font-semibold leading-snug">{post.title}</h2>
                    </div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {post.function_tag && (
                        <span className="rounded-full bg-gd-soft text-gd px-2 py-0.5 text-[10px] font-medium">
                          {post.function_tag}
                        </span>
                      )}
                      <span className="text-[11px] text-muted-foreground">
                        {post.author_name} · {new Date(post.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      </span>
                    </div>
                  </div>
                </div>
                <p className="text-sm leading-relaxed text-foreground/80 whitespace-pre-line">
                  {expanded ? post.body : preview}
                  {!expanded && needsExpand && '…'}
                </p>
                {needsExpand && (
                  <button
                    onClick={() => setExpandedId(expanded ? null : post.id)}
                    className="flex items-center gap-1 text-xs text-gd font-medium"
                  >
                    {expanded ? <><ChevronUp className="h-3 w-3" /> Show less</> : <><ChevronDown className="h-3 w-3" /> Read more</>}
                  </button>
                )}
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
