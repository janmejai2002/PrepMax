'use client'

import { useState } from 'react'
import { Loader2, Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { FeedSlot } from '@/lib/types'

interface EditSlotSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  slot: FeedSlot
  onSlotChange: (slot: FeedSlot) => void
}

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// Fixed durations keep end-times sane — no one can fat-finger a 2-day slot.
const DURATIONS = [30, 40, 60, 90] as const
function nearestDuration(startIso: string, endIso: string): number {
  const diff = Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000)
  return DURATIONS.reduce(
    (best, d) => (Math.abs(d - diff) < Math.abs(best - diff) ? d : best),
    DURATIONS[0]
  )
}

export function EditSlotSheet({ open, onOpenChange, slot, onSlotChange }: EditSlotSheetProps) {
  const isGD = slot.type === 'GD'

  const [topic, setTopic] = useState(slot.topic)
  const [internship, setInternship] = useState(slot.internship ?? '')
  const [areaInput, setAreaInput] = useState('')
  const [areas, setAreas] = useState<string[]>(slot.expert_areas)
  const [startAt, setStartAt] = useState(toLocalInput(new Date(slot.start_at)))
  const [durationMin, setDurationMin] = useState<number>(
    nearestDuration(slot.start_at, slot.end_at)
  )
  const [capacity, setCapacity] = useState(String(slot.capacity))
  const [description, setDescription] = useState(slot.description ?? '')
  const [gdTypeDesc, setGdTypeDesc] = useState(slot.gd_type_desc ?? '')
  const [submitting, setSubmitting] = useState(false)

  function addArea() {
    const v = areaInput.trim()
    if (!v) return
    if (!areas.includes(v)) setAreas((p) => [...p, v])
    setAreaInput('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (topic.trim().length < 3) return toast.error('Give the topic a clearer title.')
    const startDate = new Date(startAt)
    const endDate = new Date(startDate.getTime() + durationMin * 60 * 1000)
    const cap = parseInt(capacity, 10)
    if (!cap || cap < 1) return toast.error('Capacity must be at least 1.')
    if (cap < slot.enrolled_count)
      return toast.error(`${slot.enrolled_count} juniors are enrolled — seats can't go below that.`)

    setSubmitting(true)
    const supabase = createClient()

    const patch = {
      topic: topic.trim(),
      internship: internship.trim() || null,
      expert_areas: areas,
      start_at: startDate.toISOString(),
      end_at: endDate.toISOString(),
      capacity: cap,
      description: description.trim() || null,
      gd_type_desc: isGD ? gdTypeDesc.trim() || null : null,
    }

    const { data, error } = await supabase.rpc('edit_slot', {
      p_slot_id: slot.id,
      p_expected_version: slot.version,
      p_patch: patch,
    })
    setSubmitting(false)

    if (error || data?.error) {
      const code = data?.error
      if (code === 'version_conflict')
        toast.error('This slot changed since you opened it. Close and reopen to edit.')
      else if (code === 'capacity_below_enrolled')
        toast.error(`${data.enrolled_count} juniors are enrolled — seats can't go below that.`)
      else if (code === 'unauthorized')
        toast.error("You're not allowed to edit this slot.")
      else if (code === 'slot_not_editable')
        toast.error('This slot can no longer be edited.')
      else toast.error('Could not save changes. Please try again.')
      return
    }

    onSlotChange({
      ...slot,
      topic: patch.topic,
      internship: patch.internship,
      expert_areas: patch.expert_areas,
      start_at: patch.start_at,
      end_at: patch.end_at,
      capacity: cap,
      description: patch.description,
      gd_type_desc: patch.gd_type_desc,
      version: data.version,
      enrolled_count: data.enrolled_count,
      status: data.slot_status,
    })

    toast.success(
      data.promoted_count > 0
        ? `Saved — ${data.promoted_count} from the waitlist got a seat 🎉`
        : 'Slot updated.'
    )
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
      >
        <DialogHeader className="border-b border-border/60 px-4 py-3.5">
          <DialogTitle>Edit slot</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
            {/* type + room are fixed once posted */}
            <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
              {`${isGD ? 'Group Discussion' : 'Personal Interview'}${slot.room ? ` · ${slot.room.name}` : ''} — type and room can't be changed after posting.`}
            </p>

            {/* topic */}
            <div className="space-y-1.5">
              <Label htmlFor="es-topic">Topic</Label>
              <Input
                id="es-topic"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className="h-11"
                required
              />
            </div>

            {/* internship */}
            <div className="space-y-1.5">
              <Label htmlFor="es-intern">
                Company / domain <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="es-intern"
                value={internship}
                onChange={(e) => setInternship(e.target.value)}
                placeholder="e.g. McKinsey, Consulting"
                className="h-11"
              />
            </div>

            {/* expert areas */}
            <div className="space-y-1.5">
              <Label htmlFor="es-area">
                Focus areas <span className="text-muted-foreground">(optional)</span>
              </Label>
              <div className="flex gap-2">
                <Input
                  id="es-area"
                  value={areaInput}
                  onChange={(e) => setAreaInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addArea()
                    }
                  }}
                  placeholder="Add a tag, press Enter"
                  className="h-11"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-11 w-11 shrink-0"
                  onClick={addArea}
                  aria-label="Add focus area"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {areas.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {areas.map((a) => (
                    <button
                      key={a}
                      type="button"
                      onClick={() => setAreas((p) => p.filter((x) => x !== a))}
                      className="flex items-center gap-1 rounded-full border border-border/70 px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      {a}
                      <X className="h-3 w-3" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* start + duration */}
            <div className="space-y-1.5">
              <Label htmlFor="es-start">Starts</Label>
              <Input
                id="es-start"
                type="datetime-local"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
                className="h-11"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Duration</Label>
              <div className="grid grid-cols-4 gap-1.5">
                {DURATIONS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDurationMin(d)}
                    className={cn(
                      'h-11 rounded-lg border text-[13px] font-semibold transition-all',
                      durationMin === d
                        ? 'border-foreground bg-foreground text-background'
                        : 'border-border/70 text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {d}m
                  </button>
                ))}
              </div>
            </div>

            {/* capacity */}
            <div className="space-y-1.5">
              <Label htmlFor="es-cap">Seats</Label>
              <Input
                id="es-cap"
                type="number"
                min={slot.enrolled_count || 1}
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                className="h-11"
                required
              />
              {slot.enrolled_count > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  {slot.enrolled_count} enrolled — raising seats pulls in the waitlist.
                </p>
              )}
            </div>

            {/* GD format note */}
            {isGD && (
              <div className="space-y-1.5">
                <Label htmlFor="es-gd">
                  Format note <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="es-gd"
                  value={gdTypeDesc}
                  onChange={(e) => setGdTypeDesc(e.target.value)}
                  placeholder="e.g. Case-based, 15 min + feedback"
                  className="h-11"
                />
              </div>
            )}

            {/* description */}
            <div className="space-y-1.5">
              <Label htmlFor="es-desc">
                Description <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Textarea
                id="es-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Anything juniors should know or prepare."
                rows={3}
              />
            </div>
          </div>

          <div className="border-t border-border/60 px-4 py-3">
            <Button type="submit" className="h-11 w-full" disabled={submitting}>
              {submitting ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving…
                </span>
              ) : (
                'Save changes'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
