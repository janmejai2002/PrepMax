const TIME_FMT = new Intl.DateTimeFormat('en-IN', {
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
})

const DAY_FMT = new Intl.DateTimeFormat('en-IN', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
})

function startOfDay(d: Date) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

/** "Today · 9:30 pm", "Tomorrow · 10 am", "Fri 12 Jun · 5 pm" */
export function formatSlotTime(startAt: string): string {
  const start = new Date(startAt)
  const today = startOfDay(new Date())
  const slotDay = startOfDay(start)
  const diffDays = Math.round((slotDay.getTime() - today.getTime()) / 86_400_000)

  const time = TIME_FMT.format(start).replace(/\s/g, ' ')
  if (diffDays === 0) return `Today · ${time}`
  if (diffDays === 1) return `Tomorrow · ${time}`
  return `${DAY_FMT.format(start)} · ${time}`
}

/** Digits-only phone for wa.me links */
export function waPhone(raw: string | null): string | null {
  if (!raw) return null
  const digits = raw.replace(/\D/g, '')
  return digits.length >= 10 ? digits : null
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}
