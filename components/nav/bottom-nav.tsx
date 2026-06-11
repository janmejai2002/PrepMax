'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  CalendarRange,
  BookOpen,
  MessageCircleQuestion,
  CircleUser,
  ShieldCheck,
  ClipboardList,
  Building2,
  Eye,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type Tab = { href: string; label: string; icon: React.FC<{ className?: string; strokeWidth?: number }> }

export function BottomNav({
  isAdmin = false,
  isSenior = false,
  isSac = false,
  isCrisp = false,
}: {
  isAdmin?: boolean
  isSenior?: boolean
  isSac?: boolean
  isCrisp?: boolean
}) {
  const pathname = usePathname()
  const requestsHref = isSenior ? '/requests' : '/my-requests'

  let tabs: Tab[]

  if (isSac) {
    // SAC: Rooms only
    tabs = [
      { href: '/admin/rooms', label: 'Rooms', icon: Building2 },
    ]
  } else if (isCrisp) {
    // CRISP member: full senior nav + Rooms + Monitor
    tabs = [
      { href: '/', label: 'Slots', icon: CalendarRange },
      { href: '/requests', label: 'Requests', icon: ClipboardList },
      { href: '/knowledge', label: 'Knowledge', icon: BookOpen },
      { href: '/doubts', label: 'Doubts', icon: MessageCircleQuestion },
      { href: '/admin/rooms', label: 'Rooms', icon: Building2 },
      { href: '/crisp-monitor', label: 'Monitor', icon: Eye },
      { href: '/profile', label: 'Profile', icon: CircleUser },
    ]
  } else {
    // Junior / Senior: Slots · Requests · Knowledge · Doubts · [Admin] · Profile
    const coreTabs: Tab[] = [
      { href: '/', label: 'Slots', icon: CalendarRange },
      { href: requestsHref, label: 'Requests', icon: ClipboardList },
      { href: '/knowledge', label: 'Knowledge', icon: BookOpen },
      { href: '/doubts', label: 'Doubts', icon: MessageCircleQuestion },
    ]
    const profileTab: Tab = { href: '/profile', label: 'Profile', icon: CircleUser }
    if (isAdmin) {
      tabs = [...coreTabs, { href: '/admin/stats', label: 'Admin', icon: ShieldCheck }, profileTab]
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
