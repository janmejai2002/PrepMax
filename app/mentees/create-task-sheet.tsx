'use client'

import { useState, useTransition } from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Plus } from 'lucide-react'
import { createTask } from './actions'
import { cn } from '@/lib/utils'

interface Mentee {
  user_id: string
  name: string
  roll: string | null
}

interface Props {
  mentees: Mentee[]
}

export function CreateTaskSheet({ mentees }: Props) {
  const [open, setOpen] = useState(false)
  const [scope, setScope] = useState<'all' | 'specific'>('all')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function toggleMentee(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)
    const title = (fd.get('title') as string).trim()
    const description = (fd.get('description') as string).trim()
    const deadline = fd.get('deadline') as string

    if (!title) { setError('Title is required'); return }
    if (!deadline) { setError('Deadline is required'); return }
    if (scope === 'specific' && selectedIds.size === 0) {
      setError('Select at least one mentee')
      return
    }

    startTransition(async () => {
      const result = await createTask({
        title,
        description,
        deadline,
        scope,
        juniorIds: scope === 'specific' ? [...selectedIds] : undefined,
      })
      if (result.error) {
        setError(result.error)
      } else {
        setOpen(false)
        setScope('all')
        setSelectedIds(new Set())
      }
    })
  }

  // Min date: today
  const todayStr = new Date().toISOString().slice(0, 16)

  return (
    <>
      <Button size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        New task
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[90dvh] overflow-y-auto pb-safe">
        <SheetHeader className="mb-5">
          <SheetTitle>Create task</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pb-4">
          <div className="space-y-1.5">
            <Label htmlFor="task-title">Title</Label>
            <Input
              id="task-title"
              name="title"
              placeholder="e.g. Practice one GD this week"
              maxLength={120}
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="task-desc">Description <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Textarea
              id="task-desc"
              name="description"
              placeholder="Add any extra instructions…"
              rows={3}
              maxLength={500}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="task-deadline">Deadline</Label>
            <Input
              id="task-deadline"
              name="deadline"
              type="datetime-local"
              min={todayStr}
            />
          </div>

          <div className="space-y-2">
            <Label>Assign to</Label>
            <div className="grid grid-cols-2 gap-2">
              {(['all', 'specific'] as const).map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setScope(s)}
                  className={cn(
                    'rounded-xl border py-2.5 text-sm font-medium transition-colors',
                    scope === s
                      ? 'border-foreground bg-foreground text-background'
                      : 'border-border hover:bg-secondary'
                  )}
                >
                  {s === 'all' ? 'All my mentees' : 'Specific juniors'}
                </button>
              ))}
            </div>
          </div>

          {scope === 'specific' && mentees.length > 0 && (
            <div className="space-y-1.5">
              <Label>Select juniors</Label>
              <div className="space-y-1 rounded-xl border p-2 max-h-44 overflow-y-auto">
                {mentees.map(m => (
                  <label
                    key={m.user_id}
                    className="flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-secondary cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(m.user_id)}
                      onChange={() => toggleMentee(m.user_id)}
                      className="h-4 w-4 accent-foreground"
                    />
                    <span className="text-sm">{m.name}</span>
                    {m.roll && <span className="text-xs text-muted-foreground ml-auto">{m.roll}</span>}
                  </label>
                ))}
              </div>
            </div>
          )}

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? 'Creating…' : 'Create task'}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
    </>
  )
}
