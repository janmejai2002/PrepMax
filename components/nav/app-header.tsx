'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { LogOut, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import { initials } from '@/lib/format'
import dynamic from 'next/dynamic'
import type { NavRole } from '@/lib/nav-role'

export type { NavRole }

const NotificationBell = dynamic(
  () => import('./notification-bell').then((m) => ({ default: m.NotificationBell })),
  { ssr: false }
)

const ROLE_META: Record<NavRole, { label: string; cls: string }> = {
  sac:    { label: 'SAC',    cls: 'bg-purple-500/15 text-purple-400 border border-purple-500/25' },
  crisp:  { label: 'CRISP',  cls: 'bg-amber-500/15 text-amber-400 border border-amber-500/25' },
  senior: { label: 'Senior', cls: 'bg-gd-soft text-gd border border-gd/20' },
  junior: { label: 'Junior', cls: 'bg-muted text-muted-foreground border border-border/60' },
}

export function AppHeader({ name, role }: { name: string; role: NavRole }) {
  const router = useRouter()
  const sb = createClient()
  const meta = ROLE_META[role]

  async function signOut() {
    await sb.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border/40 bg-background/85 backdrop-blur-xl">
      <div className="mx-auto flex h-[52px] max-w-md items-center justify-between px-4">
        <span className="text-[15px] font-bold tracking-tight select-none">PrepMax</span>

        <div className="flex items-center gap-1">
          <NotificationBell />

        <DropdownMenu>
          <DropdownMenuTrigger
            className="flex items-center gap-2 rounded-full pl-2 pr-1 py-1 hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold leading-tight', meta.cls)}>
              {meta.label}
            </span>
            <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-gd-soft text-gd text-[11px] font-bold ring-1 ring-gd/20">
              {initials(name)}
            </div>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-52">
            <div className="px-3 py-2">
              <p className="text-sm font-semibold leading-tight">{name}</p>
              <span className={cn('mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold', meta.cls)}>
                {meta.label}
              </span>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => router.push('/profile')}
              className="flex cursor-pointer items-center gap-2"
            >
              <User className="h-3.5 w-3.5" />
              My Profile
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={signOut}
              variant="destructive"
              className="flex cursor-pointer items-center gap-2"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        </div>
      </div>
    </header>
  )
}
