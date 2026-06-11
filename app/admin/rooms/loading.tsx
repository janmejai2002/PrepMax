export default function Loading() {
  return (
    <div className="min-h-screen bg-background pb-nav">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div className="h-6 w-32 rounded-lg bg-muted animate-pulse" />
        <div className="flex gap-2">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="flex-1 h-9 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-20 rounded-2xl bg-muted animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  )
}
