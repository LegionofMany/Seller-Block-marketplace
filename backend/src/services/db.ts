import fs from "node:fs";
import path from "node:path";
import { Pool } from "pg";

export type ListingRow = {
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
  listingId: string;
  highestBid: string;
  highestBidder: string;
  endTime: number;
};

export type RaffleRow = {
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
  displayName?: string | null;
  bio?: string | null;
  avatarCid?: string | null;
  createdAt: number;
  updatedAt: number;
};

export type PublicUserProfileRow = {
  user: UserRow;
  listingCount: number;
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

export type ConversationRow = {
  id: number;
  listingId?: string | null;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  counterparty?: string | null;
  lastMessageBody?: string | null;
  lastMessageAt?: number | null;
  messageCount?: number;
};

export type MessageRow = {
  id: number;
  conversationId: number;
  sender: string;
  body: string;
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

function toAuctionRow(r: any): AuctionRow {
  return {
    listingId: String(r.listingId ?? r.listingid ?? r.listing_id),
    highestBid: String(r.highestBid ?? r.highestbid ?? r.highest_bid),
    highestBidder: String(r.highestBidder ?? r.highestbidder ?? r.highest_bidder),
    endTime: Number(r.endTime ?? r.endtime ?? r.end_time),
  };
}

function toRaffleRow(r: any): RaffleRow {
  return {
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
    `INSERT INTO listings(id, seller, metadataURI, price, token, saleType, active, createdAt, blockNumber)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (id) DO UPDATE SET
       seller = EXCLUDED.seller,
       metadataURI = EXCLUDED.metadataURI,
       price = EXCLUDED.price,
       token = EXCLUDED.token,
       saleType = EXCLUDED.saleType,
       active = EXCLUDED.active,
       createdAt = EXCLUDED.createdAt,
       blockNumber = EXCLUDED.blockNumber
    `,
    [row.id, row.seller, row.metadataURI, row.price, row.token, row.saleType, row.active, row.createdAt, row.blockNumber]
  );
}

export async function setListingActive(_db: Pool | any, listingId: string, active: 0 | 1) {
  const p = ensurePool(_db);
  await p.query("UPDATE listings SET active = $1 WHERE id = $2", [active, listingId]);
}

export async function upsertAuction(_db: Pool | any, row: AuctionRow) {
  const p = ensurePool(_db);
  await p.query(
    `INSERT INTO auctions(listingId, highestBid, highestBidder, endTime)
     VALUES($1,$2,$3,$4)
     ON CONFLICT (listingId) DO UPDATE SET
       highestBid = EXCLUDED.highestBid,
       highestBidder = EXCLUDED.highestBidder,
       endTime = EXCLUDED.endTime
    `,
    [row.listingId, row.highestBid, row.highestBidder, row.endTime]
  );
}

export async function updateAuctionBid(_db: Pool | any, listingId: string, bidder: string, amount: bigint) {
  const p = ensurePool(_db);
  const res = await p.query('SELECT highestbid AS "highestBid" FROM auctions WHERE listingid = $1', [listingId]);
  const current = res.rows.length ? BigInt(res.rows[0].highestBid) : 0n;
  if (amount <= current) return;
  await p.query(
    `INSERT INTO auctions(listingId, highestBid, highestBidder, endTime)
     VALUES($1,$2,$3,0)
     ON CONFLICT (listingId) DO UPDATE SET highestBid = EXCLUDED.highestBid, highestBidder = EXCLUDED.highestBidder`,
    [listingId, amount.toString(), bidder]
  );
}

export async function upsertRaffle(_db: Pool | any, row: RaffleRow) {
  const p = ensurePool(_db);
  await p.query(
    `INSERT INTO raffles(listingId, ticketsSold, endTime)
     VALUES($1,$2,$3)
     ON CONFLICT (listingId) DO UPDATE SET
       ticketsSold = EXCLUDED.ticketsSold,
       endTime = EXCLUDED.endTime`,
    [row.listingId, row.ticketsSold, row.endTime]
  );
}

export async function incrementRaffleTickets(_db: Pool | any, listingId: string, tickets: number) {
  const p = ensurePool(_db);
  await p.query(
    `INSERT INTO raffles(listingId, ticketsSold, endTime)
     VALUES($1,$2,0)
     ON CONFLICT (listingId) DO UPDATE SET ticketsSold = raffles.ticketsSold + EXCLUDED.ticketsSold`,
    [listingId, tickets]
  );
}

export async function findListing(_db: Pool | any, id: string): Promise<ListingRow | null> {
  const p = ensurePool(_db);
  const res = await p.query(
    'SELECT id, seller, metadatauri AS "metadataURI", price, token, saletype AS "saleType", active, createdat AS "createdAt", blocknumber AS "blockNumber" FROM listings WHERE id = $1',
    [id]
  );
  return res.rows[0] ? toListingRow(res.rows[0]) : null;
}

export async function findAuction(_db: Pool | any, listingId: string): Promise<AuctionRow | null> {
  const p = ensurePool(_db);
  const res = await p.query(
    'SELECT listingid AS "listingId", highestbid AS "highestBid", highestbidder AS "highestBidder", endtime AS "endTime" FROM auctions WHERE listingid = $1',
    [listingId]
  );
  return res.rows[0] ? toAuctionRow(res.rows[0]) : null;
}

export async function findRaffle(_db: Pool | any, listingId: string): Promise<RaffleRow | null> {
  const p = ensurePool(_db);
  const res = await p.query(
    'SELECT listingid AS "listingId", ticketssold AS "ticketsSold", endtime AS "endTime" FROM raffles WHERE listingid = $1',
    [listingId]
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
  seller?: string | undefined;
  saleType?: number | undefined;
  active?: boolean | undefined;
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

  const joinMetadata = Boolean(q.q || q.category || q.subcategory || q.city || q.region || q.postalCode);

  if (q.seller) {
    where.push(`seller = $${params.length + 1}`);
    params.push(q.seller);
  }
  if (typeof q.saleType === "number") {
    where.push(`saleType = $${params.length + 1}`);
    params.push(q.saleType);
  }
  if (typeof q.active === "boolean") {
    where.push(`active = $${params.length + 1}`);
    params.push(q.active ? 1 : 0);
  }
  if (typeof q.minPrice === "bigint") {
    where.push(`CAST(price AS NUMERIC) >= $${params.length + 1}`);
    params.push(q.minPrice.toString());
  }
  if (typeof q.maxPrice === "bigint") {
    where.push(`CAST(price AS NUMERIC) <= $${params.length + 1}`);
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
      `(SELECT COUNT(1) FROM reports r WHERE r.targettype = 'listing' AND r.targetid = listings.id) < $${params.length + 1}`
    );
    params.push(q.autoHideReportThreshold);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const orderBy = (() => {
    if (q.sort === "price_asc") return `ORDER BY CAST(price AS NUMERIC) ASC, blocknumber DESC`;
    if (q.sort === "price_desc") return `ORDER BY CAST(price AS NUMERIC) DESC, blocknumber DESC`;
    return `ORDER BY blocknumber DESC`;
  })();

  params.push(q.limit, q.offset);
  const limitParam = `$${params.length - 1}`;
  const offsetParam = `$${params.length}`;

  const res = await p.query(
    `SELECT id, seller, metadatauri AS "metadataURI", price, token, saletype AS "saleType", active, createdat AS "createdAt", blocknumber AS "blockNumber"
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
    displayName: r.displayName ?? r.displayname ?? null,
    bio: r.bio ?? null,
    avatarCid: r.avatarCid ?? r.avatarcid ?? null,
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

function toConversationRow(r: any): ConversationRow {
  return {
    id: Number(r.id),
    listingId: r.listingId ?? r.listingid ?? null,
    createdBy: String(r.createdBy ?? r.createdby),
    createdAt: Number(r.createdAt ?? r.createdat ?? 0),
    updatedAt: Number(r.updatedAt ?? r.updatedat ?? 0),
    counterparty: r.counterparty ?? null,
    lastMessageBody: r.lastMessageBody ?? r.lastmessagebody ?? null,
    lastMessageAt: r.lastMessageAt != null ? Number(r.lastMessageAt ?? r.lastmessageat) : null,
    ...(r.messageCount != null || r.messagecount != null
      ? { messageCount: Number(r.messageCount ?? r.messagecount) }
      : {}),
  };
}

function toMessageRow(r: any): MessageRow {
  return {
    id: Number(r.id),
    conversationId: Number(r.conversationId ?? r.conversationid),
    sender: String(r.sender),
    body: String(r.body),
    createdAt: Number(r.createdAt ?? r.createdat ?? 0),
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

export async function getUser(_db: Pool | any, address: string): Promise<UserRow | null> {
  const p = ensurePool(_db);
  const res = await p.query(
    'SELECT address, displayname AS "displayName", bio, avatarcid AS "avatarCid", createdat AS "createdAt", updatedat AS "updatedAt" FROM users WHERE address = $1',
    [address]
  );
  return res.rows[0] ? toUserRow(res.rows[0]) : null;
}

export async function updateUserProfile(_db: Pool | any, row: { address: string; displayName?: string | null; bio?: string | null; avatarCid?: string | null; updatedAt: number }) {
  const p = ensurePool(_db);
  await p.query(
    `INSERT INTO users(address, displayName, bio, avatarCid, createdAt, updatedAt)
     VALUES($1,$2,$3,$4,$5,$5)
     ON CONFLICT (address) DO UPDATE SET
       displayName = EXCLUDED.displayName,
       bio = EXCLUDED.bio,
       avatarCid = EXCLUDED.avatarCid,
       updatedAt = EXCLUDED.updatedAt`,
    [row.address, row.displayName ?? null, row.bio ?? null, row.avatarCid ?? null, row.updatedAt]
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
    displayName: null,
    bio: null,
    avatarCid: null,
    createdAt: firstCreatedAt || Date.now(),
    updatedAt: firstCreatedAt || Date.now(),
  };

  return {
    user: fallbackUser,
    listingCount,
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

export async function hasUserBlockBetween(_db: Pool | any, a: string, b: string): Promise<boolean> {
  const p = ensurePool(_db);
  const res = await p.query(
    `SELECT 1 FROM user_blocks WHERE (blocker = $1 AND blocked = $2) OR (blocker = $2 AND blocked = $1) LIMIT 1`,
    [a, b]
  );
  return Boolean(res.rows[0]);
}

export async function findConversationByParticipants(_db: Pool | any, a: string, b: string, listingId?: string | null): Promise<ConversationRow | null> {
  const p = ensurePool(_db);
  const res = await p.query(
    `SELECT c.id, c.listingid AS "listingId", c.createdby AS "createdBy", c.createdat AS "createdAt", c.updatedat AS "updatedAt"
     FROM conversations c
     INNER JOIN conversation_participants p1 ON p1.conversationid = c.id AND p1.participant = $1
     INNER JOIN conversation_participants p2 ON p2.conversationid = c.id AND p2.participant = $2
     WHERE (($3::text IS NULL AND c.listingid IS NULL) OR c.listingid = $3)
     ORDER BY c.updatedat DESC
     LIMIT 1`,
    [a, b, listingId ?? null]
  );
  return res.rows[0] ? toConversationRow(res.rows[0]) : null;
}

export async function createConversation(_db: Pool | any, input: { listingId?: string | null; createdBy: string; createdAt: number; updatedAt: number }): Promise<ConversationRow> {
  const p = ensurePool(_db);
  const res = await p.query(
    `INSERT INTO conversations(listingId, createdBy, createdAt, updatedAt)
     VALUES($1,$2,$3,$4)
     RETURNING id, listingid AS "listingId", createdby AS "createdBy", createdat AS "createdAt", updatedat AS "updatedAt"`,
    [input.listingId ?? null, input.createdBy, input.createdAt, input.updatedAt]
  );
  return toConversationRow(res.rows[0]);
}

export async function addConversationParticipant(_db: Pool | any, conversationId: number, participant: string, createdAt: number) {
  const p = ensurePool(_db);
  await p.query(
    `INSERT INTO conversation_participants(conversationId, participant, createdAt)
     VALUES($1,$2,$3)
     ON CONFLICT (conversationId, participant) DO NOTHING`,
    [conversationId, participant, createdAt]
  );
}

export async function getConversation(_db: Pool | any, conversationId: number): Promise<ConversationRow | null> {
  const p = ensurePool(_db);
  const res = await p.query(
    'SELECT id, listingid AS "listingId", createdby AS "createdBy", createdat AS "createdAt", updatedat AS "updatedAt" FROM conversations WHERE id = $1',
    [conversationId]
  );
  return res.rows[0] ? toConversationRow(res.rows[0]) : null;
}

export async function listConversationParticipants(_db: Pool | any, conversationId: number): Promise<string[]> {
  const p = ensurePool(_db);
  const res = await p.query('SELECT participant FROM conversation_participants WHERE conversationid = $1 ORDER BY participant ASC', [conversationId]);
  return res.rows.map((r: any) => String(r.participant));
}

export async function touchConversation(_db: Pool | any, conversationId: number, updatedAt: number) {
  const p = ensurePool(_db);
  await p.query('UPDATE conversations SET updatedat = $2 WHERE id = $1', [conversationId, updatedAt]);
}

export async function listUserConversations(_db: Pool | any, participant: string): Promise<ConversationRow[]> {
  const p = ensurePool(_db);
  const res = await p.query(
    `SELECT c.id,
            c.listingid AS "listingId",
            c.createdby AS "createdBy",
            c.createdat AS "createdAt",
            c.updatedat AS "updatedAt",
            cp.participant AS counterparty,
            lm.body AS "lastMessageBody",
            lm.createdat AS "lastMessageAt",
            COALESCE(mc.count, 0) AS "messageCount"
     FROM conversations c
     INNER JOIN conversation_participants selfp ON selfp.conversationid = c.id AND selfp.participant = $1
     LEFT JOIN LATERAL (
       SELECT participant FROM conversation_participants WHERE conversationid = c.id AND participant <> $1 ORDER BY participant LIMIT 1
     ) cp ON true
     LEFT JOIN LATERAL (
       SELECT body, createdat FROM messages WHERE conversationid = c.id ORDER BY createdat DESC, id DESC LIMIT 1
     ) lm ON true
     LEFT JOIN LATERAL (
       SELECT COUNT(1) AS count FROM messages WHERE conversationid = c.id
     ) mc ON true
     ORDER BY COALESCE(lm.createdat, c.updatedat) DESC, c.id DESC`,
    [participant]
  );
  return res.rows.map(toConversationRow);
}

export async function listConversationMessages(_db: Pool | any, conversationId: number, opts: { limit: number; beforeId?: number | undefined; since?: number | undefined }): Promise<MessageRow[]> {
  const p = ensurePool(_db);
  const where: string[] = ['conversationid = $1'];
  const params: any[] = [conversationId];

  if (typeof opts.beforeId === 'number' && Number.isFinite(opts.beforeId)) {
    where.push(`id < $${params.length + 1}`);
    params.push(opts.beforeId);
  }
  if (typeof opts.since === 'number' && Number.isFinite(opts.since)) {
    where.push(`createdat > $${params.length + 1}`);
    params.push(opts.since);
  }

  params.push(Math.min(Math.max(opts.limit, 1), 100));
  const limitParam = `$${params.length}`;
  const res = await p.query(
    `SELECT id, conversationid AS "conversationId", sender, body, createdat AS "createdAt"
     FROM messages
     WHERE ${where.join(' AND ')}
     ORDER BY createdat DESC, id DESC
     LIMIT ${limitParam}`,
    params
  );
  return res.rows.map(toMessageRow).reverse();
}

export async function createMessage(_db: Pool | any, input: { conversationId: number; sender: string; body: string; createdAt: number }): Promise<MessageRow> {
  const p = ensurePool(_db);
  const res = await p.query(
    `INSERT INTO messages(conversationId, sender, body, createdAt)
     VALUES($1,$2,$3,$4)
     RETURNING id, conversationid AS "conversationId", sender, body, createdat AS "createdAt"`,
    [input.conversationId, input.sender, input.body, input.createdAt]
  );
  return toMessageRow(res.rows[0]);
}
