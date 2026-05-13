"use client";

/**
 * useGeocoder — Nominatim (OpenStreetMap) geocoding hook.
 * Free, no API key required. Respects the 1 req/s usage policy via debounce.
 */

import * as React from "react";

export type GeoPoint = { lat: number; lng: number; displayName: string };

export type NominatimResult = {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  type: string;
  importance: number;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    county?: string;
    state?: string;
    country?: string;
    postcode?: string;
  };
};

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";
const DEBOUNCE_MS = 400;
const CACHE = new Map<string, NominatimResult[]>();

/** Forward geocode: query string → list of results */
export async function geocodeQuery(query: string): Promise<NominatimResult[]> {
  const q = query.trim();
  if (!q) return [];
  if (CACHE.has(q)) return CACHE.get(q)!;

  const url = `${NOMINATIM_BASE}/search?q=${encodeURIComponent(q)}&format=json&addressdetails=1&limit=5`;
  const res = await fetch(url, {
    headers: { "Accept-Language": "en", "User-Agent": "Zonycs-Marketplace/1.0" },
    signal: AbortSignal.timeout(6_000),
  });
  if (!res.ok) throw new Error(`Nominatim error: ${res.status}`);
  const data = (await res.json()) as NominatimResult[];
  CACHE.set(q, data);
  return data;
}

/** Reverse geocode: lat/lng → display name + address parts */
export async function reverseGeocode(lat: number, lng: number): Promise<NominatimResult | null> {
  const url = `${NOMINATIM_BASE}/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`;
  const res = await fetch(url, {
    headers: { "Accept-Language": "en", "User-Agent": "Zonycs-Marketplace/1.0" },
    signal: AbortSignal.timeout(6_000),
  });
  if (!res.ok) return null;
  return (await res.json()) as NominatimResult;
}

/** Extract city/town name from a Nominatim result */
export function cityFromResult(r: NominatimResult): string {
  const a = r.address ?? {};
  return a.city ?? a.town ?? a.village ?? a.county ?? "";
}

/** Extract region/province from a Nominatim result */
export function regionFromResult(r: NominatimResult): string {
  return r.address?.state ?? "";
}

/** Geocode a free-form location string (city + region + country).
 *  Returns the best-match lat/lng at neighbourhood zoom, or null. */
export async function geocodeLocation(location: string): Promise<GeoPoint | null> {
  try {
    const results = await geocodeQuery(location);
    if (!results.length) return null;
    const top = results[0];
    return {
      lat: parseFloat(top.lat),
      lng: parseFloat(top.lon),
      displayName: top.display_name,
    };
  } catch {
    return null;
  }
}

/** React hook: debounced forward geocode as user types */
export function useGeocoder(query: string) {
  const [results, setResults] = React.useState<NominatimResult[]>([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setResults([]);
      return;
    }
    if (CACHE.has(q)) {
      setResults(CACHE.get(q)!);
      return;
    }

    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const data = await geocodeQuery(q);
        setResults(data);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query]);

  return { results, loading };
}
