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

const TABS = [
  { href: '/', label: 'Slots', icon: CalendarRange },
  { href: '/knowledge', label: 'Knowledge', icon: BookOpen },
  { href: '/doubts', label: 'Doubts', icon: MessageCircleQuestion },
  { href: '/profile', label: 'Profile', icon: CircleUser },
]

export function BottomNav({
  isAdmin = false,
  isMentor = false,
  isSenior = false,
}: {
  isAdmin?: boolean
  isMentor?: boolean
  isSenior?: boolean
}) {
  const pathname = usePathname()
  const requestsHref = isSenior ? '/requests' : '/my-requests'
  // 5-tab base: Slots · Requests · Knowledge · Doubts · Profile
  // Role extras (Admin/Mentor) replace Profile when active to stay at 5 tabs max
  const baseTabs = [
    { href: '/', label: 'Slots', icon: CalendarRange },
    { href: requestsHref, label: 'Requests', icon: ClipboardList },
    { href: '/knowledge', label: 'Knowledge', icon: BookOpen },
    { href: '/doubts', label: 'Doubts', icon: MessageCircleQuestion },
    { href: '/profile', label: 'Profile', icon: CircleUser },
  ]
  let tabs = [...baseTabs]
  if (isMentor && !isAdmin) {
    tabs = [...baseTabs.slice(0, 4), { href: '/mentor', label: 'Mentees', icon: UserCheck }]
  }
  if (isAdmin) {
    tabs = [...baseTabs.slice(0, 4), { href: '/admin/stats', label: 'Admin', icon: ShieldCheck }]
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
