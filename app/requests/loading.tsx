import { Skeleton } from '@/components/ui/skeleton'

export default function RequestsLoading() {
  return (
    <div className="mx-auto max-w-md px-4 pt-6 pb-nav">
      <Skeleton className="h-7 w-44 mb-1" />
      <Skeleton className="h-4 w-64 mb-5" />
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border border-border/60 p-4 space-y-3">
            <div className="flex justify-between">
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3.5 w-20" />
              </div>
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
            <div className="space-y-1">
              <Skeleton className="h-3.5 w-20" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-4/5" />
            </div>
            <Skeleton className="h-9 w-full rounded-md" />
          </div>
        ))}
      </div>
    </div>
  )
}
