export default function ListingLoading() {
  return (
    <div className="mx-auto max-w-5xl animate-pulse">
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        {/* Left: image + description */}
        <div className="space-y-4">
          <div className="aspect-[16/9] w-full rounded-2xl bg-muted" />
          <div className="market-panel rounded-2xl p-5 space-y-3">
            <div className="h-6 w-2/3 rounded bg-muted" />
            <div className="h-4 w-full rounded bg-muted" />
            <div className="h-4 w-5/6 rounded bg-muted" />
            <div className="h-4 w-4/6 rounded bg-muted" />
          </div>
        </div>
        {/* Right: price panel + seller */}
        <div className="space-y-4">
          <div className="market-panel rounded-2xl p-5 space-y-4">
            <div className="h-8 w-1/2 rounded bg-muted" />
            <div className="h-5 w-1/3 rounded bg-muted" />
            <div className="h-11 w-full rounded-xl bg-muted" />
            <div className="h-11 w-full rounded-xl bg-muted" />
          </div>
          <div className="market-panel rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-muted" />
              <div className="space-y-1">
                <div className="h-4 w-32 rounded bg-muted" />
                <div className="h-3 w-24 rounded bg-muted" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
