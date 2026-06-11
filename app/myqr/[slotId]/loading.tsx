export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="space-y-4 text-center animate-pulse">
        <div className="mx-auto h-48 w-48 bg-muted rounded-lg" />
        <div className="mx-auto h-4 w-32 bg-muted rounded" />
      </div>
    </div>
  )
}
