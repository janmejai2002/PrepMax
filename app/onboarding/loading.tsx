export default function Loading() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-full max-w-sm px-6 space-y-4">
        <div className="h-7 w-40 rounded-lg bg-muted animate-pulse mx-auto" />
        <div className="h-4 w-56 rounded-lg bg-muted animate-pulse mx-auto" />
        <div className="space-y-3 pt-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-10 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
        <div className="h-11 rounded-xl bg-muted animate-pulse" />
      </div>
    </div>
  )
}
