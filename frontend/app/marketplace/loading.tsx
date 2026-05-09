export default function MarketplaceLoading() {
  return (
    <div className="mx-auto w-full max-w-screen-xl animate-pulse">
      {/* Filter bar skeleton */}
      <div className="mb-6 flex flex-wrap gap-3">
        <div className="h-10 w-64 rounded-xl bg-muted" />
        <div className="h-10 w-32 rounded-xl bg-muted" />
        <div className="h-10 w-32 rounded-xl bg-muted" />
        <div className="h-10 w-28 rounded-xl bg-muted" />
      </div>
      {/* Listing card grid skeleton */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="market-panel overflow-hidden rounded-2xl"
          >
            <div className="aspect-[4/3] bg-muted" />
            <div className="p-4 space-y-2">
              <div className="h-4 w-3/4 rounded bg-muted" />
              <div className="h-3 w-1/2 rounded bg-muted" />
              <div className="h-5 w-1/3 rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
