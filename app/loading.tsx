import { Skeleton } from '@/components/ui/skeleton'

export default function HomeLoading() {
  return (
    <div className="mx-auto max-w-md px-4 pt-6">
      <Skeleton className="h-4 w-28" />
      <Skeleton className="mt-2 h-7 w-40" />
      <Skeleton className="mt-5 h-11 w-full rounded-full" />
      <Skeleton className="mt-3 h-10 w-full rounded-full" />
      <div className="mt-4 space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-3 rounded-2xl border bg-card p-4">
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-10 rounded-md" />
              <Skeleton className="h-4 w-32" />
            </div>
            <Skeleton className="h-5 w-4/5" />
            <Skeleton className="h-4 w-3/5" />
            <div className="flex items-center justify-between border-t border-border/60 pt-3">
              <div className="flex items-center gap-2">
                <Skeleton className="h-7 w-7 rounded-full" />
                <Skeleton className="h-4 w-24" />
              </div>
              <Skeleton className="h-10 w-24 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
