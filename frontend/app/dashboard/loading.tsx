export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-5xl animate-pulse space-y-6">
      {/* Tab strip skeleton */}
      <div className="flex gap-3">
        <div className="h-10 w-28 rounded-xl bg-muted" />
        <div className="h-10 w-28 rounded-xl bg-muted" />
        <div className="h-10 w-28 rounded-xl bg-muted" />
      </div>
      {/* Profile panel skeleton */}
      <div className="market-panel rounded-2xl p-6 space-y-5">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-full bg-muted" />
          <div className="space-y-2">
            <div className="h-5 w-40 rounded bg-muted" />
            <div className="h-4 w-28 rounded bg-muted" />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-1">
              <div className="h-3 w-24 rounded bg-muted" />
              <div className="h-9 w-full rounded-xl bg-muted" />
            </div>
          ))}
        </div>
        <div className="h-10 w-36 rounded-xl bg-muted" />
      </div>
    </div>
  );
}
