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
  share_slug: string
  room: { name: string; location: string } | null
  host: { id: string; name: string; whatsapp: string | null } | null
  my_enrollment: { status: EnrollmentStatus; position: number | null } | null
}

export interface Me {
  id: string
  name: string
}
