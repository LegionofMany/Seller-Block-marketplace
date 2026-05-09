import type { MetadataRoute } from "next";

const BASE_URL = "https://www.zonycs.com";

async function fetchRecentListingIds(): Promise<
  Array<{ id: string; chainKey: string; updatedAt?: number }>
> {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_BASE_URL ?? 
        "https://seller-block-marketplace-4.onrender.com"
      }/listings?limit=200&offset=0&sort=newest`,
      {
        next: { revalidate: 3600 }, // revalidate every hour
      }
    );
    if (!res.ok) return [];
    const data = await res.json() as {
      items?: Array<{
        id: string;
        chainKey: string;
        updatedAt?: number;
        createdAt?: number;
      }>;
    };
    return (data.items ?? []).map((item) => ({
      id: item.id,
      chainKey: item.chainKey ?? "base-sepolia",
      updatedAt: item.updatedAt ?? item.createdAt,
    }));
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: BASE_URL,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: `${BASE_URL}/marketplace`,
      lastModified: new Date(),
      changeFrequency: "hourly",
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/create`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${BASE_URL}/sign-in`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.3,
    },
  ];

  // Fetch dynamic listing URLs
  const listings = await fetchRecentListingIds();

  const listingRoutes: MetadataRoute.Sitemap = listings.map(
    (listing) => ({
      url: `${BASE_URL}/listing/${listing.id}` + `?chain=${listing.chainKey}`,
      lastModified: listing.updatedAt ? new Date(listing.updatedAt) : new Date(),
      changeFrequency: "daily" as const,
      priority: 0.8,
    })
  );

  return [...staticRoutes, ...listingRoutes];
}
