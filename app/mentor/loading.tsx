import { Skeleton } from '@/components/ui/skeleton'

export default function MentorLoading() {
  return (
    <div className="mx-auto max-w-md px-4 pt-6 pb-nav">
      <div className="flex items-center gap-2 mb-6">
        <Skeleton className="h-8 w-8 rounded-full" />
        <div className="space-y-1">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-3.5 w-20" />
        </div>
      </div>
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-xl border border-border/60 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Skeleton className="h-8 w-8 rounded-full" />
                <div className="space-y-1">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-3.5 w-20" />
                </div>
              </div>
              <Skeleton className="h-5 w-12 rounded-full" />
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[1, 2, 3, 4].map((j) => (
                <div key={j} className="text-center space-y-1">
                  <Skeleton className="h-5 w-8 mx-auto" />
                  <Skeleton className="h-3 w-12 mx-auto" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
