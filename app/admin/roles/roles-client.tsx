'use client'

import { useState, useTransition, useMemo } from 'react'
import { Search, ChevronDown, ChevronUp } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { updateUserFlags, type ProfileRow, type RoleFlags } from './actions'

const FLAG_DEFS: { key: keyof RoleFlags; label: string; color: string }[] = [
  { key: 'can_host_gd',   label: 'GD Host',    color: 'bg-gd-soft text-gd' },
  { key: 'can_host_pi',   label: 'PI Host',     color: 'bg-pi-soft text-pi' },
  { key: 'is_crisp',      label: 'CRISP',       color: 'bg-amber-500/20 text-amber-500' },
  { key: 'is_sac',        label: 'SAC',         color: 'bg-purple-500/20 text-purple-400' },
  { key: 'is_committee',  label: 'Committee',   color: 'bg-sky-500/20 text-sky-400' },
]

function FlagChip({
  flagKey, label, color, value, onChange, pending,
}: {
  flagKey: keyof RoleFlags
  label: string
  color: string
  value: boolean
  onChange: (key: keyof RoleFlags, val: boolean) => void
  pending: boolean
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(flagKey, !value)}
      disabled={pending}
      className={cn(
        'rounded-full px-2 py-0.5 text-[10px] font-semibold border transition-all',
        value ? color + ' border-transparent' : 'bg-background text-muted-foreground/60 border-border',
        pending && 'opacity-50 cursor-not-allowed'
      )}
    >
      {label}
    </button>
  )
}

function UserRow({ profile }: { profile: ProfileRow }) {
  const [flags, setFlags] = useState<RoleFlags>({
    can_host_gd:   profile.can_host_gd,
    can_host_pi:   profile.can_host_pi,
    is_crisp:      profile.is_crisp,
    is_sac:        profile.is_sac,
    is_committee:  profile.is_committee,
  })
  const [expanded, setExpanded] = useState(false)
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  function handleFlag(key: keyof RoleFlags, val: boolean) {
    const next = { ...flags, [key]: val }
    setFlags(next)
    setError('')
    startTransition(async () => {
      const result = await updateUserFlags(profile.id, { [key]: val })
      if (result.error) {
        setFlags(flags)
        setError(result.error)
      }
    })
  }

  const yearLabel = profile.year === 'second' ? 'Senior' : profile.year === 'first' ? 'Junior' : 'Committee'

  return (
    <div className="rounded-2xl border bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-secondary/30 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{profile.name}</p>
          <p className="text-[11px] text-muted-foreground truncate">{profile.email}</p>
        </div>
        <span className={cn(
          'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold',
          profile.year === 'second' ? 'bg-gd-soft text-gd'
          : profile.year === 'first' ? 'bg-muted text-muted-foreground'
          : 'bg-amber-500/15 text-amber-600'
        )}>
          {yearLabel}
        </span>
        {expanded ? <ChevronUp className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
      </button>

      {expanded && (
        <div className="px-4 pb-3 border-t border-border/60 pt-3 space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {FLAG_DEFS.map(({ key, label, color }) => (
              <FlagChip
                key={key}
                flagKey={key}
                label={label}
                color={color}
                value={flags[key]}
                onChange={handleFlag}
                pending={isPending}
              />
            ))}
          </div>
          {error && <p className="text-[11px] text-destructive">{error}</p>}
          {isPending && <p className="text-[11px] text-muted-foreground">Saving…</p>}
        </div>
      )}
    </div>
  )
}

export function RolesClient({ profiles }: { profiles: ProfileRow[] }) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return profiles
    return profiles.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.email.toLowerCase().includes(q) ||
      (p.batch ?? '').toLowerCase().includes(q)
    )
  }, [profiles, query])

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by name, email or batch…"
          className="pl-9 h-10"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>
      <p className="text-[11px] text-muted-foreground">
        {filtered.length} user{filtered.length !== 1 ? 's' : ''} — tap a row to expand and toggle flags
      </p>
      <div className="space-y-2">
        {filtered.map(p => <UserRow key={p.id} profile={p} />)}
      </div>
    </div>
  )
}
