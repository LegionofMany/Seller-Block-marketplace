export function normalizeChainKey(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length ? trimmed : undefined;
}

export function buildListingReportTargetId(chainKey: string, listingId: string) {
  return `${chainKey}:${listingId}`;
}
