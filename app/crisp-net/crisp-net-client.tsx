'use client'

import { useState, useTransition } from 'react'
import { cn } from '@/lib/utils'
import { CheckCircle2, Circle, Clock3, Loader2, ListTodo, Star } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { SCORE_DIMS, SCORE_DIM_LABELS } from '@/lib/types'

type Tab = 'feedback' | 'tasks'

export interface FeedbackRow {
  id: string
  slot_type: string
  slot_topic: string
  slot_start_at: string
  scores: Record<string, number>
  tags: string[]
  notes: string | null
}

export interface TaskRow {
  id: string
  title: string
  description: string | null
  deadline: string
  assignment_id: string
  status: 'not_started' | 'in_process' | 'completed'
}

const STATUS_LABELS: Record<string, string> = {
  not_started: 'Not started',
  in_process:  'In progress',
  completed:   'Completed',
}

const STATUS_ORDER: Array<TaskRow['status']> = ['not_started', 'in_process', 'completed']

function nextStatus(s: TaskRow['status']): TaskRow['status'] {
  const idx = STATUS_ORDER.indexOf(s)
  return STATUS_ORDER[(idx + 1) % STATUS_ORDER.length]
}

function TaskCard({ task }: { task: TaskRow }) {
  const [status, setStatus] = useState(task.status)
  const [isPending, start] = useTransition()
  const sb = createClient()

  function advance() {
    const next = nextStatus(status)
    start(async () => {
      const { data } = await sb.rpc('update_task_status', {
        p_task_id: task.id,
        p_status: next,
      })
      if (data?.error) { toast.error(data.error); return }
      setStatus(next)
    })
  }

  const deadlinePast = new Date(task.deadline) < new Date()
  const Icon = status === 'completed' ? CheckCircle2 : status === 'in_process' ? Clock3 : Circle

  return (
    <div className={cn(
      'rounded-2xl border bg-card p-4 space-y-2',
      status === 'completed' && 'opacity-60'
    )}>
      <div className="flex items-start gap-3">
        <button
          onClick={advance}
          disabled={isPending || status === 'completed'}
          className="mt-0.5 shrink-0 text-muted-foreground hover:text-gd disabled:opacity-40 transition-colors"
          title={`Mark as ${nextStatus(status)}`}
        >
          {isPending
            ? <Loader2 className="h-5 w-5 animate-spin" />
            : <Icon className={cn('h-5 w-5', status === 'completed' && 'text-green-500', status === 'in_process' && 'text-amber-500')} />
          }
        </button>
        <div className="flex-1 min-w-0">
          <p className={cn('text-sm font-semibold leading-snug', status === 'completed' && 'line-through')}>{task.title}</p>
          {task.description && (
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{task.description}</p>
          )}
          <div className="flex items-center gap-2 mt-1.5">
            <span className={cn(
              'text-[10px] font-medium rounded-full px-2 py-0.5',
              status === 'completed'  ? 'bg-green-500/15 text-green-600'
            : status === 'in_process' ? 'bg-amber-500/15 text-amber-600'
            :                           'bg-muted text-muted-foreground'
            )}>
              {STATUS_LABELS[status]}
            </span>
            <span className={cn('text-[10px] text-muted-foreground', deadlinePast && status !== 'completed' && 'text-destructive font-semibold')}>
              Due {new Date(task.deadline).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
              {deadlinePast && status !== 'completed' && ' · overdue'}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

function FeedbackCard({ row }: { row: FeedbackRow }) {
  return (
    <div className="rounded-2xl border bg-card p-4 space-y-2">
      <div>
        <p className="text-sm font-semibold leading-snug">{row.slot_topic || 'Practice session'}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          {row.slot_type?.toUpperCase()} ·{' '}
          {new Date(row.slot_start_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
        </p>
      </div>
      {Object.keys(row.scores).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {SCORE_DIMS.filter(d => row.scores[d] !== undefined).map(dim => (
            <span key={dim} className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px]">
              <span className="text-muted-foreground">{SCORE_DIM_LABELS[dim]}</span>
              <span className="font-bold">{row.scores[dim]}/5</span>
            </span>
          ))}
        </div>
      )}
      {row.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {row.tags.map(t => (
            <span key={t} className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{t}</span>
          ))}
        </div>
      )}
      {row.notes && (
        <p className="text-xs leading-relaxed text-muted-foreground border-t border-border/60 pt-2">{row.notes}</p>
      )}
    </div>
  )
}

interface Props {
  initialFeedback: FeedbackRow[]
  initialTasks: TaskRow[]
  defaultTab?: Tab
}

export function CrispNetClient({ initialFeedback, initialTasks, defaultTab = 'feedback' }: Props) {
  const [tab, setTab] = useState<Tab>(defaultTab)

  return (
    <div className="mx-auto max-w-md">
      {/* Sub-tab bar */}
      <div className="sticky top-14 z-30 flex gap-1 border-b border-border/60 bg-background px-4 pt-2">
        {(['feedback', 'tasks'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'flex-1 pb-2.5 text-sm font-semibold transition-colors',
              tab === t
                ? 'border-b-2 border-gd text-gd'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {t === 'feedback' ? 'Feedback' : 'Tasks'}
          </button>
        ))}
      </div>

      {tab === 'feedback' && (
        <div className="px-4 pt-5 space-y-3">
          <h1 className="text-lg font-bold">My Feedback</h1>
          {initialFeedback.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              <Star className="mx-auto h-10 w-10 mb-3 opacity-30" />
              <p className="font-medium">No feedback yet</p>
              <p className="text-sm mt-1">Feedback from your GD/PI sessions will appear here — judge identity is hidden.</p>
            </div>
          ) : (
            initialFeedback.map(row => <FeedbackCard key={row.id} row={row} />)
          )}
        </div>
      )}

      {tab === 'tasks' && (
        <div className="px-4 pt-5 space-y-3">
          <h1 className="text-lg font-bold">My Tasks</h1>
          {initialTasks.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              <ListTodo className="mx-auto h-10 w-10 mb-3 opacity-30" />
              <p className="font-medium">No tasks yet</p>
              <p className="text-sm mt-1">Your CRISP mentor will assign tasks here.</p>
            </div>
          ) : (
            initialTasks.map(task => <TaskCard key={task.id} task={task} />)
          )}
        </div>
      )}
    </div>
  )
}
