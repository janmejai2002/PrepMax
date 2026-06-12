'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { BookOpen } from 'lucide-react'
import Link from 'next/link'

export function DomainGateDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-2xl">
        <DialogHeader className="text-center pt-2">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gd-soft">
            <BookOpen className="h-6 w-6 text-gd" />
          </div>
          <DialogTitle className="text-lg">Set your domains first</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground text-center px-2">
          Set at least one domain of interest (e.g. Finance, Marketing) on your profile before you can host sessions or respond to practice requests.
        </p>
        <p className="text-xs text-muted-foreground text-center px-2 mt-1">
          This helps juniors find the right senior for their prep area.
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <Link href="/profile" onClick={() => onOpenChange(false)}>
            <Button className="w-full bg-gd hover:bg-gd/90 text-white">
              Go to my profile
            </Button>
          </Link>
          <Button variant="ghost" className="w-full" onClick={() => onOpenChange(false)}>
            Maybe later
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
