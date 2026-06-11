import { Skeleton } from '@/components/ui/skeleton'

export default function SlotDetailLoading() {
  return (
    <div className="min-h-screen bg-background pb-nav">
      <div className="sticky top-0 z-10 border-b border-border/60 bg-background/80 backdrop-blur-xl px-4 py-3">
        <Skeleton className="h-5 w-24" />
      </div>
      <div className="mx-auto max-w-md px-4 pt-5 space-y-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-6 w-10 rounded-md" />
            <Skeleton className="h-5 w-48" />
          </div>
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-4 w-44" />
        </div>
        <Skeleton className="h-12 w-full rounded-xl" />
        <div className="rounded-xl border border-border/60 p-4 space-y-3">
          <Skeleton className="h-5 w-24" />
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-7 w-7 rounded-full" />
                  <Skeleton className="h-4 w-28" />
                </div>
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
