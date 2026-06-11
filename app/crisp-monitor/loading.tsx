export default function Loading() {
  return (
    <div className="min-h-screen bg-background pb-nav">
      <div className="mx-auto max-w-md px-4 py-8 space-y-4">
        <div className="h-6 w-36 rounded-lg bg-muted animate-pulse" />
        <div className="h-4 w-48 rounded-lg bg-muted animate-pulse" />
        <div className="h-9 w-full rounded-xl bg-muted animate-pulse" />
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-16 rounded-2xl bg-muted animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  )
}
