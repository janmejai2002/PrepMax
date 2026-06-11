'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  CalendarRange,
  BookOpen,
  MessageCircleQuestion,
  ShieldCheck,
  ClipboardList,
  Building2,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type Tab = {
  href: string
  label: string
  icon: React.FC<{ className?: string; strokeWidth?: number }>
}

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

  let tabs: Tab[]

  if (isSac) {
    tabs = [
      { href: '/admin/rooms', label: 'Rooms', icon: Building2 },
    ]
  } else if (isCrisp) {
    // CRISP: max 4 — Feed, Requests, Knowledge, Admin
    tabs = [
      { href: '/',             label: 'Feed',      icon: CalendarRange },
      { href: '/requests',     label: 'Requests',  icon: ClipboardList },
      { href: '/knowledge',    label: 'Knowledge', icon: BookOpen },
      { href: '/admin/stats',  label: 'Admin',     icon: ShieldCheck },
    ]
  } else if (isSenior) {
    tabs = [
      { href: '/',             label: 'Feed',      icon: CalendarRange },
      { href: '/requests',     label: 'Requests',  icon: ClipboardList },
      { href: '/knowledge',    label: 'Knowledge', icon: BookOpen },
      { href: '/doubts',       label: 'Doubts',    icon: MessageCircleQuestion },
    ]
  } else {
    // Junior
    tabs = [
      { href: '/',             label: 'Feed',      icon: CalendarRange },
      { href: '/my-requests',  label: 'Requests',  icon: ClipboardList },
      { href: '/knowledge',    label: 'Knowledge', icon: BookOpen },
      { href: '/doubts',       label: 'Doubts',    icon: MessageCircleQuestion },
    ]
  }

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-4"
      style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
    >
      <div
        className={cn(
          'flex items-stretch rounded-2xl border border-border/50 bg-card/95 shadow-xl shadow-black/10 backdrop-blur-xl',
          // SAC single-tab gets a narrower pill
          isSac ? 'w-auto px-2' : 'w-full max-w-sm',
        )}
      >
        {tabs.map(({ href, label, icon: Icon }, i) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
          const isFirst = i === 0
          const isLast = i === tabs.length - 1
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'group relative flex flex-1 flex-col items-center justify-center gap-[3px] py-3 transition-colors',
                isFirst && 'rounded-l-2xl',
                isLast && 'rounded-r-2xl',
                active ? 'text-gd' : 'text-muted-foreground/50 hover:text-muted-foreground',
              )}
            >
              {/* active background indicator */}
              {active && (
                <span className="absolute inset-x-1.5 inset-y-1.5 rounded-xl bg-gd-soft transition-all" />
              )}
              <Icon
                className={cn('relative transition-transform', active ? 'h-[19px] w-[19px]' : 'h-[18px] w-[18px]')}
                strokeWidth={active ? 2.3 : 1.7}
              />
              <span className={cn(
                'relative text-[10px] font-semibold tracking-wide leading-none transition-opacity',
                !active && 'opacity-60',
              )}>
                {label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
