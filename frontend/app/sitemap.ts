import type { MetadataRoute } from "next";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://www.zonycs.com";
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL?.trim() || "";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: `${BASE_URL}/`,
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: `${BASE_URL}/marketplace`,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/create`,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/sign-in`,
      changeFrequency: "weekly",
      priority: 0.5,
    },
  ];

  let listingRoutes: MetadataRoute.Sitemap = [];

  try {
    const res = await fetch(`${BACKEND_URL}/listings?limit=200&offset=0`, {
      next: { revalidate: 3600 },
    });
    if (res.ok) {
      const data = (await res.json()) as {
        items: Array<{ id: string; chainKey: string; updatedAt?: number; createdAt?: number }>;
      };
      listingRoutes = data.items.map((item) => ({
        url: `${BASE_URL}/listing/${item.id}?chain=${item.chainKey}`,
        changeFrequency: "daily" as const,
        priority: 0.7,
        lastModified: item.updatedAt
          ? new Date(item.updatedAt * 1000)
          : item.createdAt
          ? new Date(item.createdAt * 1000)
          : undefined,
      }));
    }
  } catch {
    // skip listing routes if fetch fails
  }

  return [...staticRoutes, ...listingRoutes];
}
