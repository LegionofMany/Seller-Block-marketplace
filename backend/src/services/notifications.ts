import { getContext } from "./context";
import { createNotification, listAllSavedSearches, queryListings, updateSavedSearchLastCheckedAt, type SavedSearchFilters } from "./db";
import { sendTransactionalEmail } from "./email";

export type NotificationsWorkerStatus = {
  running: boolean;
  lastSuccessAt?: number;
  lastFailureAt?: number;
  lastError?: string;
};

function formatLocationLabel(input: { city?: string | null; region?: string | null; postalCode?: string | null }) {
  return [input.city, input.region, input.postalCode].filter(Boolean).join(", ");
}

function formatSavedSearchAlert(row: {
  id: string;
  title?: string | null;
  category?: string | null;
  subcategory?: string | null;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
}, searchName: string) {
  const listingTitle = row.title?.trim() || "New listing";
  const locationLabel = formatLocationLabel(row);
  const categoryLabel = [row.category, row.subcategory].filter(Boolean).join(" • ");

  const title = row.title?.trim()
    ? `${listingTitle} matched ${searchName}`
    : `New match for ${searchName}`;

  const detailParts = [categoryLabel, locationLabel].filter(Boolean);
  const body = detailParts.length > 0
    ? `${listingTitle} matched your saved search. ${detailParts.join(". ")}.`
    : `${listingTitle} matched your saved search.`;

  const emailSubject = `${title} | Seller Block alerts`;
  const emailIntro = body;
  const emailHtml = [
    `<p>${emailIntro}</p>`,
    `<p>Saved search: <strong>${searchName}</strong></p>`,
  ].join("");
  const emailText = `${emailIntro}\nSaved search: ${searchName}`;

  return { title, body, emailSubject, emailHtml, emailText };
}

function buildMarketplacePath(filters: SavedSearchFilters) {
  const sp = new URLSearchParams();
  if (filters.q?.trim()) sp.set("q", filters.q.trim());
  if (filters.category?.trim()) sp.set("category", filters.category.trim());
  if (filters.subcategory?.trim()) sp.set("subcategory", filters.subcategory.trim());
  if (filters.city?.trim()) sp.set("city", filters.city.trim());
  if (filters.region?.trim()) sp.set("region", filters.region.trim());
  if (filters.postalCode?.trim()) sp.set("postalCode", filters.postalCode.trim());
  if (filters.minPrice?.trim()) sp.set("minPrice", filters.minPrice.trim());
  if (filters.maxPrice?.trim()) sp.set("maxPrice", filters.maxPrice.trim());
  if (filters.type) sp.set("type", filters.type);
  if (filters.sort && filters.sort !== "newest") sp.set("sort", filters.sort);
  const query = sp.toString();
  return query ? `/marketplace?${query}` : "/marketplace";
}

function parseOptionalBigInt(value: string | undefined): bigint | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (!/^\d+$/.test(trimmed)) return undefined;
  try {
    return BigInt(trimmed);
  } catch {
    return undefined;
  }
}

function saleTypeFromSavedSearch(value: SavedSearchFilters["type"]): number | undefined {
  if (!value) return undefined;
  if (value === "fixed") return 0;
  if (value === "auction") return 1;
  if (value === "raffle") return 2;
  return undefined;
}

async function processSavedSearches() {
  const { db, env, logger } = getContext();
  const searches = await listAllSavedSearches(db);
  const now = Date.now();

  for (const search of searches) {
    const rows = await queryListings(db, {
      saleType: saleTypeFromSavedSearch(search.filters.type),
      active: true,
      createdAfter: search.lastCheckedAt || search.createdAt,
      minPrice: parseOptionalBigInt(search.filters.minPrice),
      maxPrice: parseOptionalBigInt(search.filters.maxPrice),
      ...(search.filters.q ? { q: search.filters.q } : {}),
      ...(search.filters.category ? { category: search.filters.category } : {}),
      ...(search.filters.subcategory ? { subcategory: search.filters.subcategory } : {}),
      ...(search.filters.city ? { city: search.filters.city } : {}),
      ...(search.filters.region ? { region: search.filters.region } : {}),
      ...(search.filters.postalCode ? { postalCode: search.filters.postalCode } : {}),
      sort: "newest",
      limit: 10,
      offset: 0,
    });

    for (const row of rows) {
      const marketplacePath = buildMarketplacePath(search.filters);
      const alertCopy = formatSavedSearchAlert(row, search.name);
      const notification = await createNotification(db, {
        userAddress: search.userAddress,
        type: "saved_search_match",
        title: alertCopy.title,
        body: alertCopy.body,
        dedupeKey: `saved-search:${search.id}:listing:${row.chainKey}:${row.id}`,
        payload: {
          savedSearchId: search.id,
          savedSearchName: search.name,
          marketplaceHref: marketplacePath,
          filters: search.filters,
          listingId: row.id,
          chainKey: row.chainKey,
          listingTitle: row.title ?? null,
          category: row.category ?? null,
          city: row.city ?? null,
          region: row.region ?? null,
        },
        createdAt: now,
      });

      if (notification && search.email && env.frontendAppUrl) {
        const listingUrl = `${env.frontendAppUrl.replace(/\/$/, "")}/listing/${row.id}?chain=${encodeURIComponent(row.chainKey)}`;
        const marketplaceUrl = `${env.frontendAppUrl.replace(/\/$/, "")}${marketplacePath}`;
        await sendTransactionalEmail(
          search.email,
          alertCopy.emailSubject,
          `${alertCopy.emailHtml}<p><a href="${listingUrl}">Open listing</a></p><p><a href="${marketplaceUrl}">Open matching marketplace results</a></p>`,
          `${alertCopy.emailText}\nOpen listing: ${listingUrl}\nMatching results: ${marketplaceUrl}`
        );
      }
    }

    await updateSavedSearchLastCheckedAt(db, search.id, now);
  }

  logger.debug({ searchCount: searches.length }, "saved search scan complete");
}

export function startNotificationsWorker() {
  const { env, logger } = getContext();
  let timer: NodeJS.Timeout | null = null;
  let running = false;
  const status: NotificationsWorkerStatus = {
    running: false,
  };

  const run = async () => {
    if (running) return;
    running = true;
    status.running = true;
    try {
      await processSavedSearches();
      status.lastSuccessAt = Date.now();
      delete status.lastError;
    } catch (err) {
      status.lastFailureAt = Date.now();
      status.lastError = err instanceof Error ? err.message : String(err);
      logger.warn({ err }, "saved search scan failed");
    } finally {
      running = false;
      status.running = false;
    }
  };

  void run();
  timer = setInterval(() => {
    void run();
  }, Math.max(env.notificationsScanMs, 15_000));

  return {
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
    getStatus() {
      return { ...status };
    },
  };
}