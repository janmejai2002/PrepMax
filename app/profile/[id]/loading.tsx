import { Skeleton } from '@/components/ui/skeleton'

export default function PublicProfileLoading() {
  return (
    <div className="min-h-screen bg-background pb-nav">
      <div className="mx-auto max-w-md px-4 pt-10">
        <div className="flex flex-col items-center gap-3 text-center mb-8">
          <Skeleton className="h-20 w-20 rounded-full" />
          <div className="flex flex-col items-center gap-1.5">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-24 rounded-full" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border border-border/60 p-3 text-center space-y-1">
              <Skeleton className="h-6 w-8 mx-auto" />
              <Skeleton className="h-3.5 w-16 mx-auto" />
            </div>
          ))}
        </div>
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="rounded-xl border border-border/60 p-4 space-y-2">
              <Skeleton className="h-5 w-1/2" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
