import { Skeleton } from '@/components/ui/skeleton'

export default function ProfileLoading() {
  return (
    <div className="mx-auto max-w-md px-4 pt-10 pb-nav">
      <div className="flex flex-col items-center gap-3 text-center mb-8">
        <Skeleton className="h-20 w-20 rounded-full" />
        <div className="flex flex-col items-center gap-1.5">
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-4 w-44" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-6 w-16 rounded-full" />
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
      </div>
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border border-border/60 p-4 space-y-2">
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ))}
      </div>
    </div>
  )
}
