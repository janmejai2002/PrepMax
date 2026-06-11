import { Skeleton } from '@/components/ui/skeleton'

export default function AdminStatsLoading() {
  return (
    <div className="mx-auto max-w-2xl px-4 pt-6 pb-nav">
      <Skeleton className="h-7 w-32 mb-1" />
      <Skeleton className="h-4 w-48 mb-6" />
      <div className="grid grid-cols-2 gap-3 mb-6">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-xl border border-border/60 p-4 space-y-1">
            <Skeleton className="h-8 w-12" />
            <Skeleton className="h-3.5 w-24" />
          </div>
        ))}
      </div>
      <Skeleton className="h-5 w-28 mb-3" />
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="rounded-lg border border-border/60 p-3 flex items-center justify-between">
            <div className="space-y-1">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3.5 w-20" />
            </div>
            <Skeleton className="h-5 w-14 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  )
}
