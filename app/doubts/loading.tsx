import { Skeleton } from '@/components/ui/skeleton'

export default function DoubtsLoading() {
  return (
    <div className="mx-auto max-w-md px-4 pt-6 pb-nav">
      <Skeleton className="h-7 w-28 mb-1" />
      <Skeleton className="h-4 w-48 mb-4" />
      <div className="flex gap-2 mb-5">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-8 w-20 rounded-full" />
        ))}
      </div>
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-xl border border-border/60 p-4 space-y-2">
            <Skeleton className="h-5 w-4/5" />
            <Skeleton className="h-4 w-full" />
            <div className="flex items-center justify-between pt-2">
              <div className="flex gap-3">
                <Skeleton className="h-4 w-12" />
                <Skeleton className="h-4 w-14" />
              </div>
              <Skeleton className="h-4 w-16" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
