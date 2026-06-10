export type SlotType = 'GD' | 'PI'
export type SlotStatus = 'open' | 'full' | 'live' | 'completed' | 'cancelled'
export type EnrollmentStatus = 'confirmed' | 'waitlist' | 'cancelled' | 'no_show' | 'attended'

export interface FeedSlot {
  id: string
  type: SlotType
  host_id: string
  internship: string | null
  expert_areas: string[]
  room_id: string
  start_at: string
  end_at: string
  topic: string
  description: string | null
  gd_type_desc: string | null
  capacity: number
  enrolled_count: number
  status: SlotStatus
  version: number
  share_slug: string
  room: { name: string; location: string } | null
  host: { id: string; name: string; whatsapp: string | null } | null
  my_enrollment: { status: EnrollmentStatus; position: number | null } | null
}

export interface Me {
  id: string
  name: string
}

/** What a senior is allowed to host. Room-managers (SAC/CRISP) may host either type. */
export interface HostCapabilities {
  canHostGd: boolean
  canHostPi: boolean
  canManageRooms: boolean
}

export type RoomAvailability = 'offline' | 'live_available' | 'live_occupied'

export interface RoomOption {
  id: string
  name: string
  location: string | null
  status: RoomAvailability
}

/** A senior eligible to be added as a co-judge on a slot. */
export interface JudgeOption {
  id: string
  name: string
}
