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
  Users,
  User,
  Network,
  HelpCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type Tab = {
  href: string
  label: string
  icon: React.FC<{ className?: string; strokeWidth?: number }>
  /** extra paths that should also highlight this tab */
  alsoActive?: string[]
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
  // isAdmin kept for backwards-compat call sites; ignored
  isAdmin?: boolean
}) {
  const pathname = usePathname()

  const hasSeniorCapability = isSenior || isCrisp || isSac || isCommittee

  let tabs: Tab[]

  if (!hasSeniorCapability) {
    // ── Junior ──────────────────────────────────────────────────────────────
    tabs = [
      {
        href: '/ask',
        label: 'Ask a Senior',
        icon: HelpCircle,
        alsoActive: ['/my-requests'],
      },
      { href: '/knowledge', label: 'Domain', icon: BookOpen },
      { href: '/crisp-net', label: 'CRISPNet', icon: Network },
      { href: '/profile',   label: 'My Profile', icon: User },
    ]
  } else if (isCommittee && !isCrisp && !isSac) {
    // ── Committee-only ────────────────────────────────────────────────────────
    // Committee members focus on knowledge management; 2-tab nav
    tabs = [
      { href: '/knowledge', label: 'Knowledge', icon: BookOpen },
      { href: '/profile',   label: 'My Profile', icon: User },
    ]
  } else {
    // ── Senior (base / CRISP / SAC) ──────────────────────────────────────────
    // Capabilities are ADDITIVE. 4th tab set by highest-priority flag.
    const tab4: Tab = isCrisp
      ? { href: '/mentees',     label: 'Mentees', icon: Users }
      : isSac
      ? { href: '/admin/rooms', label: 'Rooms',   icon: Building2 }
      : { href: '/profile',     label: 'Profile', icon: User }

    tabs = [
      { href: '/',         label: 'Feed',     icon: CalendarRange },
      { href: '/requests', label: 'Requests', icon: ClipboardList },
      { href: '/doubts',   label: 'Q&A',      icon: MessageCircleQuestion },
      tab4,
    ]
  }

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-4"
      style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
    >
      <div className="flex w-full max-w-sm items-stretch rounded-2xl border border-border/50 bg-card/95 shadow-xl shadow-black/10 backdrop-blur-xl">
        {tabs.map(({ href, label, icon: Icon, alsoActive }, i) => {
          const active =
            href === '/'
              ? pathname === '/'
              : pathname.startsWith(href) ||
                (alsoActive?.some(p => pathname.startsWith(p)) ?? false)
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
