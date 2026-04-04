export function buildListingHref(listingId: string, chainKey?: string | null) {
  if (!chainKey) return `/listing/${listingId}`;
  return `/listing/${listingId}?chain=${encodeURIComponent(chainKey)}`;
}
