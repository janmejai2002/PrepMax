'use client'

import { useState } from 'react'
import {
  MessageCircleQuestion, ChevronUp, ChevronDown, Check,
  Plus, X, MessageSquare, Loader2
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import type { Doubt, DoubtAnswer } from '@/lib/types'
import { FUNCTION_TAGS } from '@/lib/types'

interface Props {
  initialDoubts: Doubt[]
  myUserId: string
}

const ALL_FILTER = 'All'

export function DoubtsFeedClient({ initialDoubts, myUserId }: Props) {
  const [doubts, setDoubts] = useState(initialDoubts)
  const [filter, setFilter] = useState<string>(ALL_FILTER)
  const [showResolved, setShowResolved] = useState(false)
  const [showAskForm, setShowAskForm] = useState(false)

  // Ask form
  const [question, setQuestion] = useState('')
  const [askFuncTag, setAskFuncTag] = useState('')
  const [asking, setAsking] = useState(false)
  const [askErr, setAskErr] = useState('')

  // Expanded doubt state
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [answers, setAnswers] = useState<Record<string, DoubtAnswer[]>>({})
  const [loadingAnswers, setLoadingAnswers] = useState<Record<string, boolean>>({})
  const [answerText, setAnswerText] = useState<Record<string, string>>({})
  const [submittingAnswer, setSubmittingAnswer] = useState<Record<string, boolean>>({})

  const supabase = createClient()

  const filtered = doubts
    .filter(d => showResolved ? true : !d.is_resolved)
    .filter(d => filter === ALL_FILTER ? true : d.function_tag === filter)

  async function submitQuestion(e: React.FormEvent) {
    e.preventDefault()
    setAskErr('')
    if (question.trim().length < 5) {
      setAskErr('Question must be at least 5 characters.')
      return
    }
    setAsking(true)
    const { data, error } = await supabase.rpc('post_doubt', {
      p_question: question.trim(),
      p_function_tag: askFuncTag || null,
    })
    setAsking(false)
    if (error || data?.error) {
      setAskErr('Could not post question — please try again.')
      return
    }
    const newDoubt: Doubt = {
      id: data.id,
      author_id: myUserId,
      question: question.trim(),
      function_tag: askFuncTag || null,
      is_resolved: false,
      vote_count: 0,
      answer_count: 0,
      created_at: new Date().toISOString(),
      author_name: 'You',
      i_voted: false,
    }
    setDoubts([newDoubt, ...doubts])
    setQuestion('')
    setAskFuncTag('')
    setShowAskForm(false)
  }

  async function toggleVote(doubt: Doubt) {
    const { data, error } = await supabase.rpc('toggle_doubt_vote', { p_doubt_id: doubt.id })
    if (error || !data) return
    setDoubts(prev => prev.map(d =>
      d.id !== doubt.id ? d : {
        ...d,
        vote_count: data.voted ? d.vote_count + 1 : Math.max(0, d.vote_count - 1),
        i_voted: data.voted,
      }
    ))
  }

  async function loadAnswers(doubtId: string) {
    if (answers[doubtId]) return
    setLoadingAnswers(prev => ({ ...prev, [doubtId]: true }))
    const { data } = await supabase
      .from('doubt_answers')
      .select(`
        id, doubt_id, author_id, body, is_accepted, created_at,
        profiles!doubt_answers_author_id_fkey ( name )
      `)
      .eq('doubt_id', doubtId)
      .order('is_accepted', { ascending: false })
      .order('created_at', { ascending: true })
    setLoadingAnswers(prev => ({ ...prev, [doubtId]: false }))
    setAnswers(prev => ({
      ...prev,
      [doubtId]: (data ?? []).map((a: Record<string, unknown>) => ({
        ...(a as Omit<DoubtAnswer, 'author_name'>),
        author_name: (a.profiles as { name: string } | null)?.name ?? 'Unknown',
      })),
    }))
  }

  function toggleExpand(doubt: Doubt) {
    if (expandedId === doubt.id) {
      setExpandedId(null)
    } else {
      setExpandedId(doubt.id)
      loadAnswers(doubt.id)
    }
  }

  async function submitAnswer(doubtId: string) {
    const body = (answerText[doubtId] ?? '').trim()
    if (!body) return
    setSubmittingAnswer(prev => ({ ...prev, [doubtId]: true }))
    const { data, error } = await supabase.rpc('post_answer', {
      p_doubt_id: doubtId,
      p_body: body,
    })
    setSubmittingAnswer(prev => ({ ...prev, [doubtId]: false }))
    if (error || data?.error) return
    const newAnswer: DoubtAnswer = {
      id: data.id,
      doubt_id: doubtId,
      author_id: myUserId,
      body,
      is_accepted: false,
      created_at: new Date().toISOString(),
      author_name: 'You',
    }
    setAnswers(prev => ({ ...prev, [doubtId]: [...(prev[doubtId] ?? []), newAnswer] }))
    setAnswerText(prev => ({ ...prev, [doubtId]: '' }))
    setDoubts(prev => prev.map(d =>
      d.id !== doubtId ? d : { ...d, answer_count: d.answer_count + 1 }
    ))
  }

  async function acceptAnswer(doubtId: string, answerId: string) {
    const { data, error } = await supabase.rpc('accept_answer', { p_answer_id: answerId })
    if (error || data?.error) return
    setAnswers(prev => ({
      ...prev,
      [doubtId]: (prev[doubtId] ?? []).map(a => ({ ...a, is_accepted: a.id === answerId })),
    }))
    setDoubts(prev => prev.map(d =>
      d.id !== doubtId ? d : { ...d, is_resolved: true }
    ))
  }

  return (
    <div className="mx-auto max-w-md px-4 pt-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-pi-soft">
            <MessageCircleQuestion className="h-4 w-4 text-pi" />
          </span>
          <h1 className="text-lg font-bold">Doubts</h1>
        </div>
        <Button size="sm" onClick={() => setShowAskForm(!showAskForm)} className="gap-1.5 bg-pi hover:bg-pi/90">
          <Plus className="h-4 w-4" />
          Ask
        </Button>
      </div>

      {/* Ask form */}
      {showAskForm && (
        <form onSubmit={submitQuestion} className="mb-4 rounded-2xl border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Ask a question</p>
            <button type="button" onClick={() => setShowAskForm(false)}>
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="q-body">Your question</Label>
            <Textarea
              id="q-body"
              value={question}
              onChange={e => setQuestion(e.target.value)}
              placeholder="e.g. What's the best way to structure a PI answer about leadership?"
              required
              rows={3}
              maxLength={500}
            />
            <p className="text-[10px] text-muted-foreground text-right">min 5 characters · {question.trim().length}/500</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="q-func">Function (optional)</Label>
            <select
              id="q-func"
              value={askFuncTag}
              onChange={e => setAskFuncTag(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">General</option>
              {FUNCTION_TAGS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          {askErr && <p className="text-xs text-destructive">{askErr}</p>}
          <Button type="submit" className="w-full bg-pi hover:bg-pi/90" disabled={asking}>
            {asking ? 'Posting…' : 'Post question'}
          </Button>
        </form>
      )}

      {/* Filter bar */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none mb-2">
        {[ALL_FILTER, ...FUNCTION_TAGS].map(tag => (
          <button
            key={tag}
            onClick={() => setFilter(tag)}
            className={cn(
              'shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors',
              filter === tag
                ? 'bg-pi text-white'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            )}
          >
            {tag}
          </button>
        ))}
      </div>

      {/* Show resolved toggle */}
      <div className="flex justify-end mb-3">
        <button
          onClick={() => setShowResolved(!showResolved)}
          className={cn(
            'text-[11px] font-medium rounded-full px-2.5 py-1 transition-colors',
            showResolved
              ? 'bg-success/15 text-success'
              : 'bg-muted text-muted-foreground'
          )}
        >
          {showResolved ? 'Hide resolved' : 'Show resolved'}
        </button>
      </div>

      {/* Doubt list */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-20 text-center">
          <MessageCircleQuestion className="h-8 w-8 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">No questions yet. Be the first to ask!</p>
        </div>
      ) : (
        <div className="space-y-3 pb-6">
          {filtered.map(doubt => {
            const isExpanded = expandedId === doubt.id
            const isMyDoubt = doubt.author_id === myUserId
            return (
              <div key={doubt.id} className="rounded-2xl border bg-card overflow-hidden">
                {/* Doubt header */}
                <div className="p-4">
                  <div className="flex gap-3">
                    {/* Vote column */}
                    <div className="flex flex-col items-center gap-1 pt-0.5">
                      <button
                        onClick={() => toggleVote(doubt)}
                        className={cn(
                          'flex h-7 w-7 items-center justify-center rounded-full transition-colors',
                          doubt.i_voted
                            ? 'bg-pi/15 text-pi'
                            : 'bg-muted text-muted-foreground hover:bg-muted/60'
                        )}
                        aria-label="Upvote"
                      >
                        <ChevronUp className="h-4 w-4" />
                      </button>
                      <span className={cn(
                        'text-[12px] font-bold tabular-nums',
                        doubt.i_voted ? 'text-pi' : 'text-foreground'
                      )}>
                        {doubt.vote_count}
                      </span>
                    </div>

                    {/* Question content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start gap-1.5 flex-wrap mb-1">
                        {doubt.is_resolved && (
                          <span className="flex items-center gap-0.5 rounded-full bg-success/15 text-success px-2 py-0.5 text-[10px] font-medium">
                            <Check className="h-2.5 w-2.5" /> Resolved
                          </span>
                        )}
                        {doubt.function_tag && (
                          <span className="rounded-full bg-pi/10 text-pi px-2 py-0.5 text-[10px] font-medium">
                            {doubt.function_tag}
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-medium leading-snug">{doubt.question}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {doubt.author_name} · {new Date(doubt.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      </p>
                    </div>
                  </div>

                  {/* Expand / answers count */}
                  <button
                    onClick={() => toggleExpand(doubt)}
                    className="mt-3 flex w-full items-center justify-between text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <span className="flex items-center gap-1">
                      <MessageSquare className="h-3.5 w-3.5" />
                      {doubt.answer_count === 0 ? 'No answers yet' : `${doubt.answer_count} answer${doubt.answer_count !== 1 ? 's' : ''}`}
                    </span>
                    {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </button>
                </div>

                {/* Expanded answers section */}
                {isExpanded && (
                  <div className="border-t border-border/60 bg-muted/30 px-4 py-3 space-y-3">
                    {loadingAnswers[doubt.id] ? (
                      <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Loading answers…
                      </div>
                    ) : (answers[doubt.id] ?? []).length === 0 ? (
                      <p className="text-xs text-muted-foreground py-1">No answers yet — be the first!</p>
                    ) : (
                      (answers[doubt.id] ?? []).map(ans => (
                        <div key={ans.id} className={cn(
                          'rounded-xl p-3 space-y-1',
                          ans.is_accepted ? 'bg-success/10 border border-success/30' : 'bg-card border border-border/60'
                        )}>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-medium text-foreground">
                              {ans.author_name}
                              {ans.is_accepted && (
                                <span className="ml-1.5 text-[10px] text-success font-semibold">✓ Accepted</span>
                              )}
                            </span>
                            {isMyDoubt && !ans.is_accepted && !doubt.is_resolved && (
                              <button
                                onClick={() => acceptAnswer(doubt.id, ans.id)}
                                className="text-[10px] text-muted-foreground underline hover:text-foreground"
                              >
                                Accept
                              </button>
                            )}
                          </div>
                          <p className="text-sm leading-relaxed whitespace-pre-line">{ans.body}</p>
                        </div>
                      ))
                    )}

                    {/* Answer box */}
                    <div className="space-y-2 pt-1">
                      <Textarea
                        placeholder="Write an answer…"
                        value={answerText[doubt.id] ?? ''}
                        onChange={e => setAnswerText(prev => ({ ...prev, [doubt.id]: e.target.value }))}
                        rows={2}
                        className="text-sm"
                      />
                      <Button
                        size="sm"
                        className="w-full bg-pi hover:bg-pi/90"
                        disabled={!answerText[doubt.id]?.trim() || submittingAnswer[doubt.id]}
                        onClick={() => submitAnswer(doubt.id)}
                      >
                        {submittingAnswer[doubt.id] ? 'Posting…' : 'Post answer'}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
