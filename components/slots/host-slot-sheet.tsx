'use client'

import { useMemo, useState } from 'react'
import { Loader2, Check, X, Plus, CalendarDays } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type {
  FeedSlot,
  HostCapabilities,
  JudgeOption,
  Me,
  RoomOption,
  SlotType,
} from '@/lib/types'
import { RoomScheduleSheet } from './room-schedule-sheet'

interface HostSlotSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  me: Me
  myWhatsapp: string | null
  capabilities: HostCapabilities
  rooms: RoomOption[]
  judges: JudgeOption[]
  onCreated: (slot: FeedSlot) => void
}

// A datetime-local default ~1 hour from now, rounded to the next half hour,
// formatted for the native input (local time, no timezone suffix).
function defaultStart(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000)
  d.setMinutes(d.getMinutes() > 30 ? 60 : 30, 0, 0)
  return toLocalInput(d)
}
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// Fixed durations keep end-times sane — no one can fat-finger a 2-day slot.
const DURATIONS = [30, 40, 60, 90] as const

export function HostSlotSheet({
  open,
  onOpenChange,
  me,
  myWhatsapp,
  capabilities,
  rooms,
  judges,
  onCreated,
}: HostSlotSheetProps) {
  const allowedTypes = useMemo<SlotType[]>(() => {
    const t: SlotType[] = []
    if (capabilities.canHostGd || capabilities.canManageRooms) t.push('GD')
    if (capabilities.canHostPi || capabilities.canManageRooms) t.push('PI')
    return t
  }, [capabilities])

  const start0 = defaultStart()
  const [type, setType] = useState<SlotType>(allowedTypes[0] ?? 'GD')
  const [topic, setTopic] = useState('')
  const [internship, setInternship] = useState('')
  const [areaInput, setAreaInput] = useState('')
  const [areas, setAreas] = useState<string[]>([])
  const [roomId, setRoomId] = useState('')
  const [startAt, setStartAt] = useState(start0)
  const [durationMin, setDurationMin] = useState<number>(30)
  const [capacity, setCapacity] = useState('8')
  const [description, setDescription] = useState('')
  const [gdTypeDesc, setGdTypeDesc] = useState('')
  const [coJudges, setCoJudges] = useState<Set<string>>(new Set())
  const [judgeFilter, setJudgeFilter] = useState('')
  const [visibility, setVisibility] = useState<'public' | 'mentees_only'>('public')
  const [submitting, setSubmitting] = useState(false)
  const [scheduleOpen, setScheduleOpen] = useState(false)

  // CRISP/SAC (canManageRooms) can use any non-deleted room; regular seniors see only live rooms.
  const liveRooms = useMemo(
    () => capabilities.canManageRooms ? rooms : rooms.filter((r) => r.status !== 'offline'),
    [rooms, capabilities.canManageRooms]
  )
  const roomLabel = (r: RoomOption) =>
    `${r.name}${r.location ? ` · ${r.location}` : ''}${r.status === 'live_occupied' ? ' (in use now)' : r.status === 'offline' ? ' [offline]' : ''}`
  // value→label map so the Select trigger shows the room name, not its id
  const roomItems = useMemo(
    () => Object.fromEntries(liveRooms.map((r) => [r.id, roomLabel(r)])),
    [liveRooms]
  )
  const filteredJudges = useMemo(() => {
    const q = judgeFilter.trim().toLowerCase()
    return q ? judges.filter((j) => j.name.toLowerCase().includes(q)) : judges
  }, [judges, judgeFilter])

  function addArea() {
    const v = areaInput.trim()
    if (!v) return
    if (!areas.includes(v)) setAreas((p) => [...p, v])
    setAreaInput('')
  }
  function toggleJudge(id: string) {
    setCoJudges((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function reset() {
    const s = defaultStart()
    setType(allowedTypes[0] ?? 'GD')
    setTopic('')
    setInternship('')
    setAreaInput('')
    setAreas([])
    setRoomId('')
    setStartAt(s)
    setDurationMin(30)
    setCapacity('8')
    setDescription('')
    setGdTypeDesc('')
    setCoJudges(new Set())
    setJudgeFilter('')
    setVisibility('public')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    // Validation
    if (topic.trim().length < 3) return toast.error('Give the topic a clearer title.')
    if (!roomId) return toast.error('Pick a room.')
    const startDate = new Date(startAt)
    const endDate = new Date(startDate.getTime() + durationMin * 60 * 1000)
    if (startDate.getTime() < Date.now() - 60 * 1000)
      return toast.error('Start time is in the past.')
    const cap = parseInt(capacity, 10)
    if (!cap || cap < 1) return toast.error('Capacity must be at least 1.')

    const room = rooms.find((r) => r.id === roomId)!
    setSubmitting(true)
    const supabase = createClient()

    const { data: result, error } = await supabase.rpc('create_slot', {
      p_type:         type,
      p_topic:        topic.trim(),
      p_internship:   internship.trim(),
      p_expert_areas: areas,
      p_room_id:      roomId,
      p_start_at:     startDate.toISOString(),
      p_end_at:       endDate.toISOString(),
      p_capacity:     cap,
      p_description:  description.trim(),
      p_gd_type_desc: type === 'GD' ? gdTypeDesc.trim() : '',
      p_judge_ids:    [...coJudges],
      p_visibility:   visibility,
    })

    setSubmitting(false)

    if (error || !result || result.error) {
      const code = result?.error
      toast.error(
        code === 'host_time_conflict' ? 'You already have a slot at that time.'
        : code === 'room_double_booked' ? 'That room is already booked for this time slot.'
        : code === 'unauthorized' ? `You're not set up to host ${type} slots yet.`
        : 'Could not post the slot. Please try again.'
      )
      return
    }

    const created = result.slot
    const feedSlot: FeedSlot = {
      ...(created as Omit<FeedSlot, 'room' | 'host' | 'my_enrollment'>),
      room: { name: room.name, location: room.location ?? '' },
      host: { id: me.id, name: me.name, whatsapp: myWhatsapp },
      my_enrollment: null,
    }
    onCreated(feedSlot)
    toast.success('Slot posted — juniors can join now 🎉')
    reset()
    onOpenChange(false)
  }

  const isGD = type === 'GD'

  const selectedRoom = liveRooms.find((r) => r.id === roomId)

  return (
    <>
    {selectedRoom && (
      <RoomScheduleSheet
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
        roomId={roomId}
        roomName={selectedRoom.name}
        durationMin={durationMin}
        onSelect={(startDate) => setStartAt(toLocalInput(startDate))}
      />
    )}
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
      >
        <DialogHeader className="border-b border-border/60 px-4 py-3.5">
          <DialogTitle>Host a slot</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
            {/* type */}
            {allowedTypes.length > 1 && (
              <div className="space-y-1.5">
                <Label>Type</Label>
                <div className="flex h-11 items-center gap-1 rounded-full border border-border/70 bg-card p-1">
                  {allowedTypes.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setType(t)}
                      className={cn(
                        'h-full flex-1 rounded-full text-[13px] font-semibold transition-all',
                        type === t
                          ? t === 'GD'
                            ? 'bg-gd-soft text-gd'
                            : 'bg-pi-soft text-pi'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {t === 'GD' ? 'Group Discussion' : 'Personal Interview'}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* topic */}
            <div className="space-y-1.5">
              <Label htmlFor="hs-topic">Topic</Label>
              <Input
                id="hs-topic"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder={isGD ? 'Is remote work here to stay?' : 'Finance — summers prep'}
                className="h-11"
                required
              />
            </div>

            {/* internship */}
            <div className="space-y-1.5">
              <Label htmlFor="hs-intern">Company / domain <span className="text-muted-foreground">(optional)</span></Label>
              <Input
                id="hs-intern"
                value={internship}
                onChange={(e) => setInternship(e.target.value)}
                placeholder="e.g. McKinsey, Consulting"
                className="h-11"
              />
            </div>

            {/* expert areas */}
            <div className="space-y-1.5">
              <Label htmlFor="hs-area">Focus areas <span className="text-muted-foreground">(optional)</span></Label>
              <div className="flex gap-2">
                <Input
                  id="hs-area"
                  value={areaInput}
                  onChange={(e) => setAreaInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); addArea() }
                  }}
                  placeholder="Add a tag, press Enter"
                  className="h-11"
                />
                <Button type="button" variant="outline" size="icon" className="h-11 w-11 shrink-0" onClick={addArea} aria-label="Add focus area">
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

            {/* room */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="hs-room">Room</Label>
                {roomId && (
                  <button
                    type="button"
                    onClick={() => setScheduleOpen(true)}
                    className="flex items-center gap-1 text-[11px] text-gd hover:text-gd/80 transition-colors"
                  >
                    <CalendarDays className="h-3 w-3" />
                    See availability
                  </button>
                )}
              </div>
              {liveRooms.length === 0 ? (
                <p className="rounded-lg bg-muted/60 px-3 py-2.5 text-xs text-muted-foreground">
                  No live rooms right now. Ask CRISP/SAC to bring a room online.
                </p>
              ) : (
                <Select value={roomId} onValueChange={(v) => setRoomId(v ?? '')} items={roomItems}>
                  <SelectTrigger id="hs-room" className="h-11 w-full">
                    <SelectValue placeholder="Select a room" />
                  </SelectTrigger>
                  <SelectContent>
                    {liveRooms.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {roomLabel(r)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* start + duration */}
            <div className="space-y-1.5">
              <Label htmlFor="hs-start">Starts</Label>
              <Input
                id="hs-start"
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
              <Label htmlFor="hs-cap">Seats</Label>
              <Input
                id="hs-cap"
                type="number"
                min="1"
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                className="h-11"
                required
              />
            </div>

            {/* GD format note */}
            {isGD && (
              <div className="space-y-1.5">
                <Label htmlFor="hs-gd">Format note <span className="text-muted-foreground">(optional)</span></Label>
                <Input
                  id="hs-gd"
                  value={gdTypeDesc}
                  onChange={(e) => setGdTypeDesc(e.target.value)}
                  placeholder="e.g. Case-based, 15 min + feedback"
                  className="h-11"
                />
              </div>
            )}

            {/* description */}
            <div className="space-y-1.5">
              <Label htmlFor="hs-desc">Description <span className="text-muted-foreground">(optional)</span></Label>
              <Textarea
                id="hs-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Anything juniors should know or prepare."
                rows={3}
              />
            </div>

            {/* co-judges */}
            {judges.length > 0 && (
              <div className="space-y-1.5">
                <Label>Co-judges <span className="text-muted-foreground">(optional)</span></Label>
                {judges.length > 8 && (
                  <Input
                    value={judgeFilter}
                    onChange={(e) => setJudgeFilter(e.target.value)}
                    placeholder="Search seniors…"
                    className="h-10"
                  />
                )}
                <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-border/60 p-2">
                  {filteredJudges.length === 0 ? (
                    <span className="px-1 py-1 text-xs text-muted-foreground">No match.</span>
                  ) : (
                    filteredJudges.map((j) => {
                      const picked = coJudges.has(j.id)
                      return (
                        <button
                          key={j.id}
                          type="button"
                          onClick={() => toggleJudge(j.id)}
                          className={cn(
                            'flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] transition-colors',
                            picked
                              ? 'border-success/40 bg-success/15 text-success'
                              : 'border-border/70 text-muted-foreground hover:text-foreground'
                          )}
                        >
                          {picked && <Check className="h-3 w-3" />}
                          {j.name}
                        </button>
                      )
                    })
                  )}
                </div>
              </div>
            )}
            {/* visibility */}
            <div className="space-y-1.5">
              <Label>Visibility</Label>
              <div className="flex gap-2">
                {(['public', 'mentees_only'] as const).map(v => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setVisibility(v)}
                    className={cn(
                      'flex-1 rounded-xl border py-2.5 text-sm font-medium transition-colors',
                      visibility === v
                        ? 'border-foreground bg-foreground text-background'
                        : 'border-border hover:bg-secondary text-muted-foreground'
                    )}
                  >
                    {v === 'public' ? 'Public' : 'My mentees only'}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">
                {visibility === 'mentees_only'
                  ? 'Only your assigned juniors will see this slot.'
                  : 'All eligible juniors can see and join this slot.'}
              </p>
            </div>
          </div>

          {/* footer action */}
          <div className="border-t border-border/60 px-4 py-3">
            <Button type="submit" className="h-11 w-full" disabled={submitting || liveRooms.length === 0}>
              {submitting ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Posting…
                </span>
              ) : (
                'Post slot'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
    </>
  )
}
