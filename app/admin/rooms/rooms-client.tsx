'use client'

import { useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Plus, Pencil, Bell, Users, ExternalLink } from 'lucide-react'
import { waPhone } from '@/lib/format'
import { notifyCrispMembers } from './actions'

interface Room {
  id: string
  name: string
  location: string | null
  capacity: number
  is_live: boolean
}

interface Occupant {
  type: string
  topic: string | null
  enrolled: number
  capacity: number
  host_name: string | null
  host_whatsapp: string | null
  end_at: string
}

interface Props {
  initialRooms: Room[]
  isSac?: boolean
  occupancy?: Record<string, Occupant>
}

type RoomForm = { name: string; location: string; capacity: string }

function RoomFormFields({
  values,
  onChange,
  idPrefix,
}: {
  values: RoomForm
  onChange: (patch: Partial<RoomForm>) => void
  idPrefix: string
}) {
  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-name`}>Name</Label>
        <Input
          id={`${idPrefix}-name`}
          placeholder="Room 101 — MDC Block"
          value={values.name}
          onChange={(e) => onChange({ name: e.target.value })}
          required
          className="h-11"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-loc`}>Location</Label>
        <Input
          id={`${idPrefix}-loc`}
          placeholder="MDC Block, Ground Floor"
          value={values.location}
          onChange={(e) => onChange({ location: e.target.value })}
          className="h-11"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-cap`}>Capacity</Label>
        <Input
          id={`${idPrefix}-cap`}
          type="number"
          min="1"
          value={values.capacity}
          onChange={(e) => onChange({ capacity: e.target.value })}
          className="h-11"
        />
      </div>
    </>
  )
}

export default function RoomsClient({ initialRooms, isSac = false, occupancy = {} }: Props) {
  const [rooms, setRooms] = useState<Room[]>(initialRooms)

  const [addOpen, setAddOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [newRoom, setNewRoom] = useState<RoomForm>({ name: '', location: '', capacity: '20' })

  const [editRoom, setEditRoom] = useState<Room | null>(null)
  const [saving, setSaving] = useState(false)

  const [notifying, startNotify] = useTransition()

  const supabase = createClient()

  function handleNotify() {
    const liveRooms = rooms.filter(r => r.is_live).map(r => r.name)
    const msg = liveRooms.length
      ? `Room availability updated. Live rooms: ${liveRooms.join(', ')}. Check PrepMax for current status.`
      : 'Room availability updated. No rooms are currently live. Check PrepMax for current status.'

    startNotify(async () => {
      const result = await notifyCrispMembers(msg)
      if (result.error) {
        toast.error(result.error === 'no_members' ? 'No CRISP members found.' : 'Could not send notification.')
      } else {
        toast.success(`Notified ${result.count} CRISP member${result.count === 1 ? '' : 's'}.`)
      }
    })
  }

  async function toggleLive(room: Room) {
    const { error } = await supabase
      .from('rooms')
      .update({ is_live: !room.is_live })
      .eq('id', room.id)

    if (error) { toast.error('Could not update room.'); return }
    navigator.vibrate?.(30)
    setRooms((prev) =>
      prev.map((r) => (r.id === room.id ? { ...r, is_live: !r.is_live } : r))
    )
    toast.success(`${room.name} is now ${!room.is_live ? 'live' : 'offline'}.`)
  }

  async function addRoom(e: React.FormEvent) {
    e.preventDefault()
    if (!newRoom.name.trim()) return
    setAdding(true)

    const { data, error } = await supabase
      .from('rooms')
      .insert({
        name: newRoom.name.trim(),
        location: newRoom.location.trim() || null,
        capacity: parseInt(newRoom.capacity) || 20,
        is_live: true,
      })
      .select()
      .single()

    setAdding(false)
    if (error) {
      toast.error(error.message.includes('unique') ? 'A room with that name already exists.' : 'Could not add room.')
      return
    }

    setRooms((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
    setNewRoom({ name: '', location: '', capacity: '20' })
    setAddOpen(false)
    toast.success(`${data.name} added.`)
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editRoom) return
    setSaving(true)

    const { data, error } = await supabase
      .from('rooms')
      .update({
        name: editRoom.name.trim(),
        location: editRoom.location?.trim() || null,
        capacity: editRoom.capacity,
      })
      .eq('id', editRoom.id)
      .select()
      .single()

    setSaving(false)
    if (error) {
      toast.error(error.message.includes('unique') ? 'A room with that name already exists.' : 'Could not save changes.')
      return
    }

    setRooms((prev) =>
      prev.map((r) => (r.id === data.id ? { ...r, ...data } : r))
        .sort((a, b) => a.name.localeCompare(b.name))
    )
    setEditRoom(null)
    toast.success('Room updated.')
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end gap-2">
        {isSac && (
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={handleNotify}
            disabled={notifying}
          >
            <Bell className="h-4 w-4" />
            {notifying ? 'Notifying…' : 'Notify CRISP'}
          </Button>
        )}
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger render={<Button size="sm" className="gap-1.5" />}>
            <Plus className="h-4 w-4" />
            Add room
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add room</DialogTitle>
            </DialogHeader>
            <form onSubmit={addRoom} className="space-y-4 pt-2">
              <RoomFormFields
                values={newRoom}
                onChange={(p) => setNewRoom((prev) => ({ ...prev, ...p }))}
                idPrefix="add"
              />
              <Button type="submit" className="w-full" disabled={adding}>
                {adding ? 'Adding…' : 'Add room'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Edit dialog — shared, driven by editRoom state */}
      <Dialog open={!!editRoom} onOpenChange={(o) => { if (!o) setEditRoom(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit room</DialogTitle>
          </DialogHeader>
          {editRoom && (
            <form onSubmit={saveEdit} className="space-y-4 pt-2">
              <RoomFormFields
                values={{
                  name: editRoom.name,
                  location: editRoom.location ?? '',
                  capacity: String(editRoom.capacity),
                }}
                onChange={(p) =>
                  setEditRoom((prev) =>
                    prev
                      ? {
                          ...prev,
                          name: p.name ?? prev.name,
                          location: p.location ?? prev.location,
                          capacity: p.capacity !== undefined ? (parseInt(p.capacity) || prev.capacity) : prev.capacity,
                        }
                      : prev
                  )
                }
                idPrefix="edit"
              />
              <Button type="submit" className="w-full" disabled={saving}>
                {saving ? 'Saving…' : 'Save changes'}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {rooms.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">
          No rooms yet. Add your first venue.
        </p>
      )}

      {rooms.map((room) => {
        const occ = occupancy[room.id]
        const wa = occ?.host_whatsapp ? waPhone(occ.host_whatsapp) : null
        return (
          <Card key={room.id}>
            <CardContent className="py-4 space-y-2">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm truncate">{room.name}</span>
                    <Badge variant={room.is_live ? 'default' : 'secondary'} className="shrink-0">
                      {room.is_live ? (occ ? 'Occupied' : 'Available') : 'Offline'}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {room.location ?? '—'} · {room.capacity} seats
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => setEditRoom(room)}
                    aria-label={`Edit ${room.name}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Switch
                    checked={room.is_live}
                    onCheckedChange={() => toggleLive(room)}
                    aria-label={`Toggle ${room.name}`}
                  />
                </div>
              </div>

              {/* Occupancy strip */}
              {occ && (
                <div className="rounded-lg bg-muted/70 px-3 py-2 flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${occ.type === 'GD' ? 'bg-gd-soft text-gd' : 'bg-pi-soft text-pi'}`}>
                      {occ.type}
                    </span>
                    <span className="text-xs font-medium truncate">{occ.host_name ?? 'Unknown host'}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground">
                      <Users className="h-3 w-3" />
                      {occ.enrolled}/{occ.capacity}
                    </span>
                    {wa && (
                      <a
                        href={`https://wa.me/${wa}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-0.5 text-[11px] text-success font-medium hover:underline"
                      >
                        WhatsApp <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
