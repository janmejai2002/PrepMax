import { Skeleton } from '@/components/ui/skeleton'

export default function MyRequestsLoading() {
  return (
    <div className="mx-auto max-w-md px-4 pt-6 pb-nav">
      <div className="flex items-start justify-between mb-5">
        <div className="space-y-1">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-8 w-28 rounded-md" />
      </div>
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <div key={i} className="rounded-xl border border-border/60 p-4 space-y-3">
            <div className="flex justify-between">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ))}
      </div>
    </div>
  )
}
