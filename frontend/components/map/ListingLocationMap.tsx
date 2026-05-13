"use client";

/**
 * ListingLocationMap — neighbourhood-level map pin for the listing detail page.
 * Dynamically imported (ssr:false) to avoid Leaflet's window dependency.
 */

import * as React from "react";
import { MapContainer, TileLayer, Marker, Circle, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix webpack/Next.js marker icon issue
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

type Props = {
  lat: number;
  lng: number;
  /** Display label shown in the map attribution area */
  label?: string;
  /** Zoom level — default 13 (neighbourhood) for privacy */
  zoom?: number;
  /** Show a fuzzy radius circle instead of a precise pin */
  fuzzy?: boolean;
};

function RecenterOnLoad({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  React.useEffect(() => {
    map.setView([lat, lng]);
  }, [lat, lng, map]);
  return null;
}

export function ListingLocationMap({ lat, lng, label, zoom = 13, fuzzy = true }: Props) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-border" style={{ height: 260 }}>
      <MapContainer
        center={[lat, lng]}
        zoom={zoom}
        scrollWheelZoom={false}
        zoomControl={true}
        style={{ width: "100%", height: "100%" }}
        attributionControl={false}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />
        {fuzzy ? (
          <>
            {/* Translucent radius circle — hides exact location */}
            <Circle
              center={[lat, lng]}
              radius={400}
              pathOptions={{ color: "#0ea5e9", fillColor: "#0ea5e9", fillOpacity: 0.12, weight: 1.5 }}
            />
            <Marker position={[lat, lng]} />
          </>
        ) : (
          <Marker position={[lat, lng]} />
        )}
        <RecenterOnLoad lat={lat} lng={lng} />
      </MapContainer>
      {label && (
        <div className="absolute bottom-0 left-0 right-0 z-[1000] flex items-center gap-1.5 bg-background/90 px-3 py-2 text-xs text-muted-foreground backdrop-blur-sm">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 fill-primary" aria-hidden>
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
          </svg>
          {label}
          <span className="ml-auto italic opacity-70">Approximate area shown</span>
        </div>
      )}
    </div>
  );
}
