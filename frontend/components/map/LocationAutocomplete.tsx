"use client";

/**
 * LocationAutocomplete — Nominatim-powered address search field.
 * Fills in city, region, country, postalCode and lat/lng on selection.
 */

import * as React from "react";
import { useGeocoder, cityFromResult, regionFromResult, type NominatimResult } from "@/lib/hooks/useGeocoder";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export type LocationValue = {
  displayName: string;
  city: string;
  region: string;
  country: string;
  postalCode: string;
  lat: number;
  lng: number;
};

type Props = {
  label?: string;
  placeholder?: string;
  initialValue?: string;
  onSelect: (loc: LocationValue) => void;
  className?: string;
};

export function LocationAutocomplete({
  label = "Location",
  placeholder = "Type a city or address…",
  initialValue = "",
  onSelect,
  className,
}: Props) {
  const [query, setQuery] = React.useState(initialValue);
  const [open, setOpen] = React.useState(false);
  const [selected, setSelected] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const { results, loading } = useGeocoder(selected ? "" : query);

  // Close dropdown on outside click
  React.useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  React.useEffect(() => {
    if (results.length > 0 && !selected) setOpen(true);
    else if (!loading && results.length === 0) setOpen(false);
  }, [results, loading, selected]);

  function handleSelect(r: NominatimResult) {
    const city = cityFromResult(r);
    const region = regionFromResult(r);
    const country = r.address?.country ?? "";
    const postalCode = r.address?.postcode ?? "";
    const displayName = [city, region, country].filter(Boolean).join(", ");

    setQuery(displayName);
    setSelected(true);
    setOpen(false);

    onSelect({
      displayName,
      city,
      region,
      country,
      postalCode,
      lat: parseFloat(r.lat),
      lng: parseFloat(r.lon),
    });
  }

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {label && <Label className="mb-1.5 block">{label}</Label>}
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
          <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden>
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
          </svg>
        </span>
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(false);
          }}
          placeholder={placeholder}
          className="pl-9"
          autoComplete="off"
        />
        {loading && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2">
            <svg className="h-4 w-4 animate-spin text-muted-foreground" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
          </span>
        )}
      </div>

      {open && results.length > 0 && (
        <ul className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-border bg-popover shadow-xl">
          {results.map((r) => {
            const city = cityFromResult(r);
            const region = regionFromResult(r);
            const country = r.address?.country ?? "";
            const main = [city, region].filter(Boolean).join(", ");
            const sub = country;
            return (
              <li key={r.place_id}>
                <button
                  type="button"
                  className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-accent/40 focus:bg-accent/40 focus:outline-none"
                  onClick={() => handleSelect(r)}
                >
                  <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0 fill-primary" aria-hidden>
                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
                  </svg>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{main || r.display_name}</div>
                    {sub && <div className="truncate text-xs text-muted-foreground">{sub}</div>}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
