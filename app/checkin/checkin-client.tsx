'use client'

import Link from 'next/link'
import { ShieldCheck } from 'lucide-react'

// Self-check-in is permanently disabled (migration 019).
// Attendance is now marked by the host from the cockpit roster,
// or by the host scanning the junior's personal QR at /myqr/[slotId].
export function CheckinClient({ slotId }: { slotId: string; token?: string }) {
  return (
    <div className="space-y-6 text-center">
      <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
        <ShieldCheck className="h-8 w-8 text-success" />
      </span>
      <div>
        <h1 className="text-xl font-bold">Attendance is now secure</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Your host marks attendance directly — you no longer need to scan a QR yourself.
          Show your personal QR code to the host instead.
        </p>
      </div>
      <Link
        href={`/myqr/${slotId}`}
        className="inline-flex items-center justify-center h-11 w-full rounded-full bg-foreground text-background text-sm font-semibold"
      >
        Show my QR
      </Link>
      <Link href="/"
        className="block text-sm text-muted-foreground underline">
        Back to home
      </Link>
    </div>
  )
}
