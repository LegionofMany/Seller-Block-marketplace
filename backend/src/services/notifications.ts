import { getContext } from "./context";
import { createNotification, listAllSavedSearches, queryListings, updateSavedSearchLastCheckedAt, type SavedSearchFilters } from "./db";

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

async function sendPostmarkEmail(to: string, subject: string, htmlBody: string, textBody: string) {
  const { env, logger } = getContext();
  if (!env.postmarkServerToken || !env.notificationEmailFrom) return;

  try {
    const res = await fetch("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Postmark-Server-Token": env.postmarkServerToken,
      },
      body: JSON.stringify({
        From: env.notificationEmailFrom,
        To: to,
        Subject: subject,
        HtmlBody: htmlBody,
        TextBody: textBody,
      }),
    });
    if (!res.ok) {
      logger.warn({ status: res.status, to }, "failed to send notification email");
    }
  } catch (err) {
    logger.warn({ err, to }, "notification email request failed");
  }
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
      const notification = await createNotification(db, {
        userAddress: search.userAddress,
        type: "saved_search_match",
        title: `New match for ${search.name}`,
        body: `Listing ${row.id} matched your saved search.` ,
        dedupeKey: `saved-search:${search.id}:listing:${row.chainKey}:${row.id}`,
        payload: {
          savedSearchId: search.id,
          listingId: row.id,
          chainKey: row.chainKey,
        },
        createdAt: now,
      });

      if (notification && search.email && env.frontendAppUrl) {
        const listingUrl = `${env.frontendAppUrl.replace(/\/$/, "")}/listing/${row.id}?chain=${encodeURIComponent(row.chainKey)}`;
        await sendPostmarkEmail(
          search.email,
          `Seller Block alert: ${search.name}`,
          `<p>A new listing matched your saved search <strong>${search.name}</strong>.</p><p><a href="${listingUrl}">Open listing</a></p>`,
          `A new listing matched your saved search ${search.name}: ${listingUrl}`
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

  const run = async () => {
    if (running) return;
    running = true;
    try {
      await processSavedSearches();
    } catch (err) {
      logger.warn({ err }, "saved search scan failed");
    } finally {
      running = false;
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
  };
}