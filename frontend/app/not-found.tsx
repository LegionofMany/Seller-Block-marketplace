import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-6 text-center">
      {/* Z logo mark */}
      <div
        className="flex h-20 w-20 items-center justify-center rounded-3xl text-4xl font-black text-white"
        style={{ background: "linear-gradient(135deg, #0ea5c9 0%, #10b981 100%)" }}
      >
        Z
      </div>

      <div>
        <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          404 — Page not found
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">
          This page doesn&apos;t exist
        </h1>
        <p className="mt-3 max-w-md text-muted-foreground">
          The listing, seller, or page you were looking for has been removed,
          expired, or never existed. Try searching the marketplace.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button asChild className="rounded-xl">
          <Link href="/marketplace">Browse listings</Link>
        </Button>
        <Button asChild variant="outline" className="rounded-xl">
          <Link href="/">Home</Link>
        </Button>
        <Button asChild variant="outline" className="rounded-xl">
          <Link href="/create">Post an ad</Link>
        </Button>
      </div>
    </div>
  );
}
