"use client";

/**
 * MarketplaceMapView — clustered map of all visible listings for the browse page.
 * Each pin opens a compact card; clicking navigates to the full listing.
 * When userCoords is supplied the map centers on the user's location instead
 * of fitting all markers, and a pulsing "you are here" indicator is rendered.
 */

import * as React from "react";
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import Link from "next/link";

import { buildListingHref } from "@/lib/listings";
import { formatPrice } from "@/lib/format";
import { zeroAddress } from "viem";

delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

export type MapListing = {
  id: string;
  chainKey: string;
  title: string;
  price: bigint;
  token: string;
  lat: number;
  lng: number;
  imageUrl?: string;
  city?: string;
  region?: string;
};

/** Fit all listing markers into view — only runs when no userCoords is provided. */
function FitBounds({ listings }: { listings: MapListing[] }) {
  const map = useMap();
  React.useEffect(() => {
    if (!listings.length) return;
    const bounds = L.latLngBounds(listings.map((l) => [l.lat, l.lng]));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
  }, [listings, map]);
  return null;
}

/** Center and zoom on the user's GPS-detected coordinates (zoom 12 = neighbourhood). */
function CenterOnUser({ coords }: { coords: { lat: number; lng: number } }) {
  const map = useMap();
  React.useEffect(() => {
    map.setView([coords.lat, coords.lng], 12, { animate: true });
  }, [coords, map]);
  return null;
}

/** Pan to a region/country without showing any "you are here" indicator.
 *  Uses the supplied zoom level (country≈5, province≈7, city≈11). */
function PanToRegion({ coords }: { coords: { lat: number; lng: number; zoom: number } }) {
  const map = useMap();
  React.useEffect(() => {
    map.setView([coords.lat, coords.lng], coords.zoom, { animate: true });
  }, [coords, map]);
  return null;
}

type Props = {
  listings: MapListing[];
  /** Optional explicit height in px. Omit to use responsive CSS height. */
  height?: number;
  /** GPS-detected user location — shows blue dot + "Your location" pill. */
  userCoords?: { lat: number; lng: number } | null;
  /** Region/country geocode result — pans map without the GPS indicator. */
  regionCoords?: { lat: number; lng: number; zoom: number } | null;
};

export function MarketplaceMapView({ listings, height, userCoords, regionCoords }: Props) {
  // Responsive height: 380px on mobile (<640px), 560px on desktop
  const [mapHeight, setMapHeight] = React.useState(height ?? 520);
  React.useEffect(() => {
    if (height !== undefined) { setMapHeight(height); return; }
    function update() {
      setMapHeight(window.innerWidth < 640 ? 380 : 560);
    }
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [height]);

  const center: [number, number] = userCoords
    ? [userCoords.lat, userCoords.lng]
    : regionCoords
      ? [regionCoords.lat, regionCoords.lng]
      : listings.length > 0
        ? [
            listings.reduce((s, l) => s + l.lat, 0) / listings.length,
            listings.reduce((s, l) => s + l.lng, 0) / listings.length,
          ]
        : [43.65, -79.38]; // Toronto fallback

  return (
    <div
      className="relative overflow-hidden rounded-xl border border-border"
      style={{ height: mapHeight }}
    >
      <MapContainer
        center={center}
        zoom={userCoords ? 12 : 10}
        scrollWheelZoom
        style={{ width: "100%", height: "100%" }}
        attributionControl={false}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />

        {/* User location indicator — outer accuracy ring + inner dot */}
        {userCoords && (
          <>
            <Circle
              center={[userCoords.lat, userCoords.lng]}
              radius={800}
              pathOptions={{
                color: "#2563eb",
                fillColor: "#3b82f6",
                fillOpacity: 0.12,
                weight: 1.5,
              }}
            />
            <Circle
              center={[userCoords.lat, userCoords.lng]}
              radius={60}
              pathOptions={{
                color: "#1d4ed8",
                fillColor: "#2563eb",
                fillOpacity: 0.9,
                weight: 2,
              }}
            />
          </>
        )}

        {/* Listing markers */}
        {listings.map((listing) => {
          const isNative = listing.token === zeroAddress;
          return (
            <Marker key={listing.id} position={[listing.lat, listing.lng]}>
              <Popup minWidth={200} maxWidth={260} className="leaflet-popup-zonycs">
                <div className="flex flex-col gap-2 py-1">
                  {listing.imageUrl && (
                    <div className="overflow-hidden rounded-md" style={{ height: 100 }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={listing.imageUrl}
                        alt={listing.title}
                        className="h-full w-full object-cover"
                      />
                    </div>
                  )}
                  <div className="font-semibold leading-snug text-sm line-clamp-2">
                    {listing.title}
                  </div>
                  <div className="text-base font-bold text-primary">
                    {formatPrice(listing.price, isNative)}
                  </div>
                  {(listing.city || listing.region) && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <svg viewBox="0 0 24 24" className="h-3 w-3 shrink-0 fill-current" aria-hidden>
                        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
                      </svg>
                      {[listing.city, listing.region].filter(Boolean).join(", ")}
                    </div>
                  )}
                  <Link
                    href={buildListingHref(listing.id, listing.chainKey)}
                    className="mt-1 block rounded-lg bg-primary px-3 py-1.5 text-center text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
                  >
                    View listing →
                  </Link>
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* Pan/zoom priority: GPS user location > region geocode > fit all listing pins */}
        {userCoords
          ? <CenterOnUser coords={userCoords} />
          : regionCoords
            ? <PanToRegion coords={regionCoords} />
            : listings.length > 1 && <FitBounds listings={listings} />
        }
      </MapContainer>

      {listings.length === 0 && (
        <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-background/60 backdrop-blur-sm">
          <p className="text-sm text-muted-foreground">No listings with location data to show</p>
        </div>
      )}

      {/* "You are here" pill — only for real GPS, not region geocodes */}
      {userCoords && (
        <div className="absolute bottom-3 left-3 z-[1000] flex items-center gap-1.5 rounded-full bg-blue-600 px-3 py-1 text-[11px] font-semibold text-white shadow-md">
          <span className="inline-block h-2 w-2 rounded-full bg-white opacity-90" />
          Your location
        </div>
      )}
      {/* Region pill — shown when a country/province is selected (not GPS) */}
      {!userCoords && regionCoords && (
        <div className="absolute bottom-3 left-3 z-[1000] flex items-center gap-1.5 rounded-full bg-slate-700 px-3 py-1 text-[11px] font-semibold text-white shadow-md">
          <svg viewBox="0 0 24 24" className="h-3 w-3 fill-white opacity-80" aria-hidden>
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
          </svg>
          Filtered region
        </div>
      )}
    </div>
  );
}
