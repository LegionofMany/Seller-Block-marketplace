export type MarketplaceRouteFilters = {
  q?: string;
  category?: string;
  subcategory?: string;
  city?: string;
  region?: string;
  postalCode?: string;
  minPrice?: string;
  maxPrice?: string;
  type?: "fixed" | "auction" | "raffle";
  sort?: "newest" | "price_asc" | "price_desc";
  offset?: number;
};

export function buildMarketplaceHref(params?: MarketplaceRouteFilters | null) {
  const sp = new URLSearchParams();
  if (params?.q?.trim()) sp.set("q", params.q.trim());
  if (params?.category?.trim()) sp.set("category", params.category.trim());
  if (params?.subcategory?.trim()) sp.set("subcategory", params.subcategory.trim());
  if (params?.city?.trim()) sp.set("city", params.city.trim());
  if (params?.region?.trim()) sp.set("region", params.region.trim());
  if (params?.postalCode?.trim()) sp.set("postalCode", params.postalCode.trim());
  if (params?.minPrice?.trim()) sp.set("minPrice", params.minPrice.trim());
  if (params?.maxPrice?.trim()) sp.set("maxPrice", params.maxPrice.trim());
  if (params?.type) sp.set("type", params.type);
  if (params?.sort && params.sort !== "newest") sp.set("sort", params.sort);
  if ((params?.offset ?? 0) > 0) sp.set("offset", String(params?.offset ?? 0));
  const query = sp.toString();
  return query ? `/marketplace?${query}` : "/marketplace";
}