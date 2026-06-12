'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { MyRequestsClient } from '@/app/my-requests/my-requests-client'
import { DoubtsFeedClient } from '@/app/doubts/doubts-feed-client'
import type { MySlotRequest, Doubt } from '@/lib/types'

type Tab = 'practice' | 'qa'

interface Props {
  initialRequests: MySlotRequest[]
  initialDoubts: Doubt[]
  userName: string
  userId: string
  defaultTab?: Tab
}

export function AskClient({ initialRequests, initialDoubts, userName, userId, defaultTab = 'practice' }: Props) {
  const [tab, setTab] = useState<Tab>(defaultTab)

  return (
    <div className="mx-auto max-w-md">
      {/* Sub-tab bar */}
      <div className="sticky top-14 z-30 flex gap-1 border-b border-border/60 bg-background px-4 pt-2">
        {(['practice', 'qa'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'flex-1 pb-2.5 text-sm font-semibold transition-colors',
              tab === t
                ? 'border-b-2 border-gd text-gd'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {t === 'practice' ? 'Practice' : 'Q&A'}
          </button>
        ))}
      </div>

      {tab === 'practice' && (
        <MyRequestsClient initialRequests={initialRequests} userName={userName} />
      )}

      {tab === 'qa' && (
        <div className="pt-2">
          <DoubtsFeedClient initialDoubts={initialDoubts} myUserId={userId} />
        </div>
      )}
    </div>
  )
}
