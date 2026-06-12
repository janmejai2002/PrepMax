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
  isSenior = false,
  isSac = false,
  isCrisp = false,
  isCommittee = false,
}: {
  isSenior?: boolean
  isSac?: boolean
  isCrisp?: boolean
  isCommittee?: boolean
  // isAdmin kept for backwards-compat call sites; ignored (derived from isCrisp/isSac)
  isAdmin?: boolean
}) {
  const pathname = usePathname()

  // Capabilities are ADDITIVE. The nav shows the union of what each flag grants.
  // A senior with both SAC and CRISP sees Feed + Requests + Doubts + Admin (CRISP wins tab-4).
  const hasSeniorCapability = isSenior || isCrisp || isSac || isCommittee

  let tabs: Tab[]

  if (!hasSeniorCapability) {
    // Junior
    tabs = [
      { href: '/',             label: 'Feed',     icon: CalendarRange },
      { href: '/my-requests',  label: 'Requests', icon: ClipboardList },
      { href: '/knowledge',    label: 'Knowledge', icon: BookOpen },
      { href: '/doubts',       label: 'Doubts',   icon: MessageCircleQuestion },
    ]
  } else {
    // Senior base: Feed + Requests + Doubts (always present)
    // 4th tab is additive based on highest-priority capability:
    //   CRISP → Admin (/admin/stats, links to rooms/monitor/roles)
    //   SAC   → Rooms (/admin/rooms)
    //   base  → Knowledge (/knowledge)
    //   NOTE: Knowledge ambiguity flagged in Part C review — pending user confirmation
    //         to decide whether base seniors can VIEW knowledge without is_committee.
    //         For now Knowledge is kept as the fallback 4th tab.
    const tab4: Tab = isCrisp
      ? { href: '/admin/stats',  label: 'Admin',    icon: ShieldCheck }
      : isSac
      ? { href: '/admin/rooms',  label: 'Rooms',    icon: Building2 }
      : { href: '/knowledge',    label: 'Knowledge', icon: BookOpen }

    tabs = [
      { href: '/',          label: 'Feed',     icon: CalendarRange },
      { href: '/requests',  label: 'Requests', icon: ClipboardList },
      { href: '/doubts',    label: 'Doubts',   icon: MessageCircleQuestion },
      tab4,
    ]
  }

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-4"
      style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
    >
      <div className="flex w-full max-w-sm items-stretch rounded-2xl border border-border/50 bg-card/95 shadow-xl shadow-black/10 backdrop-blur-xl">
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
