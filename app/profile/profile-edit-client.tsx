'use client'

import { useState, useTransition } from 'react'
import { Pencil, Check, X, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FUNCTION_TAGS } from '@/lib/types'
import { updateProfile } from './actions'

interface Props {
  ug_degree:  string | null
  short_bio:  string | null
  domain_1:   string | null
  domain_2:   string | null
}

export function ProfileEditClient({ ug_degree, short_bio, domain_1, domain_2 }: Props) {
  const [editing, setEditing] = useState(false)
  const [ugDegree, setUgDegree]   = useState(ug_degree ?? '')
  const [bioVal, setBioVal]       = useState(short_bio ?? '')
  const [d1, setD1]               = useState(domain_1 ?? '')
  const [d2, setD2]               = useState(domain_2 ?? '')
  const [err, setErr]             = useState('')
  const [isPending, startTransition] = useTransition()

  function cancel() {
    setUgDegree(ug_degree ?? '')
    setBioVal(short_bio ?? '')
    setD1(domain_1 ?? '')
    setD2(domain_2 ?? '')
    setErr('')
    setEditing(false)
  }

  function save() {
    if (d1 && d2 && d1 === d2) {
      setErr('Domain 1 and Domain 2 must be different.')
      return
    }
    setErr('')
    startTransition(async () => {
      const res = await updateProfile({ ug_degree: ugDegree, short_bio: bioVal, domain_1: d1, domain_2: d2 })
      if (res?.error) { setErr(res.error); return }
      setEditing(false)
    })
  }

  if (!editing) {
    return (
      <div className="mt-4 space-y-px overflow-hidden rounded-2xl border bg-card">
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3 text-sm">
          <span className="font-semibold text-foreground">About me</span>
          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
          >
            <Pencil className="h-3 w-3" />
            Edit
          </button>
        </div>
        {[
          ['UG Degree',         ug_degree],
          ['Short description', short_bio],
          ['Domain 1',          domain_1],
          ['Domain 2',          domain_2],
        ].map(([label, value]) => (
          <div
            key={label as string}
            className="flex items-center justify-between border-b border-border/60 px-4 py-3 text-sm last:border-0"
          >
            <span className="text-muted-foreground">{label as string}</span>
            <span className="max-w-[55%] truncate text-right font-medium">{value || '—'}</span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="mt-4 overflow-hidden rounded-2xl border bg-card">
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3 text-sm">
        <span className="font-semibold text-foreground">About me</span>
        <div className="flex items-center gap-2">
          <button onClick={cancel} disabled={isPending} className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary">
            <X className="h-4 w-4" />
          </button>
          <button
            onClick={save}
            disabled={isPending}
            className="flex items-center gap-1 rounded-full bg-gd px-3 py-1 text-[11px] font-bold text-white disabled:opacity-60"
          >
            {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            Save
          </button>
        </div>
      </div>

      <div className="space-y-3 p-4">
        <div>
          <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">UG Degree</label>
          <input
            value={ugDegree}
            onChange={e => setUgDegree(e.target.value)}
            placeholder="e.g. B.Tech CS, IIT Delhi"
            className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">Short description</label>
          <textarea
            value={bioVal}
            onChange={e => setBioVal(e.target.value)}
            placeholder="A quick note about your background or goals…"
            rows={3}
            className="w-full resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">Domain 1</label>
            <select
              value={d1}
              onChange={e => setD1(e.target.value)}
              className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">— none —</option>
              {FUNCTION_TAGS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">Domain 2</label>
            <select
              value={d2}
              onChange={e => setD2(e.target.value)}
              className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">— none —</option>
              {FUNCTION_TAGS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>

        {err && <p className="text-xs text-destructive">{err}</p>}
      </div>
    </div>
  )
}
