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
  title: string;
  description: string;
  image: string;
  attributesJson: string;
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
  return {
    id: String(r.id),
    title: String(r.title),
    description: String(r.description),
    image: String(r.image),
    attributesJson: String(r.attributesJson ?? r.attributesjson ?? r.attributes_json),
    createdAt: Number(r.createdAt ?? r.createdat ?? r.created_at),
  };
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
    `INSERT INTO metadata(id, title, description, image, attributesJson, createdAt)
     VALUES($1,$2,$3,$4,$5,$6)
     ON CONFLICT (id) DO UPDATE SET
       title = EXCLUDED.title,
       description = EXCLUDED.description,
       image = EXCLUDED.image,
       attributesJson = EXCLUDED.attributesJson,
       createdAt = EXCLUDED.createdAt`,
    [row.id, row.title, row.description, row.image, row.attributesJson, row.createdAt]
  );
}

export async function findMetadata(_db: Pool | any, id: string): Promise<MetadataRow | null> {
  const p = ensurePool(_db);
  const res = await p.query(
    'SELECT id, title, description, image, attributesjson AS "attributesJson", createdat AS "createdAt" FROM metadata WHERE id = $1',
    [id]
  );
  return res.rows[0] ? toMetadataRow(res.rows[0]) : null;
}

export type ListingsQuery = {
  seller?: string | undefined;
  saleType?: number | undefined;
  active?: boolean | undefined;
  minPrice?: bigint | undefined;
  maxPrice?: bigint | undefined;
  limit: number;
  offset: number;
};

export async function queryListings(_db: Pool | any, q: ListingsQuery) {
  const p = ensurePool(_db);
  const where: string[] = [];
  const params: any[] = [];

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
    where.push(`CAST(price AS BIGINT) >= $${params.length + 1}`);
    params.push(q.minPrice.toString());
  }
  if (typeof q.maxPrice === "bigint") {
    where.push(`CAST(price AS BIGINT) <= $${params.length + 1}`);
    params.push(q.maxPrice.toString());
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  params.push(q.limit, q.offset);
  const limitParam = `$${params.length - 1}`;
  const offsetParam = `$${params.length}`;

  const res = await p.query(
    `SELECT id, seller, metadatauri AS "metadataURI", price, token, saletype AS "saleType", active, createdat AS "createdAt", blocknumber AS "blockNumber"
     FROM listings ${whereSql}
     ORDER BY blocknumber DESC
     LIMIT ${limitParam} OFFSET ${offsetParam}`,
    params
  );
  return res.rows.map(toListingRow);
}
