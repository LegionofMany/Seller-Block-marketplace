import fs from "node:fs";
import path from "node:path";
import { Pool } from "pg";

export type ListingRow = {
  chainKey: string;
  chainId: number;
  id: string;
  seller: string;
  metadataURI: string;
  price: string;
  token: string;
  saleType: number;
  active: 0 | 1;
  createdAt: number;
  blockNumber: number;
};

export type AuctionRow = {
  chainKey: string;
  listingId: string;
  highestBid: string;
  highestBidder: string;
  endTime: number;
};

export type RaffleRow = {
  chainKey: string;
  listingId: string;
  ticketsSold: number;
  endTime: number;
};

export type MetadataRow = {
  id: string;
  uri?: string;
  title: string;
  description: string;
  image: string;
  imagesJson?: string;
  category?: string | null;
  subcategory?: string | null;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  attributesJson: string;
  createdAt: number;
};

export type UserRow = {
  address: string;
  fullName?: string | null;
  displayName?: string | null;
  bio?: string | null;
  avatarCid?: string | null;
  email?: string | null;
  emailVerifiedAt?: number | null;
  sellerVerifiedAt?: number | null;
  sellerVerifiedBy?: string | null;
  sellerTrustNote?: string | null;
  authMethod: "wallet" | "email";
  linkedWalletAddress?: string | null;
  streetAddress1?: string | null;
  streetAddress2?: string | null;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
  lastLoginAt?: number | null;
  createdAt: number;
  updatedAt: number;
};

export type FavoriteListingRow = {
  userAddress: string;
  listingChainKey: string;
  listingId: string;
  createdAt: number;
};

export type PromotionRow = {
  id: number;
  listingId: string;
  listingChainKey: string;
  paymentId?: number | null;
  type: string;
  status: string;
  priority: number;
  placementSlot?: string | null;
  campaignName?: string | null;
  sponsorLabel?: string | null;
  createdBy?: string | null;
  notes?: string | null;
  metadata: Record<string, unknown>;
  startsAt: number;
  endsAt: number;
  createdAt: number;
  updatedAt: number;
};

export type PublicUserProfileRow = {
  user: UserRow;
  listingCount: number;
  followerCount: number;
  responseRate: number | null;
  reputation: number | null;
  location?: {
    city?: string | null;
    region?: string | null;
    postalCode?: string | null;
  };
};

export type AuthNonceRow = {
  address: string;
  nonce: string;
  expiresAt: number;
  createdAt: number;
  consumedAt?: number | null;
};

export type EmailAuthTokenRow = {
  tokenHash: string;
  userAddress: string;
  email: string;
  purpose: "login" | "verify";
  expiresAt: number;
  createdAt: number;
  consumedAt?: number | null;
  metadataJson?: string;
};

export type ListingCommentRow = {
  id: number;
  listingId: string;
  listingChainKey: string;
  authorAddress: string;
  body: string;
  createdAt: number;
  updatedAt: number;
  authorDisplayName?: string | null;
};

export type ListingOrderIntentRow = {
  orderHash: string;
  chainKey: string;
  listingId: string;
  seller: string;
  signature: string;
  token: string;
  price: string;
  expiry: number;
  nonce: string;
  termsHash: string;
  isLatest: boolean;
  createdAt: number;
  updatedAt: number;
};

export type SavedSearchFilters = {
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
};

export type SavedSearchRow = {
  id: number;
  userAddress: string;
  name: string;
  email?: string | null;
  filters: SavedSearchFilters;
  lastCheckedAt: number;
  createdAt: number;
  updatedAt: number;
};

export type NotificationRow = {
  id: number;
  userAddress: string;
  type: string;
  title: string;
  body: string;
  dedupeKey?: string | null;
  payload: Record<string, unknown>;
  readAt?: number | null;
  createdAt: number;
};

let pool: Pool | null = null;

export function openDb(connStr: string) {
  if (pool) return pool;

  // If a relative path was provided, treat it as a file-based SQLite path for compatibility.
  // For Postgres, expect a connection string like postgres://user:pass@host:port/db
  const isPg = typeof connStr === "string" && connStr.startsWith("postgres");
  if (!isPg) {
    // Keep minimal compatibility: create directory for sqlite path but warn.
    const backendRoot = path.resolve(__dirname, "..", "..", "..");
    const absPath = path.isAbsolute(connStr) ? connStr : path.join(backendRoot, connStr);
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    throw new Error("SQLite DB path support removed. Set DATABASE_URL to a Postgres connection string.");
  }

  const requireSsl =
    /sslmode=require/i.test(connStr) ||
    (process.env.PGSSLMODE?.toLowerCase?.() === "require") ||
    (process.env.PGSSL?.toLowerCase?.() === "true");

  pool = new Pool({
    connectionString: connStr,
    ...(requireSsl ? { ssl: { rejectUnauthorized: false } } : {}),
  });

  return pool;
}

function ensurePool(db: Pool | any): Pool {
  if (db && typeof db.query === "function") return db as Pool;
  if (pool) return pool;
  throw new Error("DB pool not initialized");
}

function migrationsDir(): string {
  // In production (Render) the process CWD should be the backend root.
  const fromCwd = path.resolve(process.cwd(), "migrations");
  if (fs.existsSync(fromCwd)) return fromCwd;

  // Fallback for unusual launch directories.
  const fromDist = path.resolve(__dirname, "..", "..", "migrations");
  return fromDist;
}

export async function migrateDb(db: Pool): Promise<void> {
  const p = ensurePool(db);
  const dir = migrationsDir();

  if (!fs.existsSync(dir)) {
    throw new Error(`Migrations directory not found: ${dir}`);
  }

  const files = fs
    .readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));

  const client = await p.connect();
  try {
    await client.query("BEGIN");

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    const appliedRes = await client.query("SELECT id FROM schema_migrations");
    const applied = new Set<string>(appliedRes.rows.map((r: any) => String(r.id)));

    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = fs.readFileSync(path.join(dir, file), "utf8");
      if (!sql.trim()) continue;

      await client.query(sql);
      await client.query("INSERT INTO schema_migrations(id) VALUES($1)", [file]);
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function closeDb(db: Pool): Promise<void> {
  await ensurePool(db).end();
}

function toListingRow(r: any): ListingRow {
  return {
    chainKey: String(r.chainKey ?? r.chainkey),
    chainId: Number(r.chainId ?? r.chainid ?? 0),
    id: String(r.id),
    seller: String(r.seller),
    metadataURI: String(r.metadataURI ?? r.metadatauri ?? r.metadata_uri),
    price: String(r.price),
    token: String(r.token),
    saleType: Number(r.saleType ?? r.saletype ?? r.sale_type),
    active: Number(r.active) ? 1 : 0,
    createdAt: Number(r.createdAt ?? r.createdat ?? r.created_at),
    blockNumber: Number(r.blockNumber ?? r.blocknumber ?? r.block_number),
  };
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // ignore malformed historical rows
  }
  return {};
}

function toSavedSearchRow(r: any): SavedSearchRow {
  return {
    id: Number(r.id),
    userAddress: String(r.userAddress ?? r.useraddress),
    name: String(r.name),
    email: r.email ?? null,
    filters: parseJsonObject(r.queryJson ?? r.queryjson) as SavedSearchFilters,
    lastCheckedAt: Number(r.lastCheckedAt ?? r.lastcheckedat ?? 0),
    createdAt: Number(r.createdAt ?? r.createdat ?? 0),
    updatedAt: Number(r.updatedAt ?? r.updatedat ?? 0),
  };
}

function toNotificationRow(r: any): NotificationRow {
  return {
    id: Number(r.id),
    userAddress: String(r.userAddress ?? r.useraddress),
    type: String(r.type),
    title: String(r.title),
    body: String(r.body),
    dedupeKey: r.dedupeKey ?? r.dedupekey ?? null,
    payload: parseJsonObject(r.payloadJson ?? r.payloadjson),
    readAt: r.readAt != null || r.readat != null ? Number(r.readAt ?? r.readat) : null,
    createdAt: Number(r.createdAt ?? r.createdat ?? 0),
  };
}

function toAuctionRow(r: any): AuctionRow {
  return {
    chainKey: String(r.chainKey ?? r.chainkey),
    listingId: String(r.listingId ?? r.listingid ?? r.listing_id),
    highestBid: String(r.highestBid ?? r.highestbid ?? r.highest_bid),
    highestBidder: String(r.highestBidder ?? r.highestbidder ?? r.highest_bidder),
    endTime: Number(r.endTime ?? r.endtime ?? r.end_time),
  };
}

function toRaffleRow(r: any): RaffleRow {
  return {
    chainKey: String(r.chainKey ?? r.chainkey),
    listingId: String(r.listingId ?? r.listingid ?? r.listing_id),
    ticketsSold: Number(r.ticketsSold ?? r.ticketssold ?? r.tickets_sold),
    endTime: Number(r.endTime ?? r.endtime ?? r.end_time),
  };
}

function toMetadataRow(r: any): MetadataRow {
  const row: MetadataRow = {
    id: String(r.id),
    title: String(r.title),
    description: String(r.description),
    image: String(r.image),
    imagesJson: r.imagesJson ?? r.imagesjson ?? r.images_json,
    category: r.category ?? null,
    subcategory: r.subcategory ?? null,
    city: r.city ?? null,
    region: r.region ?? null,
    postalCode: r.postalCode ?? r.postalcode ?? r.postal_code ?? null,
    contactEmail: r.contactEmail ?? r.contactemail ?? r.contact_email ?? null,
    contactPhone: r.contactPhone ?? r.contactphone ?? r.contact_phone ?? null,
    attributesJson: String(r.attributesJson ?? r.attributesjson ?? r.attributes_json),
    createdAt: Number(r.createdAt ?? r.createdat ?? r.created_at),
  };

  if (r.uri != null) row.uri = String(r.uri);
  return row;
}

export async function getCheckpoint(_db: Pool | any, key: string): Promise<number | null> {
  const p = ensurePool(_db);
  const res = await p.query("SELECT value FROM indexer_state WHERE key = $1", [key]);
  if (res.rows.length === 0) return null;
  const parsed = Number(res.rows[0].value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function setCheckpoint(_db: Pool | any, key: string, value: number) {
  const p = ensurePool(_db);
  await p.query(
    `INSERT INTO indexer_state(key, value) VALUES($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [key, String(value)]
  );
}

export async function upsertListing(_db: Pool | any, row: ListingRow) {
  const p = ensurePool(_db);
  await p.query(
    `INSERT INTO listings(chainkey, chainid, id, seller, metadataURI, price, token, saleType, active, createdAt, blockNumber)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (chainkey, id) DO UPDATE SET
       chainid = EXCLUDED.chainid,
       seller = EXCLUDED.seller,
       metadataURI = EXCLUDED.metadataURI,
       price = EXCLUDED.price,
       token = EXCLUDED.token,
       saleType = EXCLUDED.saleType,
       active = EXCLUDED.active,
       createdAt = EXCLUDED.createdAt,
       blockNumber = EXCLUDED.blockNumber
    `,
    [row.chainKey, row.chainId, row.id, row.seller, row.metadataURI, row.price, row.token, row.saleType, row.active, row.createdAt, row.blockNumber]
  );
}

export async function setListingActive(_db: Pool | any, listingId: string, chainKey: string, active: 0 | 1) {
  const p = ensurePool(_db);
  await p.query("UPDATE listings SET active = $1 WHERE chainkey = $2 AND id = $3", [active, chainKey, listingId]);
}

export async function upsertAuction(_db: Pool | any, row: AuctionRow) {
  const p = ensurePool(_db);
  await p.query(
    `INSERT INTO auctions(chainkey, listingId, highestBid, highestBidder, endTime)
     VALUES($1,$2,$3,$4,$5)
     ON CONFLICT (chainkey, listingId) DO UPDATE SET
       highestBid = EXCLUDED.highestBid,
       highestBidder = EXCLUDED.highestBidder,
       endTime = EXCLUDED.endTime
    `,
    [row.chainKey, row.listingId, row.highestBid, row.highestBidder, row.endTime]
  );
}

export async function updateAuctionBid(_db: Pool | any, listingId: string, chainKey: string, bidder: string, amount: bigint) {
  const p = ensurePool(_db);
  const res = await p.query('SELECT highestbid AS "highestBid" FROM auctions WHERE chainkey = $1 AND listingid = $2', [chainKey, listingId]);
  const current = res.rows.length ? BigInt(res.rows[0].highestBid) : 0n;
  if (amount <= current) return;
  await p.query(
    `INSERT INTO auctions(chainkey, listingId, highestBid, highestBidder, endTime)
     VALUES($1,$2,$3,$4,0)
     ON CONFLICT (chainkey, listingId) DO UPDATE SET highestBid = EXCLUDED.highestBid, highestBidder = EXCLUDED.highestBidder`,
    [chainKey, listingId, amount.toString(), bidder]
  );
}

export async function upsertRaffle(_db: Pool | any, row: RaffleRow) {
  const p = ensurePool(_db);
  await p.query(
    `INSERT INTO raffles(chainkey, listingId, ticketsSold, endTime)
     VALUES($1,$2,$3,$4)
     ON CONFLICT (chainkey, listingId) DO UPDATE SET
       ticketsSold = EXCLUDED.ticketsSold,
       endTime = EXCLUDED.endTime`,
    [row.chainKey, row.listingId, row.ticketsSold, row.endTime]
  );
}

export async function incrementRaffleTickets(_db: Pool | any, listingId: string, chainKey: string, tickets: number) {
  const p = ensurePool(_db);
  await p.query(
    `INSERT INTO raffles(chainkey, listingId, ticketsSold, endTime)
     VALUES($1,$2,$3,0)
     ON CONFLICT (chainkey, listingId) DO UPDATE SET ticketsSold = raffles.ticketsSold + EXCLUDED.ticketsSold`,
    [chainKey, listingId, tickets]
  );
}

export async function findListing(_db: Pool | any, id: string, chainKey?: string): Promise<ListingRow | null> {
  const p = ensurePool(_db);
  const res = await p.query(
    `SELECT chainkey AS "chainKey", chainid AS "chainId", id, seller, metadatauri AS "metadataURI", price, token, saletype AS "saleType", active, createdat AS "createdAt", blocknumber AS "blockNumber"
     FROM listings
     WHERE id = $1${chainKey ? ' AND chainkey = $2' : ''}
     ORDER BY blocknumber DESC
     LIMIT 1`,
    chainKey ? [id, chainKey] : [id]
  );
  return res.rows[0] ? toListingRow(res.rows[0]) : null;
}

export async function findAuction(_db: Pool | any, listingId: string, chainKey?: string): Promise<AuctionRow | null> {
  const p = ensurePool(_db);
  const res = await p.query(
    `SELECT chainkey AS "chainKey", listingid AS "listingId", highestbid AS "highestBid", highestbidder AS "highestBidder", endtime AS "endTime"
     FROM auctions
     WHERE listingid = $1${chainKey ? ' AND chainkey = $2' : ''}
     LIMIT 1`,
    chainKey ? [listingId, chainKey] : [listingId]
  );
  return res.rows[0] ? toAuctionRow(res.rows[0]) : null;
}

export async function findRaffle(_db: Pool | any, listingId: string, chainKey?: string): Promise<RaffleRow | null> {
  const p = ensurePool(_db);
  const res = await p.query(
    `SELECT chainkey AS "chainKey", listingid AS "listingId", ticketssold AS "ticketsSold", endtime AS "endTime"
     FROM raffles
     WHERE listingid = $1${chainKey ? ' AND chainkey = $2' : ''}
     LIMIT 1`,
    chainKey ? [listingId, chainKey] : [listingId]
  );
  return res.rows[0] ? toRaffleRow(res.rows[0]) : null;
}

export async function upsertMetadata(_db: Pool | any, row: MetadataRow) {
  const p = ensurePool(_db);
  await p.query(
    `INSERT INTO metadata(id, uri, title, description, image, imagesJson, category, subcategory, city, region, postalCode, contactEmail, contactPhone, attributesJson, createdAt)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     ON CONFLICT (id) DO UPDATE SET
       uri = EXCLUDED.uri,
       title = EXCLUDED.title,
       description = EXCLUDED.description,
       image = EXCLUDED.image,
       imagesJson = EXCLUDED.imagesJson,
       category = EXCLUDED.category,
       subcategory = EXCLUDED.subcategory,
       city = EXCLUDED.city,
       region = EXCLUDED.region,
       postalCode = EXCLUDED.postalCode,
       contactEmail = EXCLUDED.contactEmail,
       contactPhone = EXCLUDED.contactPhone,
       attributesJson = EXCLUDED.attributesJson,
       createdAt = EXCLUDED.createdAt`,
    [
      row.id,
      row.uri ?? `metadata://sha256/${row.id}`,
      row.title,
      row.description,
      row.image,
      row.imagesJson ?? "[]",
      row.category ?? null,
      row.subcategory ?? null,
      row.city ?? null,
      row.region ?? null,
      row.postalCode ?? null,
      row.contactEmail ?? null,
      row.contactPhone ?? null,
      row.attributesJson,
      row.createdAt,
    ]
  );
}

export async function findMetadata(_db: Pool | any, id: string): Promise<MetadataRow | null> {
  const p = ensurePool(_db);
  const res = await p.query(
    'SELECT id, uri, title, description, image, imagesjson AS "imagesJson", category, subcategory, city, region, postalcode AS "postalCode", contactemail AS "contactEmail", contactphone AS "contactPhone", attributesjson AS "attributesJson", createdat AS "createdAt" FROM metadata WHERE id = $1',
    [id]
  );
  return res.rows[0] ? toMetadataRow(res.rows[0]) : null;
}

export async function findMetadataByUri(_db: Pool | any, uri: string): Promise<MetadataRow | null> {
  const p = ensurePool(_db);
  const clean = String(uri ?? "").trim();
  if (!clean) return null;
  const res = await p.query(
    'SELECT id, uri, title, description, image, imagesjson AS "imagesJson", category, subcategory, city, region, postalcode AS "postalCode", contactemail AS "contactEmail", contactphone AS "contactPhone", attributesjson AS "attributesJson", createdat AS "createdAt" FROM metadata WHERE uri = $1',
    [clean]
  );
  return res.rows[0] ? toMetadataRow(res.rows[0]) : null;
}

export type ListingsQuery = {
  chainKey?: string | undefined;
  seller?: string | undefined;
  saleType?: number | undefined;
  active?: boolean | undefined;
  createdAfter?: number | undefined;
  minPrice?: bigint | undefined;
  maxPrice?: bigint | undefined;
  q?: string | undefined;
  category?: string | undefined;
  subcategory?: string | undefined;
  city?: string | undefined;
  region?: string | undefined;
  postalCode?: string | undefined;
  sort?: "newest" | "price_asc" | "price_desc" | undefined;
  autoHideReportThreshold?: number | undefined;
  limit: number;
  offset: number;
};

export async function queryListings(_db: Pool | any, q: ListingsQuery) {
  const p = ensurePool(_db);
  const where: string[] = [];
  const params: any[] = [];

  // Production feeds should not surface synthetic smoke-test listings.
  where.push(`LOWER(listings.metadatauri) NOT LIKE 'ipfs://seller-block/smoke-%'`);

  const joinMetadata = Boolean(q.q || q.category || q.subcategory || q.city || q.region || q.postalCode);

  if (q.seller) {
    where.push(`seller = $${params.length + 1}`);
    params.push(q.seller);
  }
  if (q.chainKey) {
    where.push(`listings.chainkey = $${params.length + 1}`);
    params.push(q.chainKey);
  }
  if (typeof q.saleType === "number") {
    where.push(`saleType = $${params.length + 1}`);
    params.push(q.saleType);
  }
  if (typeof q.active === "boolean") {
    where.push(`listings.active = $${params.length + 1}`);
    params.push(q.active ? 1 : 0);
  }
  if (typeof q.createdAfter === "number" && Number.isFinite(q.createdAfter)) {
    where.push(`listings.createdat > $${params.length + 1}`);
    params.push(q.createdAfter);
  }
  if (typeof q.minPrice === "bigint") {
    where.push(`CAST(listings.price AS NUMERIC) >= $${params.length + 1}`);
    params.push(q.minPrice.toString());
  }
  if (typeof q.maxPrice === "bigint") {
    where.push(`CAST(listings.price AS NUMERIC) <= $${params.length + 1}`);
    params.push(q.maxPrice.toString());
  }

  if (q.category) {
    where.push(`m.category = $${params.length + 1}`);
    params.push(q.category);
  }
  if (q.subcategory) {
    where.push(`m.subcategory = $${params.length + 1}`);
    params.push(q.subcategory);
  }
  if (q.city) {
    where.push(`m.city = $${params.length + 1}`);
    params.push(q.city);
  }
  if (q.region) {
    where.push(`m.region = $${params.length + 1}`);
    params.push(q.region);
  }
  if (q.postalCode) {
    where.push(`m.postalcode = $${params.length + 1}`);
    params.push(q.postalCode);
  }
  if (q.q) {
    where.push(`(m.title ILIKE $${params.length + 1} OR m.description ILIKE $${params.length + 1})`);
    params.push(`%${q.q}%`);
  }

  if (typeof q.autoHideReportThreshold === "number" && q.autoHideReportThreshold > 0) {
    where.push(
      `(SELECT COUNT(1) FROM reports r WHERE r.targettype = 'listing' AND r.targetid = CONCAT(listings.chainkey, ':', listings.id)) < $${params.length + 1}`
    );
    params.push(q.autoHideReportThreshold);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const orderBy = (() => {
    if (q.sort === "price_asc") return `ORDER BY CAST(listings.price AS NUMERIC) ASC, listings.blocknumber DESC`;
    if (q.sort === "price_desc") return `ORDER BY CAST(listings.price AS NUMERIC) DESC, listings.blocknumber DESC`;
    return `ORDER BY listings.blocknumber DESC`;
  })();

  params.push(q.limit, q.offset);
  const limitParam = `$${params.length - 1}`;
  const offsetParam = `$${params.length}`;

  const res = await p.query(
      `SELECT listings.chainkey AS "chainKey",
        listings.chainid AS "chainId",
        listings.id,
            listings.seller,
            listings.metadatauri AS "metadataURI",
            listings.price,
            listings.token,
            listings.saletype AS "saleType",
            listings.active,
            listings.createdat AS "createdAt",
            listings.blocknumber AS "blockNumber"
     FROM listings
     ${joinMetadata ? 'LEFT JOIN metadata m ON m.uri = listings.metadataURI' : ''}
     ${whereSql}
     ${orderBy}
     LIMIT ${limitParam} OFFSET ${offsetParam}`,
    params
  );
  return res.rows.map(toListingRow);
}

export type UserBlockRow = {
  blocker: string;
  blocked: string;
  createdAt: number;
  signature: string;
  message: string;
};

export async function upsertUserBlock(_db: Pool | any, row: UserBlockRow) {
  const p = ensurePool(_db);
  await p.query(
    `INSERT INTO user_blocks(blocker, blocked, createdAt, signature, message)
     VALUES($1,$2,$3,$4,$5)
     ON CONFLICT (blocker, blocked) DO UPDATE SET
       createdAt = EXCLUDED.createdAt,
       signature = EXCLUDED.signature,
       message = EXCLUDED.message`,
    [row.blocker, row.blocked, row.createdAt, row.signature, row.message]
  );
}

export async function listUserBlocks(_db: Pool | any, blocker: string): Promise<UserBlockRow[]> {
  const p = ensurePool(_db);
  const res = await p.query(
    'SELECT blocker, blocked, createdat AS "createdAt", signature, message FROM user_blocks WHERE blocker = $1 ORDER BY createdat DESC',
    [blocker]
  );
  return res.rows.map((r: any) => ({
    blocker: String(r.blocker),
    blocked: String(r.blocked),
    createdAt: Number(r.createdAt ?? r.createdat ?? 0),
    signature: String(r.signature),
    message: String(r.message),
  }));
}

export type CreateReportInput = {
  reporter?: string | null;
  targetType: "listing" | "user" | "message" | "conversation";
  targetId: string;
  reason: string;
  details?: string | null;
  createdAt: number;
  reporterIp?: string | null;
};

export async function createReport(_db: Pool | any, input: CreateReportInput): Promise<{ id: string }> {
  const p = ensurePool(_db);
  const res = await p.query(
    `INSERT INTO reports(reporter, targetType, targetId, reason, details, createdAt, reporterIp)
     VALUES($1,$2,$3,$4,$5,$6,$7)
     RETURNING id`,
    [
      input.reporter ?? null,
      input.targetType,
      input.targetId,
      input.reason,
      input.details ?? null,
      input.createdAt,
      input.reporterIp ?? null,
    ]
  );
  return { id: String(res.rows?.[0]?.id ?? "") };
}

function toUserRow(r: any): UserRow {
  return {
    address: String(r.address),
    fullName: r.fullName ?? r.fullname ?? null,
    displayName: r.displayName ?? r.displayname ?? null,
    bio: r.bio ?? null,
    avatarCid: r.avatarCid ?? r.avatarcid ?? null,
    email: r.email ?? null,
    emailVerifiedAt: r.emailVerifiedAt ?? r.emailverifiedat ?? null,
    sellerVerifiedAt: r.sellerVerifiedAt ?? r.sellerverifiedat ?? null,
    sellerVerifiedBy: r.sellerVerifiedBy ?? r.sellerverifiedby ?? null,
    sellerTrustNote: r.sellerTrustNote ?? r.sellertrustnote ?? null,
    authMethod: String(r.authMethod ?? r.authmethod ?? "wallet") === "email" ? "email" : "wallet",
    linkedWalletAddress: r.linkedWalletAddress ?? r.linkedwalletaddress ?? null,
    streetAddress1: r.streetAddress1 ?? r.streetaddress1 ?? null,
    streetAddress2: r.streetAddress2 ?? r.streetaddress2 ?? null,
    city: r.city ?? null,
    region: r.region ?? null,
    postalCode: r.postalCode ?? r.postalcode ?? null,
    lastLoginAt: r.lastLoginAt ?? r.lastloginat ?? null,
    createdAt: Number(r.createdAt ?? r.createdat ?? 0),
    updatedAt: Number(r.updatedAt ?? r.updatedat ?? 0),
  };
}

function toFavoriteListingRow(r: any): FavoriteListingRow {
  return {
    userAddress: String(r.userAddress ?? r.useraddress),
    listingChainKey: String(r.listingChainKey ?? r.listingchainkey),
    listingId: String(r.listingId ?? r.listingid),
    createdAt: Number(r.createdAt ?? r.createdat ?? 0),
  };
}

function toPromotionRow(r: any): PromotionRow {
  return {
    id: Number(r.id),
    listingId: String(r.listingId ?? r.listingid),
    listingChainKey: String(r.listingChainKey ?? r.listingchainkey),
    paymentId: r.paymentId ?? r.paymentid ?? null,
    type: String(r.type),
    status: String(r.status),
    priority: Number(r.priority ?? 0),
    placementSlot: r.placementSlot ?? r.placementslot ?? null,
    campaignName: r.campaignName ?? r.campaignname ?? null,
    sponsorLabel: r.sponsorLabel ?? r.sponsorlabel ?? null,
    createdBy: r.createdBy ?? r.createdby ?? null,
    notes: r.notes ?? null,
    metadata: parseJsonObject(r.metadataJson ?? r.metadatajson),
    startsAt: Number(r.startsAt ?? r.startsat ?? 0),
    endsAt: Number(r.endsAt ?? r.endsat ?? 0),
    createdAt: Number(r.createdAt ?? r.createdat ?? 0),
    updatedAt: Number(r.updatedAt ?? r.updatedat ?? 0),
  };
}

function toAuthNonceRow(r: any): AuthNonceRow {
  return {
    address: String(r.address),
    nonce: String(r.nonce),
    expiresAt: Number(r.expiresAt ?? r.expiresat ?? 0),
    createdAt: Number(r.createdAt ?? r.createdat ?? 0),
    consumedAt: r.consumedAt != null ? Number(r.consumedAt ?? r.consumedat) : null,
  };
}

function toEmailAuthTokenRow(r: any): EmailAuthTokenRow {
  return {
    tokenHash: String(r.tokenHash ?? r.tokenhash),
    userAddress: String(r.userAddress ?? r.useraddress),
    email: String(r.email),
    purpose: String(r.purpose) === "verify" ? "verify" : "login",
    expiresAt: Number(r.expiresAt ?? r.expiresat),
    createdAt: Number(r.createdAt ?? r.createdat),
    consumedAt: r.consumedAt ?? r.consumedat ?? null,
    metadataJson: r.metadataJson ?? r.metadatajson ?? "{}",
  };
}

function toListingCommentRow(r: any): ListingCommentRow {
  return {
    id: Number(r.id),
    listingId: String(r.listingId ?? r.listingid),
    listingChainKey: String(r.listingChainKey ?? r.listingchainkey),
    authorAddress: String(r.authorAddress ?? r.authoraddress),
    body: String(r.body),
    createdAt: Number(r.createdAt ?? r.createdat ?? 0),
    updatedAt: Number(r.updatedAt ?? r.updatedat ?? 0),
    authorDisplayName: r.authorDisplayName ?? r.authordisplayname ?? null,
  };
}

function toListingOrderIntentRow(r: any): ListingOrderIntentRow {
  return {
    orderHash: String(r.orderHash ?? r.orderhash),
    chainKey: String(r.chainKey ?? r.chainkey),
    listingId: String(r.listingId ?? r.listingid),
    seller: String(r.seller),
    signature: String(r.signature),
    token: String(r.token),
    price: String(r.price),
    expiry: Number(r.expiry),
    nonce: String(r.nonce),
    termsHash: String(r.termsHash ?? r.termshash),
    isLatest: Boolean(r.isLatest ?? r.islatest),
    createdAt: Number(r.createdAt ?? r.createdat ?? 0),
    updatedAt: Number(r.updatedAt ?? r.updatedat ?? 0),
  };
}

export async function createAuthNonce(_db: Pool | any, address: string, nonce: string, expiresAt: number, createdAt: number) {
  const p = ensurePool(_db);
  await p.query(
    `INSERT INTO auth_nonces(address, nonce, expiresAt, createdAt, consumedAt)
     VALUES($1,$2,$3,$4,NULL)
     ON CONFLICT (address, nonce) DO UPDATE SET
       expiresAt = EXCLUDED.expiresAt,
       createdAt = EXCLUDED.createdAt,
       consumedAt = NULL`,
    [address, nonce, expiresAt, createdAt]
  );
}

export async function findAuthNonce(_db: Pool | any, address: string, nonce: string): Promise<AuthNonceRow | null> {
  const p = ensurePool(_db);
  const res = await p.query(
    'SELECT address, nonce, expiresat AS "expiresAt", createdat AS "createdAt", consumedat AS "consumedAt" FROM auth_nonces WHERE address = $1 AND nonce = $2',
    [address, nonce]
  );
  return res.rows[0] ? toAuthNonceRow(res.rows[0]) : null;
}

export async function consumeAuthNonce(_db: Pool | any, address: string, nonce: string, consumedAt: number) {
  const p = ensurePool(_db);
  await p.query('UPDATE auth_nonces SET consumedat = $3 WHERE address = $1 AND nonce = $2 AND consumedat IS NULL', [address, nonce, consumedAt]);
}

export async function ensureUser(_db: Pool | any, address: string, createdAt: number) {
  const p = ensurePool(_db);
  await p.query(
    `INSERT INTO users(address, createdAt, updatedAt)
     VALUES($1,$2,$2)
     ON CONFLICT (address) DO NOTHING`,
    [address, createdAt]
  );
}

export async function findUserByEmail(_db: Pool | any, email: string): Promise<UserRow | null> {
  const p = ensurePool(_db);
  const res = await p.query(
    'SELECT address, fullname AS "fullName", displayname AS "displayName", bio, avatarcid AS "avatarCid", email, emailverifiedat AS "emailVerifiedAt", sellerverifiedat AS "sellerVerifiedAt", sellerverifiedby AS "sellerVerifiedBy", sellertrustnote AS "sellerTrustNote", authmethod AS "authMethod", linkedwalletaddress AS "linkedWalletAddress", streetaddress1 AS "streetAddress1", streetaddress2 AS "streetAddress2", city, region, postalcode AS "postalCode", lastloginat AS "lastLoginAt", createdat AS "createdAt", updatedat AS "updatedAt" FROM users WHERE emailnormalized = $1 LIMIT 1',
    [email]
  );
  return res.rows[0] ? toUserRow(res.rows[0]) : null;
}

export async function findUserByLinkedWallet(_db: Pool | any, walletAddress: string): Promise<UserRow | null> {
  const p = ensurePool(_db);
  const res = await p.query(
    'SELECT address, fullname AS "fullName", displayname AS "displayName", bio, avatarcid AS "avatarCid", email, emailverifiedat AS "emailVerifiedAt", sellerverifiedat AS "sellerVerifiedAt", sellerverifiedby AS "sellerVerifiedBy", sellertrustnote AS "sellerTrustNote", authmethod AS "authMethod", linkedwalletaddress AS "linkedWalletAddress", streetaddress1 AS "streetAddress1", streetaddress2 AS "streetAddress2", city, region, postalcode AS "postalCode", lastloginat AS "lastLoginAt", createdat AS "createdAt", updatedat AS "updatedAt" FROM users WHERE LOWER(linkedwalletaddress) = LOWER($1) LIMIT 1',
    [walletAddress]
  );
  return res.rows[0] ? toUserRow(res.rows[0]) : null;
}

export async function getUserPasswordHash(_db: Pool | any, address: string): Promise<string | null> {
  const p = ensurePool(_db);
  const res = await p.query('SELECT passwordhash FROM users WHERE address = $1 LIMIT 1', [address]);
  return typeof res.rows?.[0]?.passwordhash === "string" ? res.rows[0].passwordhash : null;
}

export async function createEmailUser(
  _db: Pool | any,
  input: {
    address: string;
    email: string;
    passwordHash: string;
    fullName?: string | null;
    displayName?: string | null;
    streetAddress1?: string | null;
    streetAddress2?: string | null;
    city?: string | null;
    region?: string | null;
    postalCode?: string | null;
    createdAt: number;
  }
) {
  const p = ensurePool(_db);
  await p.query(
    `INSERT INTO users(address, fullname, displayname, email, emailnormalized, passwordhash, emailverifiedat, authmethod, streetaddress1, streetaddress2, city, region, postalcode, createdat, updatedat, lastloginat)
     VALUES($1,$2,$3,$4,$4,$5,$6,'email',$7,$8,$9,$10,$11,$6,$6,$6)`,
    [
      input.address,
      input.fullName ?? null,
      input.displayName ?? null,
      input.email,
      input.passwordHash,
      input.createdAt,
      input.streetAddress1 ?? null,
      input.streetAddress2 ?? null,
      input.city ?? null,
      input.region ?? null,
      input.postalCode ?? null,
    ]
  );
}

export async function updateUserLastLogin(_db: Pool | any, address: string, lastLoginAt: number) {
  const p = ensurePool(_db);
  await p.query('UPDATE users SET lastloginat = $2, updatedat = GREATEST(updatedat, $2) WHERE address = $1', [address, lastLoginAt]);
}

export async function updateUserLinkedWallet(_db: Pool | any, address: string, linkedWalletAddress: string | null, updatedAt: number) {
  const p = ensurePool(_db);
  await p.query('UPDATE users SET linkedwalletaddress = $2, updatedat = GREATEST(updatedat, $3) WHERE address = $1', [address, linkedWalletAddress, updatedAt]);
}

export async function updateUserEmailVerifiedAt(_db: Pool | any, address: string, emailVerifiedAt: number) {
  const p = ensurePool(_db);
  await p.query('UPDATE users SET emailverifiedat = $2, updatedat = GREATEST(updatedat, $2) WHERE address = $1', [address, emailVerifiedAt]);
}

export async function createEmailAuthToken(
  _db: Pool | any,
  input: {
    tokenHash: string;
    userAddress: string;
    email: string;
    purpose: "login" | "verify";
    expiresAt: number;
    createdAt: number;
    metadataJson?: string;
  }
) {
  const p = ensurePool(_db);
  await p.query(
    `INSERT INTO email_auth_tokens(tokenhash, useraddress, email, purpose, expiresat, createdat, consumedat, metadatajson)
     VALUES($1,$2,$3,$4,$5,$6,NULL,$7)`,
    [input.tokenHash, input.userAddress, input.email, input.purpose, input.expiresAt, input.createdAt, input.metadataJson ?? "{}"]
  );
}

export async function findEmailAuthToken(_db: Pool | any, tokenHash: string): Promise<EmailAuthTokenRow | null> {
  const p = ensurePool(_db);
  const res = await p.query(
    'SELECT tokenhash AS "tokenHash", useraddress AS "userAddress", email, purpose, expiresat AS "expiresAt", createdat AS "createdAt", consumedat AS "consumedAt", metadatajson AS "metadataJson" FROM email_auth_tokens WHERE tokenhash = $1 LIMIT 1',
    [tokenHash]
  );
  return res.rows[0] ? toEmailAuthTokenRow(res.rows[0]) : null;
}

export async function consumeEmailAuthToken(_db: Pool | any, tokenHash: string, consumedAt: number) {
  const p = ensurePool(_db);
  await p.query('UPDATE email_auth_tokens SET consumedat = $2 WHERE tokenhash = $1 AND consumedat IS NULL', [tokenHash, consumedAt]);
}

export async function getUser(_db: Pool | any, address: string): Promise<UserRow | null> {
  const p = ensurePool(_db);
  const res = await p.query(
    'SELECT address, fullname AS "fullName", displayname AS "displayName", bio, avatarcid AS "avatarCid", email, emailverifiedat AS "emailVerifiedAt", sellerverifiedat AS "sellerVerifiedAt", sellerverifiedby AS "sellerVerifiedBy", sellertrustnote AS "sellerTrustNote", authmethod AS "authMethod", linkedwalletaddress AS "linkedWalletAddress", streetaddress1 AS "streetAddress1", streetaddress2 AS "streetAddress2", city, region, postalcode AS "postalCode", lastloginat AS "lastLoginAt", createdat AS "createdAt", updatedat AS "updatedAt" FROM users WHERE address = $1',
    [address]
  );
  return res.rows[0] ? toUserRow(res.rows[0]) : null;
}

export async function updateUserTrust(
  _db: Pool | any,
  input: {
    address: string;
    sellerVerifiedAt: number | null;
    sellerVerifiedBy: string | null;
    sellerTrustNote: string | null;
    updatedAt: number;
  }
) {
  const p = ensurePool(_db);
  await p.query(
    `UPDATE users
     SET sellerverifiedat = $2,
         sellerverifiedby = $3,
         sellertrustnote = $4,
         updatedat = GREATEST(updatedat, $5)
     WHERE address = $1`,
    [input.address, input.sellerVerifiedAt, input.sellerVerifiedBy, input.sellerTrustNote, input.updatedAt]
  );
}

export async function updateUserProfile(
  _db: Pool | any,
  row: {
    address: string;
    fullName?: string | null;
    displayName?: string | null;
    bio?: string | null;
    avatarCid?: string | null;
    streetAddress1?: string | null;
    streetAddress2?: string | null;
    city?: string | null;
    region?: string | null;
    postalCode?: string | null;
    updatedAt: number;
  }
) {
  const p = ensurePool(_db);
  await p.query(
    `INSERT INTO users(address, fullname, displayName, bio, avatarCid, streetaddress1, streetaddress2, city, region, postalcode, createdAt, updatedAt)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)
     ON CONFLICT (address) DO UPDATE SET
       fullName = EXCLUDED.fullName,
       displayName = EXCLUDED.displayName,
       bio = EXCLUDED.bio,
       avatarCid = EXCLUDED.avatarCid,
       streetaddress1 = EXCLUDED.streetaddress1,
       streetaddress2 = EXCLUDED.streetaddress2,
       city = EXCLUDED.city,
       region = EXCLUDED.region,
       postalcode = EXCLUDED.postalcode,
       updatedAt = EXCLUDED.updatedAt`,
    [
      row.address,
      row.fullName ?? null,
      row.displayName ?? null,
      row.bio ?? null,
      row.avatarCid ?? null,
      row.streetAddress1 ?? null,
      row.streetAddress2 ?? null,
      row.city ?? null,
      row.region ?? null,
      row.postalCode ?? null,
      row.updatedAt,
    ]
  );
}

export async function getPublicUserProfile(_db: Pool | any, address: string): Promise<PublicUserProfileRow | null> {
  const p = ensurePool(_db);
  const user = await getUser(p, address);

  const listingCountRes = await p.query(
    'SELECT COUNT(1) AS count, MIN(createdat) AS "firstCreatedAt" FROM listings WHERE seller = $1',
    [address]
  );
  const listingCount = Number(listingCountRes.rows?.[0]?.count ?? 0);
  const firstCreatedAt = Number(listingCountRes.rows?.[0]?.firstCreatedAt ?? 0);

  const followerCountRes = await p.query('SELECT COUNT(1) AS count FROM user_follows WHERE followed = $1', [address]);
  const followerCount = Number(followerCountRes.rows?.[0]?.count ?? 0);

  const responseStatsRes = await p.query(
    `WITH seller_listings AS (
       SELECT chainkey, id, seller
       FROM listings
       WHERE seller = $1
     ),
     inbound_threads AS (
       SELECT DISTINCT c.listingchainkey, c.listingid
       FROM listing_comments c
       INNER JOIN seller_listings sl ON sl.chainkey = c.listingchainkey AND sl.id = c.listingid
       WHERE c.authoraddress <> sl.seller
     ),
     replied_threads AS (
       SELECT DISTINCT inbound.listingchainkey, inbound.listingid
       FROM inbound_threads inbound
       INNER JOIN seller_listings sl ON sl.chainkey = inbound.listingchainkey AND sl.id = inbound.listingid
       INNER JOIN listing_comments seller_reply
         ON seller_reply.listingchainkey = inbound.listingchainkey
        AND seller_reply.listingid = inbound.listingid
        AND seller_reply.authoraddress = sl.seller
     )
     SELECT
       (SELECT COUNT(1) FROM inbound_threads) AS "inboundCount",
       (SELECT COUNT(1) FROM replied_threads) AS "repliedCount"`,
    [address]
  );
  const inboundCount = Number(responseStatsRes.rows?.[0]?.inboundCount ?? 0);
  const repliedCount = Number(responseStatsRes.rows?.[0]?.repliedCount ?? 0);
  const responseRate = inboundCount > 0 ? Math.max(0, Math.min(100, Math.round((repliedCount / inboundCount) * 100))) : null;

  const listingReportCountRes = await p.query(
    `SELECT COUNT(1) AS count
     FROM reports r
     INNER JOIN listings l ON r.targettype = 'listing' AND r.targetid = CONCAT(l.chainkey, ':', l.id)
     WHERE l.seller = $1`,
    [address]
  );
  const listingReportCount = Number(listingReportCountRes.rows?.[0]?.count ?? 0);

  // Reputation is a bounded marketplace trust signal derived from visible activity,
  // responsiveness, and report pressure rather than an off-chain paid badge.
  const reputationSignal =
    35 +
    Math.min(listingCount, 10) * 2 +
    Math.min(followerCount, 10) * 3 +
    Math.round((responseRate ?? 0) * 0.2) -
    Math.min(listingReportCount, 8) * 10;
  const reputation = listingCount > 0 || followerCount > 0 || inboundCount > 0 || listingReportCount > 0
    ? Math.max(0, Math.min(100, reputationSignal))
    : null;

  if (!user && listingCount === 0) return null;

  const locationRes = await p.query(
    `SELECT m.city, m.region, m.postalcode AS "postalCode"
     FROM listings l
     LEFT JOIN metadata m ON m.uri = l.metadatauri
     WHERE l.seller = $1 AND (m.city IS NOT NULL OR m.region IS NOT NULL OR m.postalcode IS NOT NULL)
     ORDER BY l.blocknumber DESC, l.createdat DESC
     LIMIT 1`,
    [address]
  );

  const fallbackUser: UserRow = user ?? {
    address,
    fullName: null,
    displayName: null,
    bio: null,
    avatarCid: null,
    email: null,
    emailVerifiedAt: null,
    sellerVerifiedAt: null,
    sellerVerifiedBy: null,
    sellerTrustNote: null,
    authMethod: "wallet",
    linkedWalletAddress: null,
    streetAddress1: null,
    streetAddress2: null,
    city: null,
    region: null,
    postalCode: null,
    lastLoginAt: null,
    createdAt: firstCreatedAt || Date.now(),
    updatedAt: firstCreatedAt || Date.now(),
  };

  return {
    user: fallbackUser,
    listingCount,
    followerCount,
    responseRate,
    reputation,
    ...(locationRes.rows[0]
      ? {
          location: {
            city: locationRes.rows[0].city ?? null,
            region: locationRes.rows[0].region ?? null,
            postalCode: locationRes.rows[0].postalCode ?? null,
          },
        }
      : {}),
  };
}

export async function isUserFollowing(_db: Pool | any, follower: string, followed: string): Promise<boolean> {
  const p = ensurePool(_db);
  const res = await p.query('SELECT 1 FROM user_follows WHERE follower = $1 AND followed = $2 LIMIT 1', [follower, followed]);
  return Boolean(res.rows[0]);
}

export async function listFollowedUsers(_db: Pool | any, follower: string, limit = 100): Promise<string[]> {
  const p = ensurePool(_db);
  const res = await p.query(
    `SELECT followed
     FROM user_follows
     WHERE follower = $1
     ORDER BY createdat DESC
     LIMIT $2`,
    [follower, Math.min(Math.max(limit, 1), 250)]
  );
  return res.rows.map((row: any) => String(row.followed).toLowerCase());
}

export async function createUserFollow(_db: Pool | any, input: { follower: string; followed: string; createdAt: number }) {
  const p = ensurePool(_db);
  await p.query(
    `INSERT INTO user_follows(follower, followed, createdAt)
     VALUES($1,$2,$3)
     ON CONFLICT (follower, followed) DO NOTHING`,
    [input.follower, input.followed, input.createdAt]
  );
}

export async function deleteUserFollow(_db: Pool | any, follower: string, followed: string) {
  const p = ensurePool(_db);
  await p.query('DELETE FROM user_follows WHERE follower = $1 AND followed = $2', [follower, followed]);
}

export async function listFavoriteListingsByUser(_db: Pool | any, userAddress: string, limit = 100): Promise<FavoriteListingRow[]> {
  const p = ensurePool(_db);
  const res = await p.query(
    `SELECT useraddress AS "userAddress", listingchainkey AS "listingChainKey", listingid AS "listingId", createdat AS "createdAt"
     FROM user_favorite_listings
     WHERE useraddress = $1
     ORDER BY createdat DESC
     LIMIT $2`,
    [userAddress, Math.min(Math.max(limit, 1), 250)]
  );
  return res.rows.map(toFavoriteListingRow);
}

export async function isListingFavorited(_db: Pool | any, userAddress: string, listingChainKey: string, listingId: string): Promise<boolean> {
  const p = ensurePool(_db);
  const res = await p.query(
    'SELECT 1 FROM user_favorite_listings WHERE useraddress = $1 AND listingchainkey = $2 AND listingid = $3 LIMIT 1',
    [userAddress, listingChainKey, listingId]
  );
  return Boolean(res.rows[0]);
}

export async function createFavoriteListing(_db: Pool | any, input: FavoriteListingRow) {
  const p = ensurePool(_db);
  await p.query(
    `INSERT INTO user_favorite_listings(useraddress, listingchainkey, listingid, createdat)
     VALUES($1,$2,$3,$4)
     ON CONFLICT (useraddress, listingchainkey, listingid) DO NOTHING`,
    [input.userAddress, input.listingChainKey, input.listingId, input.createdAt]
  );
}

export async function deleteFavoriteListing(_db: Pool | any, userAddress: string, listingChainKey: string, listingId: string) {
  const p = ensurePool(_db);
  await p.query('DELETE FROM user_favorite_listings WHERE useraddress = $1 AND listingchainkey = $2 AND listingid = $3', [userAddress, listingChainKey, listingId]);
}

export async function listHomepageSponsoredPromotions(_db: Pool | any, now: number, limit = 8): Promise<PromotionRow[]> {
  const p = ensurePool(_db);
  const res = await p.query(
    `SELECT id,
            listingid AS "listingId",
            listingchainkey AS "listingChainKey",
            paymentid AS "paymentId",
            type,
            status,
            priority,
            placementslot AS "placementSlot",
            campaignname AS "campaignName",
            sponsorlabel AS "sponsorLabel",
            createdby AS "createdBy",
            notes,
            metadatajson AS "metadataJson",
            startsat AS "startsAt",
            endsat AS "endsAt",
            createdat AS "createdAt",
            updatedat AS "updatedAt"
     FROM promotions
     WHERE type = 'homepage_sponsored'
       AND status = 'active'
       AND startsat <= $1
       AND endsat >= $1
     ORDER BY priority DESC, startsat ASC, id DESC
     LIMIT $2`,
    [now, Math.min(Math.max(limit, 1), 24)]
  );
  return res.rows.map(toPromotionRow);
}

export async function listAllPromotions(_db: Pool | any, type?: string): Promise<PromotionRow[]> {
  const p = ensurePool(_db);
  const values: any[] = [];
  const where: string[] = [];
  if (type) {
    values.push(type);
    where.push(`type = $${values.length}`);
  }
  const res = await p.query(
    `SELECT id,
            listingid AS "listingId",
            listingchainkey AS "listingChainKey",
            paymentid AS "paymentId",
            type,
            status,
            priority,
            placementslot AS "placementSlot",
            campaignname AS "campaignName",
            sponsorlabel AS "sponsorLabel",
            createdby AS "createdBy",
            notes,
            metadatajson AS "metadataJson",
            startsat AS "startsAt",
            endsat AS "endsAt",
            createdat AS "createdAt",
            updatedat AS "updatedAt"
     FROM promotions
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY updatedat DESC, id DESC`,
    values
  );
  return res.rows.map(toPromotionRow);
}

export async function createPromotion(
  _db: Pool | any,
  input: Omit<PromotionRow, "id" | "paymentId" | "createdAt" | "updatedAt" | "metadata"> & { paymentId?: number | null; metadata?: Record<string, unknown>; createdAt: number; updatedAt: number }
): Promise<PromotionRow> {
  const p = ensurePool(_db);
  const res = await p.query(
    `INSERT INTO promotions(listingid, listingchainkey, paymentid, type, status, priority, placementslot, campaignname, sponsorlabel, createdby, notes, metadatajson, startsat, endsat, createdat, updatedat)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     RETURNING id,
               listingid AS "listingId",
               listingchainkey AS "listingChainKey",
               paymentid AS "paymentId",
               type,
               status,
               priority,
               placementslot AS "placementSlot",
               campaignname AS "campaignName",
               sponsorlabel AS "sponsorLabel",
               createdby AS "createdBy",
               notes,
               metadatajson AS "metadataJson",
               startsat AS "startsAt",
               endsat AS "endsAt",
               createdat AS "createdAt",
               updatedat AS "updatedAt"`,
    [
      input.listingId,
      input.listingChainKey,
      input.paymentId ?? null,
      input.type,
      input.status,
      input.priority,
      input.placementSlot ?? null,
      input.campaignName ?? null,
      input.sponsorLabel ?? null,
      input.createdBy ?? null,
      input.notes ?? null,
      JSON.stringify(input.metadata ?? {}),
      input.startsAt,
      input.endsAt,
      input.createdAt,
      input.updatedAt,
    ]
  );
  return toPromotionRow(res.rows[0]);
}

export async function updatePromotion(
  _db: Pool | any,
  input: Omit<PromotionRow, "paymentId" | "createdAt" | "updatedAt" | "metadata"> & { paymentId?: number | null; metadata?: Record<string, unknown>; updatedAt: number }
): Promise<PromotionRow | null> {
  const p = ensurePool(_db);
  const res = await p.query(
    `UPDATE promotions
     SET listingid = $2,
         listingchainkey = $3,
         paymentid = $4,
         type = $5,
         status = $6,
         priority = $7,
         placementslot = $8,
         campaignname = $9,
         sponsorlabel = $10,
         createdby = $11,
         notes = $12,
         metadatajson = $13,
         startsat = $14,
         endsat = $15,
         updatedat = $16
     WHERE id = $1
     RETURNING id,
               listingid AS "listingId",
               listingchainkey AS "listingChainKey",
               paymentid AS "paymentId",
               type,
               status,
               priority,
               placementslot AS "placementSlot",
               campaignname AS "campaignName",
               sponsorlabel AS "sponsorLabel",
               createdby AS "createdBy",
               notes,
               metadatajson AS "metadataJson",
               startsat AS "startsAt",
               endsat AS "endsAt",
               createdat AS "createdAt",
               updatedat AS "updatedAt"`,
    [
      input.id,
      input.listingId,
      input.listingChainKey,
      input.paymentId ?? null,
      input.type,
      input.status,
      input.priority,
      input.placementSlot ?? null,
      input.campaignName ?? null,
      input.sponsorLabel ?? null,
      input.createdBy ?? null,
      input.notes ?? null,
      JSON.stringify(input.metadata ?? {}),
      input.startsAt,
      input.endsAt,
      input.updatedAt,
    ]
  );
  return res.rows[0] ? toPromotionRow(res.rows[0]) : null;
}

export async function deletePromotion(_db: Pool | any, id: number) {
  const p = ensurePool(_db);
  await p.query('DELETE FROM promotions WHERE id = $1', [id]);
}

export async function hasUserBlockBetween(_db: Pool | any, a: string, b: string): Promise<boolean> {
  const p = ensurePool(_db);
  const res = await p.query(
    `SELECT 1 FROM user_blocks WHERE (blocker = $1 AND blocked = $2) OR (blocker = $2 AND blocked = $1) LIMIT 1`,
    [a, b]
  );
  return Boolean(res.rows[0]);
}

export async function listListingComments(
  _db: Pool | any,
  listingId: string,
  listingChainKey: string,
  opts: { limit: number; offset: number }
): Promise<ListingCommentRow[]> {
  const p = ensurePool(_db);
  const res = await p.query(
    `SELECT c.id,
            c.listingid AS "listingId",
            c.listingchainkey AS "listingChainKey",
            c.authoraddress AS "authorAddress",
            c.body,
            c.createdat AS "createdAt",
            c.updatedat AS "updatedAt",
            u.displayname AS "authorDisplayName"
     FROM listing_comments c
     LEFT JOIN users u ON u.address = c.authoraddress
     WHERE c.listingid = $1 AND c.listingchainkey = $2
     ORDER BY c.createdat ASC, c.id ASC
     LIMIT $3 OFFSET $4`,
    [listingId, listingChainKey, Math.min(Math.max(opts.limit, 1), 100), Math.max(opts.offset, 0)]
  );
  return res.rows.map(toListingCommentRow);
}

export async function createListingComment(
  _db: Pool | any,
  input: {
    listingId: string;
    listingChainKey: string;
    authorAddress: string;
    body: string;
    createdAt: number;
    updatedAt: number;
  }
): Promise<ListingCommentRow> {
  const p = ensurePool(_db);
  const res = await p.query(
    `WITH inserted AS (
       INSERT INTO listing_comments(listingid, listingchainkey, authoraddress, body, createdat, updatedat)
       VALUES($1,$2,$3,$4,$5,$6)
       RETURNING id, listingid, listingchainkey, authoraddress, body, createdat, updatedat
     )
     SELECT i.id,
            i.listingid AS "listingId",
            i.listingchainkey AS "listingChainKey",
            i.authoraddress AS "authorAddress",
            i.body,
            i.createdat AS "createdAt",
            i.updatedat AS "updatedAt",
            u.displayname AS "authorDisplayName"
     FROM inserted i
     LEFT JOIN users u ON u.address = i.authoraddress`,
    [input.listingId, input.listingChainKey, input.authorAddress, input.body, input.createdAt, input.updatedAt]
  );
  return toListingCommentRow(res.rows[0]);
}

export async function publishListingOrderIntent(_db: Pool | any, row: ListingOrderIntentRow): Promise<ListingOrderIntentRow> {
  const p = ensurePool(_db);
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "UPDATE listing_order_intents SET islatest = FALSE, updatedat = $3 WHERE chainkey = $1 AND listingid = $2 AND islatest = TRUE",
      [row.chainKey, row.listingId, row.updatedAt]
    );

    const res = await client.query(
      `INSERT INTO listing_order_intents(orderhash, chainkey, listingid, seller, signature, token, price, expiry, nonce, termshash, islatest, createdat, updatedat)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,TRUE,$11,$12)
       ON CONFLICT (orderhash) DO UPDATE SET
         chainkey = EXCLUDED.chainkey,
         listingid = EXCLUDED.listingid,
         seller = EXCLUDED.seller,
         signature = EXCLUDED.signature,
         token = EXCLUDED.token,
         price = EXCLUDED.price,
         expiry = EXCLUDED.expiry,
         nonce = EXCLUDED.nonce,
         termshash = EXCLUDED.termshash,
         islatest = TRUE,
         updatedat = EXCLUDED.updatedat
       RETURNING orderhash AS "orderHash",
                 chainkey AS "chainKey",
                 listingid AS "listingId",
                 seller,
                 signature,
                 token,
                 price,
                 expiry,
                 nonce,
                 termshash AS "termsHash",
                 islatest AS "isLatest",
                 createdat AS "createdAt",
                 updatedat AS "updatedAt"`,
      [
        row.orderHash,
        row.chainKey,
        row.listingId,
        row.seller,
        row.signature,
        row.token,
        row.price,
        row.expiry,
        row.nonce,
        row.termsHash,
        row.createdAt,
        row.updatedAt,
      ]
    );

    await client.query("COMMIT");
    return toListingOrderIntentRow(res.rows[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function findLatestListingOrderIntent(
  _db: Pool | any,
  listingId: string,
  chainKey: string
): Promise<ListingOrderIntentRow | null> {
  const p = ensurePool(_db);
  const res = await p.query(
    `SELECT orderhash AS "orderHash",
            chainkey AS "chainKey",
            listingid AS "listingId",
            seller,
            signature,
            token,
            price,
            expiry,
            nonce,
            termshash AS "termsHash",
            islatest AS "isLatest",
            createdat AS "createdAt",
            updatedat AS "updatedAt"
     FROM listing_order_intents
     WHERE listingid = $1 AND chainkey = $2 AND islatest = TRUE
     LIMIT 1`,
    [listingId, chainKey]
  );
  return res.rows[0] ? toListingOrderIntentRow(res.rows[0]) : null;
}

export async function findListingOrderIntentByHash(_db: Pool | any, orderHash: string): Promise<ListingOrderIntentRow | null> {
  const p = ensurePool(_db);
  const res = await p.query(
    `SELECT orderhash AS "orderHash",
            chainkey AS "chainKey",
            listingid AS "listingId",
            seller,
            signature,
            token,
            price,
            expiry,
            nonce,
            termshash AS "termsHash",
            islatest AS "isLatest",
            createdat AS "createdAt",
            updatedat AS "updatedAt"
     FROM listing_order_intents
     WHERE orderhash = $1
     LIMIT 1`,
    [orderHash]
  );
  return res.rows[0] ? toListingOrderIntentRow(res.rows[0]) : null;
}

export async function listSavedSearchesByUser(_db: Pool | any, userAddress: string): Promise<SavedSearchRow[]> {
  const p = ensurePool(_db);
  const res = await p.query(
    'SELECT id, useraddress AS "userAddress", name, email, queryjson AS "queryJson", lastcheckedat AS "lastCheckedAt", createdat AS "createdAt", updatedat AS "updatedAt" FROM saved_searches WHERE useraddress = $1 ORDER BY updatedat DESC, id DESC',
    [userAddress]
  );
  return res.rows.map(toSavedSearchRow);
}

export async function listAllSavedSearches(_db: Pool | any): Promise<SavedSearchRow[]> {
  const p = ensurePool(_db);
  const res = await p.query(
    'SELECT id, useraddress AS "userAddress", name, email, queryjson AS "queryJson", lastcheckedat AS "lastCheckedAt", createdat AS "createdAt", updatedat AS "updatedAt" FROM saved_searches ORDER BY updatedat ASC, id ASC'
  );
  return res.rows.map(toSavedSearchRow);
}

export async function findSavedSearchById(_db: Pool | any, id: number): Promise<SavedSearchRow | null> {
  const p = ensurePool(_db);
  const res = await p.query(
    'SELECT id, useraddress AS "userAddress", name, email, queryjson AS "queryJson", lastcheckedat AS "lastCheckedAt", createdat AS "createdAt", updatedat AS "updatedAt" FROM saved_searches WHERE id = $1',
    [id]
  );
  return res.rows[0] ? toSavedSearchRow(res.rows[0]) : null;
}

export async function createSavedSearch(_db: Pool | any, input: { userAddress: string; name: string; email?: string | null; filters: SavedSearchFilters; createdAt: number; updatedAt: number }): Promise<SavedSearchRow> {
  const p = ensurePool(_db);
  const res = await p.query(
    `INSERT INTO saved_searches(useraddress, name, email, queryjson, lastcheckedat, createdat, updatedat)
     VALUES($1,$2,$3,$4,$5,$6,$7)
     RETURNING id, useraddress AS "userAddress", name, email, queryjson AS "queryJson", lastcheckedat AS "lastCheckedAt", createdat AS "createdAt", updatedat AS "updatedAt"`,
    [input.userAddress, input.name, input.email ?? null, JSON.stringify(input.filters), input.createdAt, input.createdAt, input.updatedAt]
  );
  return toSavedSearchRow(res.rows[0]);
}

export async function updateSavedSearch(_db: Pool | any, input: { id: number; userAddress: string; name: string; email?: string | null; filters: SavedSearchFilters; updatedAt: number }): Promise<SavedSearchRow | null> {
  const p = ensurePool(_db);
  const res = await p.query(
    `UPDATE saved_searches
     SET name = $3,
         email = $4,
         queryjson = $5,
         updatedat = $6
     WHERE id = $1 AND useraddress = $2
     RETURNING id, useraddress AS "userAddress", name, email, queryjson AS "queryJson", lastcheckedat AS "lastCheckedAt", createdat AS "createdAt", updatedat AS "updatedAt"`,
    [input.id, input.userAddress, input.name, input.email ?? null, JSON.stringify(input.filters), input.updatedAt]
  );
  return res.rows[0] ? toSavedSearchRow(res.rows[0]) : null;
}

export async function updateSavedSearchLastCheckedAt(_db: Pool | any, id: number, lastCheckedAt: number) {
  const p = ensurePool(_db);
  await p.query('UPDATE saved_searches SET lastcheckedat = $2, updatedat = GREATEST(updatedat, $2) WHERE id = $1', [id, lastCheckedAt]);
}

export async function deleteSavedSearch(_db: Pool | any, id: number, userAddress: string) {
  const p = ensurePool(_db);
  await p.query('DELETE FROM saved_searches WHERE id = $1 AND useraddress = $2', [id, userAddress]);
}

export async function listNotificationsByUser(_db: Pool | any, userAddress: string, opts?: { limit?: number; unreadOnly?: boolean }): Promise<NotificationRow[]> {
  const p = ensurePool(_db);
  const params: any[] = [userAddress];
  const where = ['useraddress = $1'];
  if (opts?.unreadOnly) {
    where.push('readat IS NULL');
  }
  const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 200);
  params.push(limit);
  const res = await p.query(
    `SELECT id, useraddress AS "userAddress", type, title, body, dedupekey AS "dedupeKey", payloadjson AS "payloadJson", readat AS "readAt", createdat AS "createdAt"
     FROM notifications
     WHERE ${where.join(' AND ')}
     ORDER BY createdat DESC, id DESC
     LIMIT $2`,
    params
  );
  return res.rows.map(toNotificationRow);
}

export async function countUnreadNotifications(_db: Pool | any, userAddress: string): Promise<number> {
  const p = ensurePool(_db);
  const res = await p.query('SELECT COUNT(1) AS count FROM notifications WHERE useraddress = $1 AND readat IS NULL', [userAddress]);
  return Number(res.rows?.[0]?.count ?? 0);
}

export async function createNotification(_db: Pool | any, input: { userAddress: string; type: string; title: string; body: string; dedupeKey?: string | null; payload: Record<string, unknown>; createdAt: number }): Promise<NotificationRow | null> {
  const p = ensurePool(_db);
  if (input.dedupeKey) {
    const existing = await p.query('SELECT id, useraddress AS "userAddress", type, title, body, dedupekey AS "dedupeKey", payloadjson AS "payloadJson", readat AS "readAt", createdat AS "createdAt" FROM notifications WHERE dedupekey = $1 LIMIT 1', [input.dedupeKey]);
    if (existing.rows[0]) return null;
  }
  const res = await p.query(
    `INSERT INTO notifications(useraddress, type, title, body, dedupekey, payloadjson, createdat)
     VALUES($1,$2,$3,$4,$5,$6,$7)
     RETURNING id, useraddress AS "userAddress", type, title, body, dedupekey AS "dedupeKey", payloadjson AS "payloadJson", readat AS "readAt", createdat AS "createdAt"`,
    [input.userAddress, input.type, input.title, input.body, input.dedupeKey ?? null, JSON.stringify(input.payload), input.createdAt]
  );
  return toNotificationRow(res.rows[0]);
}

export async function markNotificationRead(_db: Pool | any, id: number, userAddress: string, readAt: number): Promise<boolean> {
  const p = ensurePool(_db);
  const res = await p.query('UPDATE notifications SET readat = COALESCE(readat, $3) WHERE id = $1 AND useraddress = $2', [id, userAddress, readAt]);
  return (res.rowCount ?? 0) > 0;
}

export async function markAllNotificationsRead(_db: Pool | any, userAddress: string, readAt: number) {
  const p = ensurePool(_db);
  await p.query('UPDATE notifications SET readat = $2 WHERE useraddress = $1 AND readat IS NULL', [userAddress, readAt]);
}
