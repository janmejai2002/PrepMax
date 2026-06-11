'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  CalendarRange,
  BookOpen,
  MessageCircleQuestion,
  CircleUser,
  ShieldCheck,
  UserCheck,
  ClipboardList,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type Tab = { href: string; label: string; icon: React.FC<{ className?: string; strokeWidth?: number }> }

export function BottomNav({
  isAdmin = false,
  isMentor = false,
  isSenior = false,
  isCommittee = false,
}: {
  isAdmin?: boolean
  isMentor?: boolean
  isSenior?: boolean
  isCommittee?: boolean
}) {
  const pathname = usePathname()
  const requestsHref = isSenior ? '/requests' : '/my-requests'

  let tabs: Tab[]

  if (isCommittee) {
    // @xlri.ac.in shared accounts: Feed (read-only) + Knowledge + Doubts + optional Admin + Profile.
    tabs = [
      { href: '/', label: 'Feed', icon: CalendarRange },
      { href: '/knowledge', label: 'Knowledge', icon: BookOpen },
      { href: '/doubts', label: 'Doubts', icon: MessageCircleQuestion },
      ...(isAdmin ? [{ href: '/admin/stats', label: 'Admin', icon: ShieldCheck } as Tab] : []),
      { href: '/profile', label: 'Profile', icon: CircleUser },
    ]
  } else {
    // 5-tab base: Slots · Requests · Knowledge · Doubts · Profile
    // Role extras (Admin/Mentor) insert before Profile, keeping Profile always visible.
    const coreTabs: Tab[] = [
      { href: '/', label: 'Slots', icon: CalendarRange },
      { href: requestsHref, label: 'Requests', icon: ClipboardList },
      { href: '/knowledge', label: 'Knowledge', icon: BookOpen },
      { href: '/doubts', label: 'Doubts', icon: MessageCircleQuestion },
    ]
    const profileTab: Tab = { href: '/profile', label: 'Profile', icon: CircleUser }
    if (isAdmin) {
      // Admin supersedes Mentor — Admin tab + Profile = 6 tabs
      tabs = [...coreTabs, { href: '/admin/stats', label: 'Admin', icon: ShieldCheck }, profileTab]
    } else if (isMentor) {
      // Mentor: Mentees tab + Profile = 6 tabs, full senior nav preserved
      tabs = [...coreTabs, { href: '/mentor', label: 'Mentees', icon: UserCheck }, profileTab]
    } else {
      tabs = [...coreTabs, profileTab]
    }
  }

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-border/60 bg-background/80 backdrop-blur-xl pb-safe">
      <div className="mx-auto flex max-w-md items-stretch justify-around px-2">
        {tabs.map(({ href, label, icon: Icon }) => {
          const active =
            href === '/' ? pathname === '/' : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex min-w-14 flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors',
                active
                  ? 'text-foreground'
                  : 'text-muted-foreground/70 hover:text-muted-foreground'
              )}
            >
              <span
                className={cn(
                  'flex h-7 w-12 items-center justify-center rounded-full transition-colors',
                  active && 'bg-gd-soft text-gd'
                )}
              >
                <Icon className="h-[18px] w-[18px]" strokeWidth={active ? 2.2 : 1.8} />
              </span>
              {label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
