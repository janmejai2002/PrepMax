'use client'

import { useState } from 'react'
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
import { Plus } from 'lucide-react'

interface Room {
  id: string
  name: string
  location: string | null
  capacity: number
  is_live: boolean
}

interface Props {
  initialRooms: Room[]
}

export default function RoomsClient({ initialRooms }: Props) {
  const [rooms, setRooms] = useState<Room[]>(initialRooms)
  const [open, setOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [newRoom, setNewRoom] = useState({ name: '', location: '', capacity: '20' })

  const supabase = createClient()

  async function toggleLive(room: Room) {
    const { error } = await supabase
      .from('rooms')
      .update({ is_live: !room.is_live })
      .eq('id', room.id)

    if (error) {
      toast.error('Could not update room.')
      return
    }

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
    setOpen(false)
    toast.success(`${data.name} added.`)
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button size="sm" className="gap-1.5" />}>
            <Plus className="h-4 w-4" />
            Add room
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add room</DialogTitle>
            </DialogHeader>
            <form onSubmit={addRoom} className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label htmlFor="rname">Name</Label>
                <Input
                  id="rname"
                  placeholder="Room 101 — MDC Block"
                  value={newRoom.name}
                  onChange={(e) => setNewRoom((p) => ({ ...p, name: e.target.value }))}
                  required
                  className="h-11"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rloc">Location</Label>
                <Input
                  id="rloc"
                  placeholder="MDC Block, Ground Floor"
                  value={newRoom.location}
                  onChange={(e) => setNewRoom((p) => ({ ...p, location: e.target.value }))}
                  className="h-11"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rcap">Capacity</Label>
                <Input
                  id="rcap"
                  type="number"
                  min="1"
                  value={newRoom.capacity}
                  onChange={(e) => setNewRoom((p) => ({ ...p, capacity: e.target.value }))}
                  className="h-11"
                />
              </div>
              <Button type="submit" className="w-full" disabled={adding}>
                {adding ? 'Adding…' : 'Add room'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {rooms.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">
          No rooms yet. Add your first venue.
        </p>
      )}

      {rooms.map((room) => (
        <Card key={room.id}>
          <CardContent className="flex items-center justify-between gap-4 py-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm truncate">{room.name}</span>
                <Badge variant={room.is_live ? 'default' : 'secondary'} className="shrink-0">
                  {room.is_live ? 'Live' : 'Offline'}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {room.location ?? '—'} · {room.capacity} seats
              </p>
            </div>
            <Switch
              checked={room.is_live}
              onCheckedChange={() => toggleLive(room)}
              aria-label={`Toggle ${room.name}`}
            />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
