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
  confirmed_at: string | null
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

/** A mentor a junior can pick as their CRISP mentor (from mentor_directory). */
export interface MentorOption {
  id: string
  name: string
  year: string
}

/** A participant entry in the slot detail roster. */
export interface RosterEntry {
  user_id: string
  name: string
  status: EnrollmentStatus
  position: number | null
}

/** Co-judge on a slot. */
export interface CoJudge {
  id: string
  name: string
}

/** Full slot detail as returned by get_slot_detail RPC. */
export interface SlotDetail extends FeedSlot {
  co_judges: CoJudge[]
  roster: RosterEntry[] | { count: number }
  is_host: boolean
  is_judge: boolean
  is_admin: boolean
}

/** A received-feedback row (my_received_feedback view). */
export interface ReceivedFeedback {
  id: string
  slot_id: string
  from_user_id: string
  to_user_id: string
  scores: Record<string, number>
  tags: string[]
  notes: string | null
  created_at: string
  slot_type: 'GD' | 'PI'
  slot_topic: string
  slot_start_at: string
  host_name: string
}

/** Feedback score dimensions. */
export const SCORE_DIMS = ['clarity', 'content', 'confidence', 'structure'] as const
export type ScoreDim = typeof SCORE_DIMS[number]

export const SCORE_DIM_LABELS: Record<ScoreDim, string> = {
  clarity:    'Clarity',
  content:    'Content',
  confidence: 'Confidence',
  structure:  'Structure',
}

export const FEEDBACK_TAGS_POSITIVE = [
  'Strong opener', 'Data-driven', 'Clear structure', 'Good listener',
  'Inclusive', 'Concise', 'Confident delivery', 'Creative ideas',
]
export const FEEDBACK_TAGS_IMPROVE = [
  'Too verbose', 'Interrupted others', 'Lacked examples', 'Rushed ending',
  'Low energy', 'Missed key points', 'Needed more structure',
]

export const FUNCTION_TAGS = ['Finance', 'Marketing', 'Consulting', 'HR', 'Operations', 'General Mgmt', 'Strategy'] as const
export type FunctionTag = typeof FUNCTION_TAGS[number]

export interface KnowledgePost {
  id: string
  author_id: string
  title: string
  body: string
  tags: string[]
  function_tag: string | null
  is_pinned: boolean
  created_at: string
  updated_at: string
  author_name?: string
}

export interface Doubt {
  id: string
  author_id: string
  question: string
  function_tag: string | null
  is_resolved: boolean
  vote_count: number
  answer_count: number
  created_at: string
  author_name: string
  i_voted: boolean
}

export interface DoubtAnswer {
  id: string
  doubt_id: string
  author_id: string
  body: string
  is_accepted: boolean
  created_at: string
  author_name?: string
}

/** Slot details returned by confirm_slot — drives the email body + calendar link. */
export interface ConfirmSlotSlot {
  id: string
  type: SlotType
  topic: string
  internship: string | null
  start_at: string
  end_at: string
  gd_type_desc: string | null
  description: string | null
  room_name: string | null
  room_location: string | null
  host_name: string
}

// ─────────────── SLOT REQUESTS ───────────────

export type SlotRequestStatus = 'open' | 'matched' | 'cancelled'

export const REQUEST_LOCATIONS = [
  'Common Room',
  'Library',
  'Nescafe Corner',
  'Other',
] as const
export type RequestLocation = typeof REQUEST_LOCATIONS[number]

export interface InterestedSenior {
  senior_id: string
  name: string
  whatsapp: string
  phone: string
  interested_at: string
}

export interface MySlotRequest {
  id: string
  location: string
  preferred_at: string
  background: string
  description: string
  status: SlotRequestStatus
  matched_senior_id: string | null
  matched_at: string | null
  created_at: string
  interested_seniors: InterestedSenior[]
}

export interface OpenRequest {
  id: string
  location: string
  preferred_at: string
  background: string
  description: string
  created_at: string
  interest_count: number
  i_am_interested: boolean
}

/** Full payload from the confirm_slot RPC. `error` is set on the failure path. */
export interface ConfirmSlotResult {
  slot: ConfirmSlotSlot
  students: { name: string; email: string }[]
  to: string[]
  cc: string[]
  error?: string
}
