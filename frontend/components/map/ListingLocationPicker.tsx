"use client";

/**
 * ListingLocationPicker
 * Facebook-Marketplace-style location picker:
 *   1. Nominatim autocomplete at the top
 *   2. Leaflet map below with a draggable pin
 *   3. Click anywhere on the map → reverse geocode → update city/region/country
 *   4. Drag the pin → same reverse-geocode flow
 *   5. Select from autocomplete → pin snaps to result
 */

import * as React from "react";
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { LocationAutocomplete, type LocationValue } from "./LocationAutocomplete";

// Fix default marker icon (webpack strips the URL references)
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

export type PickedLocation = {
  lat: number;
  lng: number;
  city: string;
  region: string;
  country: string;
  postalCode: string;
  displayName: string;
};

/** Pans map to new coords whenever they change */
function PanTo({ coords }: { coords: [number, number] }) {
  const map = useMap();
  React.useEffect(() => {
    map.setView(coords, Math.max(map.getZoom(), 12), { animate: true });
  }, [coords, map]);
  return null;
}

/** Handles click-on-map events */
function ClickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

type Props = {
  /** Pre-fill the search box (e.g. from a saved draft) */
  initialValue?: string;
  /** Called whenever the selected location changes */
  onChange: (loc: PickedLocation) => void;
  height?: number;
};

async function reverseGeocode(lat: number, lng: number): Promise<PickedLocation> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`,
      {
        headers: {
          "Accept-Language": "en",
          "User-Agent": "Zonycs Marketplace/1.0",
        },
      }
    );
    if (!res.ok) throw new Error("reverse geocode failed");
    const data = await res.json() as {
      address?: {
        city?: string; town?: string; village?: string;
        state?: string; country?: string; postcode?: string;
      };
    };
    const addr = data.address ?? {};
    const city = addr.city || addr.town || addr.village || "";
    const region = addr.state || "";
    const country = addr.country || "";
    const postalCode = addr.postcode || "";
    const displayName = [city, region, country].filter(Boolean).join(", ");
    return { lat, lng, city, region, country, postalCode, displayName };
  } catch {
    return { lat, lng, city: "", region: "", country: "", postalCode: "", displayName: "" };
  }
}

export function ListingLocationPicker({ initialValue = "", onChange, height = 280 }: Props) {
  const DEFAULT_CENTER: [number, number] = [43.65, -79.38]; // Toronto
  const [coords, setCoords] = React.useState<[number, number]>(DEFAULT_CENTER);
  const [hasPin, setHasPin] = React.useState(false);
  const [locationLabel, setLocationLabel] = React.useState("");
  const [isPicking, setIsPicking] = React.useState(false);

  async function handleMapPick(lat: number, lng: number) {
    setCoords([lat, lng]);
    setHasPin(true);
    setIsPicking(true);
    const loc = await reverseGeocode(lat, lng);
    setIsPicking(false);
    setLocationLabel(loc.displayName);
    onChange(loc);
  }

  function handleAutocompleteSelect(loc: LocationValue) {
    const nextCoords: [number, number] = [loc.lat, loc.lng];
    setCoords(nextCoords);
    setHasPin(true);
    setLocationLabel(loc.displayName);
    onChange({
      lat: loc.lat,
      lng: loc.lng,
      city: loc.city,
      region: loc.region,
      country: loc.country,
      postalCode: loc.postalCode,
      displayName: loc.displayName,
    });
  }

  return (
    <div className="space-y-3">
      {/* Search bar */}
      <LocationAutocomplete
        label="Search for your listing location"
        placeholder="Type a city, neighbourhood, or postal code…"
        initialValue={initialValue}
        onSelect={handleAutocompleteSelect}
      />

      {/* Map */}
      <div
        className="relative overflow-hidden rounded-xl border border-border shadow-sm"
        style={{ height }}
      >
        <MapContainer
          center={DEFAULT_CENTER}
          zoom={4}
          scrollWheelZoom
          style={{ width: "100%", height: "100%" }}
          attributionControl={false}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          />
          <ClickHandler onPick={(lat, lng) => void handleMapPick(lat, lng)} />
          {hasPin && (
            <>
              <Marker
                position={coords}
                draggable
                eventHandlers={{
                  dragend(e) {
                    const latlng = (e.target as L.Marker).getLatLng();
                    void handleMapPick(latlng.lat, latlng.lng);
                  },
                }}
              />
              <PanTo coords={coords} />
            </>
          )}
        </MapContainer>

        {/* Overlay hint when no pin yet */}
        {!hasPin && (
          <div className="pointer-events-none absolute inset-0 z-[1000] flex items-center justify-center">
            <div className="rounded-xl bg-black/60 px-4 py-2.5 text-center text-sm font-medium text-white shadow-lg backdrop-blur-sm">
              Search above or click the map to set your location
            </div>
          </div>
        )}

        {/* Reverse-geocoding spinner */}
        {isPicking && (
          <div className="pointer-events-none absolute inset-0 z-[1001] flex items-center justify-center">
            <div className="flex items-center gap-2 rounded-xl bg-white/90 px-4 py-2.5 text-sm font-medium text-slate-800 shadow-lg backdrop-blur-sm">
              <svg className="h-4 w-4 animate-spin text-primary" viewBox="0 0 24 24" fill="none" aria-hidden>
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              Finding location…
            </div>
          </div>
        )}
      </div>

      {/* Confirmed location pill */}
      {hasPin && !isPicking && locationLabel && (
        <div className="flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
          <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 fill-primary" aria-hidden>
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
          </svg>
          <span className="font-medium text-primary">{locationLabel}</span>
          <span className="ml-auto text-xs text-muted-foreground">Drag pin or click map to adjust</span>
        </div>
      )}
    </div>
  );
}
