import { Skeleton } from '@/components/ui/skeleton'

export default function KnowledgeLoading() {
  return (
    <div className="mx-auto max-w-md px-4 pt-6 pb-nav">
      <Skeleton className="h-7 w-36 mb-1" />
      <Skeleton className="h-4 w-52 mb-4" />
      <div className="flex gap-2 mb-5">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-8 w-24 rounded-full" />
        ))}
      </div>
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border border-border/60 p-4 space-y-2">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <div className="flex items-center gap-2 pt-1">
              <Skeleton className="h-3.5 w-20" />
              <Skeleton className="h-3.5 w-16" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
