export default function Loading() {
  return (
    <div className="min-h-screen bg-background pb-nav">
      <div className="mx-auto max-w-md px-4 pt-6 space-y-4">
        <div className="h-6 w-48 rounded-lg bg-muted animate-pulse" />
        <div className="h-4 w-64 rounded bg-muted animate-pulse" />
        <div className="flex gap-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="flex-1 h-9 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
        <div className="h-10 rounded-xl bg-muted animate-pulse" />
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-16 rounded-2xl bg-muted animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  )
}
