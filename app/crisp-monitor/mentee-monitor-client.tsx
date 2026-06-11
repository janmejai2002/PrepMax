'use client'

import { useState } from 'react'
import { UserCheck, UserPlus, UserMinus, Search } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

interface Junior {
  id: string
  name: string
  email: string
  batch: string | null
  section: string | null
  mentor_id: string | null
}

interface MenteeMonitorClientProps {
  juniors: Junior[]
  myId: string
}

export function MenteeMonitorClient({ juniors: initial, myId }: MenteeMonitorClientProps) {
  const [juniors, setJuniors] = useState<Junior[]>(initial)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'mine' | 'unassigned'>('all')
  const [loading, setLoading] = useState<string | null>(null)
  const supabase = createClient()

  const visible = juniors.filter((j) => {
    const q = query.trim().toLowerCase()
    const matchQuery = !q || j.name.toLowerCase().includes(q) || j.email.toLowerCase().includes(q)
    const matchFilter =
      filter === 'all' ? true
      : filter === 'mine' ? j.mentor_id === myId
      : !j.mentor_id
    return matchQuery && matchFilter
  })

  async function handleAssign(juniorId: string) {
    setLoading(juniorId)
    const { data, error } = await supabase.rpc('assign_mentee', { p_junior_id: juniorId })
    setLoading(null)
    if (error || data?.error) {
      toast.error('Could not assign mentee — try again.')
      return
    }
    setJuniors((prev) =>
      prev.map((j) => (j.id === juniorId ? { ...j, mentor_id: myId } : j))
    )
    toast.success('Mentee assigned.')
  }

  async function handleUnassign(juniorId: string) {
    setLoading(juniorId)
    const { data, error } = await supabase.rpc('unassign_mentee', { p_junior_id: juniorId })
    setLoading(null)
    if (error || data?.error) {
      toast.error('Could not unassign — try again.')
      return
    }
    setJuniors((prev) =>
      prev.map((j) => (j.id === juniorId ? { ...j, mentor_id: null } : j))
    )
    toast.success('Mentee unassigned.')
  }

  const myCount = juniors.filter((j) => j.mentor_id === myId).length

  return (
    <div className="space-y-4">
      {/* search */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or email…"
          className="h-11 w-full rounded-full border border-border/70 bg-card pl-10 pr-4 text-sm outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-ring"
        />
      </div>

      {/* filter tabs */}
      <div className="flex h-10 items-center gap-1 rounded-full border border-border/70 bg-card p-1">
        {([
          { value: 'all', label: `All (${juniors.length})` },
          { value: 'mine', label: `My mentees (${myCount})` },
          { value: 'unassigned', label: 'Unassigned' },
        ] as const).map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setFilter(value)}
            className={cn(
              'h-full flex-1 rounded-full text-[12px] font-semibold transition-all',
              filter === value
                ? 'bg-secondary text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* list */}
      {visible.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          {query ? 'No results.' : filter === 'mine' ? 'No mentees assigned yet.' : 'No juniors found.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {visible.map((j) => {
            const isMine = j.mentor_id === myId
            const isAssigned = !!j.mentor_id && !isMine
            return (
              <li
                key={j.id}
                className={cn(
                  'flex items-center gap-3 rounded-2xl border bg-card px-4 py-3 transition-colors',
                  isMine && 'border-success/30'
                )}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gd-soft text-xs font-bold text-gd">
                  {j.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{j.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{j.email}</p>
                  {j.batch && (
                    <p className="text-[10px] text-muted-foreground">
                      {j.batch}{j.section ? ` · ${j.section}` : ''}
                    </p>
                  )}
                </div>

                {isMine ? (
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="flex items-center gap-1 rounded-full bg-success/15 px-2.5 py-1 text-[11px] font-semibold text-success">
                      <UserCheck className="h-3 w-3" />
                      Yours
                    </span>
                    <button
                      onClick={() => handleUnassign(j.id)}
                      disabled={loading === j.id}
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50 transition-colors"
                      aria-label="Remove mentee"
                    >
                      <UserMinus className="h-4 w-4" />
                    </button>
                  </div>
                ) : isAssigned ? (
                  <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                    Assigned
                  </span>
                ) : (
                  <button
                    onClick={() => handleAssign(j.id)}
                    disabled={loading === j.id}
                    className="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-foreground px-3 text-xs font-semibold text-background transition-all active:scale-[0.97] disabled:opacity-60 hover:opacity-90"
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                    Add
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
