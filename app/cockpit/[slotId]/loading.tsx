export default function Loading() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-md px-4 pt-5 space-y-4 animate-pulse">
        <div className="h-4 w-32 bg-muted rounded" />
        <div className="h-24 bg-muted rounded-lg" />
        <div className="h-48 bg-muted rounded-lg" />
        <div className="h-48 bg-muted rounded-lg" />
      </div>
    </div>
  )
}
