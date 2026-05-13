import type { Metadata } from "next";
import * as React from "react";

// ─── helpers ────────────────────────────────────────────────────────────────

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://www.zonycs.com";
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL?.trim() || "";

/** Convert an ipfs:// URI to a public HTTP gateway URL so OG scrapers can load it. */
function ipfsToHttp(uri: string | null | undefined): string {
  const clean = String(uri ?? "").trim();
  if (!clean) return "";
  if (!clean.toLowerCase().startsWith("ipfs://")) return clean;
  const cid = clean.slice("ipfs://".length).replace(/^ipfs\//i, "").replace(/^\/+/, "");
  const gateway = (process.env.NEXT_PUBLIC_IPFS_GATEWAY_BASE_URL ?? "https://gateway.pinata.cloud").replace(/\/$/, "");
  return `${gateway}/ipfs/${cid}`;
}

type ListingMetaShape = {
  id?: string;
  title?: string;
  description?: string;
  image?: string;
  city?: string;
  region?: string;
};

async function fetchListingMeta(id: string): Promise<ListingMetaShape | null> {
  if (!BACKEND_URL || !id) return null;
  try {
    const res = await fetch(`${BACKEND_URL.replace(/\/$/, "")}/metadata/${encodeURIComponent(id)}`, {
      next: { revalidate: 300 }, // cache for 5 minutes
    });
    if (!res.ok) return null;
    return (await res.json()) as ListingMetaShape;
  } catch {
    return null;
  }
}

// ─── generateMetadata ───────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const meta = await fetchListingMeta(id);

  if (!meta) {
    return {
      title: "Listing — Zonycs",
      description: "Browse listings on Zonycs, the free classifieds marketplace.",
    };
  }

  const title = meta.title?.trim() || "Listing on Zonycs";
  const location = [meta.city, meta.region].filter(Boolean).join(", ");
  const description = meta.description?.trim()
    ? `${meta.description.trim().slice(0, 155)}${meta.description.trim().length > 155 ? "…" : ""}`
    : location
      ? `${title} — listed in ${location} on Zonycs.`
      : `${title} — listed on Zonycs, the free classifieds marketplace.`;

  const imageHttp = ipfsToHttp(meta.image);
  const ogImage = imageHttp && !imageHttp.startsWith("/")
    ? imageHttp
    : `${BASE_URL}/og-image.png`;

  const canonical = `${BASE_URL}/listing/${id}`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: "website",
      url: canonical,
      siteName: "Zonycs",
      title,
      description,
      images: [{ url: ogImage, width: 800, height: 600, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

// ─── layout shell (pass-through) ────────────────────────────────────────────

export default function ListingDetailLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
