'use client'

import { useState } from 'react'
import { BookOpen, Pin, Plus, X, ChevronDown, ChevronUp, MessageSquare, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import type { KnowledgePost } from '@/lib/types'
import { FUNCTION_TAGS } from '@/lib/types'

interface ReplyRow {
  id: string
  post_id: string
  parent_id: string | null
  author_id: string
  body: string
  created_at: string
  author_year: string | null
}

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

  // Replies state: postId → replies[]
  const [repliesMap, setRepliesMap] = useState<Record<string, ReplyRow[]>>({})
  const [showRepliesId, setShowRepliesId] = useState<string | null>(null)
  const [replyingToPostId, setReplyingToPostId] = useState<string | null>(null)
  const [replyBody, setReplyBody] = useState('')
  const [submittingReply, setSubmittingReply] = useState(false)
  const [replyError, setReplyError] = useState('')

  // Form state
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [funcTag, setFuncTag] = useState<string>('')
  const [posting, setPosting] = useState(false)
  const [formErr, setFormErr] = useState('')

  const supabase = createClient()

  async function loadReplies(postId: string) {
    if (repliesMap[postId]) return
    const { data } = await supabase.rpc('get_post_replies', { p_post_id: postId })
    setRepliesMap(prev => ({ ...prev, [postId]: (data ?? []) as ReplyRow[] }))
  }

  async function toggleReplies(postId: string) {
    if (showRepliesId === postId) {
      setShowRepliesId(null)
    } else {
      await loadReplies(postId)
      setShowRepliesId(postId)
    }
  }

  async function submitReply(postId: string) {
    setReplyError('')
    if (replyBody.trim().length < 3) { setReplyError('Too short'); return }
    setSubmittingReply(true)
    const { data, error } = await supabase.rpc('add_knowledge_reply', {
      p_post_id: postId,
      p_body: replyBody.trim(),
      p_parent_id: null,
    })
    setSubmittingReply(false)
    if (error || data?.error) {
      setReplyError(data?.error ?? 'Could not post reply')
      return
    }
    const newReply: ReplyRow = {
      id: data.id,
      post_id: postId,
      parent_id: null,
      author_id: '',
      body: replyBody.trim(),
      created_at: new Date().toISOString(),
      author_year: null,
    }
    setRepliesMap(prev => ({
      ...prev,
      [postId]: [...(prev[postId] ?? []), newReply],
    }))
    setReplyBody('')
    setReplyingToPostId(null)
  }

  const filtered = filter === ALL_FILTER
    ? posts
    : posts.filter(p => p.function_tag === filter)

  async function submitPost(e: React.FormEvent) {
    e.preventDefault()
    setFormErr('')
    if (title.trim().length < 3) {
      setFormErr('Title must be at least 3 characters.')
      return
    }
    if (body.trim().length < 10) {
      setFormErr('Content must be at least 10 characters.')
      return
    }
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
      setFormErr('Could not publish post — please try again.')
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
            <p className="text-[10px] text-muted-foreground">min 10 characters · {body.trim().length} typed</p>
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

                {/* Replies footer */}
                <div className="border-t border-border/60 pt-2 flex items-center gap-3">
                  <button
                    onClick={() => toggleReplies(post.id)}
                    className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <MessageSquare className="h-3 w-3" />
                    {repliesMap[post.id]
                      ? `${repliesMap[post.id].length} repl${repliesMap[post.id].length !== 1 ? 'ies' : 'y'}`
                      : 'Replies'
                    }
                  </button>
                  <button
                    onClick={() => {
                      setReplyingToPostId(replyingToPostId === post.id ? null : post.id)
                      if (!showRepliesId || showRepliesId !== post.id) {
                        toggleReplies(post.id)
                      }
                    }}
                    className="flex items-center gap-1 text-[11px] text-gd font-medium hover:opacity-80 transition-opacity"
                  >
                    <Plus className="h-3 w-3" />
                    Reply
                  </button>
                </div>

                {/* Replies list */}
                {showRepliesId === post.id && (
                  <div className="space-y-2 pt-1">
                    {(repliesMap[post.id] ?? []).length === 0 ? (
                      <p className="text-[11px] text-muted-foreground pl-2">No replies yet. Be the first!</p>
                    ) : (
                      (repliesMap[post.id] ?? []).map(reply => (
                        <div key={reply.id} className="rounded-xl bg-muted/60 px-3 py-2 space-y-0.5">
                          <p className="text-[11px] text-muted-foreground">
                            {reply.author_year ? `${reply.author_year} batch` : 'Member'}
                            {' · '}
                            {new Date(reply.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                          </p>
                          <p className="text-sm leading-snug">{reply.body}</p>
                        </div>
                      ))
                    )}

                    {replyingToPostId === post.id && (
                      <div className="flex gap-2 pt-1">
                        <Input
                          value={replyBody}
                          onChange={e => setReplyBody(e.target.value)}
                          placeholder="Write a reply…"
                          maxLength={500}
                          className="flex-1 text-sm h-9"
                          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitReply(post.id) } }}
                        />
                        <Button
                          size="icon"
                          className="h-9 w-9 shrink-0"
                          disabled={submittingReply}
                          onClick={() => submitReply(post.id)}
                        >
                          <Send className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                    {replyError && <p className="text-xs text-destructive">{replyError}</p>}
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
