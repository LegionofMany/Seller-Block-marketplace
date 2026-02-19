import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

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

let singleton: Database.Database | null = null;

export function openDb(dbPath: string) {
  if (singleton) return singleton;

  // Resolve relative paths against the backend package root (not process.cwd()),
  // so `npm run dev` from different working directories always hits the same DB file.
  const backendRoot = path.resolve(__dirname, "..", "..", "..");
  const absPath = path.isAbsolute(dbPath) ? dbPath : path.join(backendRoot, dbPath);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });

  const db = new Database(absPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  migrate(db);

  singleton = db;
  return db;
}

function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS indexer_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS listings (
      id TEXT PRIMARY KEY,
      seller TEXT NOT NULL,
      metadataURI TEXT NOT NULL,
      price TEXT NOT NULL,
      token TEXT NOT NULL,
      saleType INTEGER NOT NULL,
      active INTEGER NOT NULL,
      createdAt INTEGER NOT NULL,
      blockNumber INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_listings_seller ON listings(seller);
    CREATE INDEX IF NOT EXISTS idx_listings_active ON listings(active);
    CREATE INDEX IF NOT EXISTS idx_listings_saleType ON listings(saleType);
    CREATE INDEX IF NOT EXISTS idx_listings_price ON listings(price);

    CREATE TABLE IF NOT EXISTS auctions (
      listingId TEXT PRIMARY KEY,
      highestBid TEXT NOT NULL,
      highestBidder TEXT NOT NULL,
      endTime INTEGER NOT NULL,
      FOREIGN KEY(listingId) REFERENCES listings(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS raffles (
      listingId TEXT PRIMARY KEY,
      ticketsSold INTEGER NOT NULL,
      endTime INTEGER NOT NULL,
      FOREIGN KEY(listingId) REFERENCES listings(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS metadata (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      image TEXT NOT NULL,
      attributesJson TEXT NOT NULL,
      createdAt INTEGER NOT NULL
    );
  `);
}

export function getCheckpoint(db: Database.Database, key: string): number | null {
  const row = db.prepare("SELECT value FROM indexer_state WHERE key = ?").get(key) as { value: string } | undefined;
  if (!row) return null;
  const parsed = Number(row.value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function setCheckpoint(db: Database.Database, key: string, value: number) {
  db.prepare("INSERT INTO indexer_state(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(
    key,
    String(value)
  );
}

export function upsertListing(db: Database.Database, row: ListingRow) {
  db.prepare(
    `INSERT INTO listings(id, seller, metadataURI, price, token, saleType, active, createdAt, blockNumber)
     VALUES(@id, @seller, @metadataURI, @price, @token, @saleType, @active, @createdAt, @blockNumber)
     ON CONFLICT(id) DO UPDATE SET
       seller = excluded.seller,
       metadataURI = excluded.metadataURI,
       price = excluded.price,
       token = excluded.token,
       saleType = excluded.saleType,
       active = excluded.active,
       createdAt = excluded.createdAt,
       blockNumber = excluded.blockNumber
    `
  ).run(row);
}

export function setListingActive(db: Database.Database, listingId: string, active: 0 | 1) {
  db.prepare("UPDATE listings SET active = ? WHERE id = ?").run(active, listingId);
}

export function upsertAuction(db: Database.Database, row: AuctionRow) {
  db.prepare(
    `INSERT INTO auctions(listingId, highestBid, highestBidder, endTime)
     VALUES(@listingId, @highestBid, @highestBidder, @endTime)
     ON CONFLICT(listingId) DO UPDATE SET
       highestBid = excluded.highestBid,
       highestBidder = excluded.highestBidder,
       endTime = excluded.endTime
    `
  ).run(row);
}

export function updateAuctionBid(db: Database.Database, listingId: string, bidder: string, amount: bigint) {
  const existing = db.prepare("SELECT highestBid FROM auctions WHERE listingId = ?").get(listingId) as
    | { highestBid: string }
    | undefined;

  const current = existing ? BigInt(existing.highestBid) : 0n;
  if (amount <= current) return;

  db.prepare(
    `INSERT INTO auctions(listingId, highestBid, highestBidder, endTime)
     VALUES(?, ?, ?, 0)
     ON CONFLICT(listingId) DO UPDATE SET highestBid = excluded.highestBid, highestBidder = excluded.highestBidder`
  ).run(listingId, amount.toString(), bidder);
}

export function upsertRaffle(db: Database.Database, row: RaffleRow) {
  db.prepare(
    `INSERT INTO raffles(listingId, ticketsSold, endTime)
     VALUES(@listingId, @ticketsSold, @endTime)
     ON CONFLICT(listingId) DO UPDATE SET
       ticketsSold = excluded.ticketsSold,
       endTime = excluded.endTime`
  ).run(row);
}

export function incrementRaffleTickets(db: Database.Database, listingId: string, tickets: number) {
  db.prepare(
    `INSERT INTO raffles(listingId, ticketsSold, endTime)
     VALUES(?, ?, 0)
     ON CONFLICT(listingId) DO UPDATE SET ticketsSold = ticketsSold + excluded.ticketsSold`
  ).run(listingId, tickets);
}

export function findListing(db: Database.Database, id: string): ListingRow | null {
  return (db.prepare("SELECT * FROM listings WHERE id = ?").get(id) as ListingRow | undefined) ?? null;
}

export function findAuction(db: Database.Database, listingId: string): AuctionRow | null {
  return (db.prepare("SELECT * FROM auctions WHERE listingId = ?").get(listingId) as AuctionRow | undefined) ?? null;
}

export function findRaffle(db: Database.Database, listingId: string): RaffleRow | null {
  return (db.prepare("SELECT * FROM raffles WHERE listingId = ?").get(listingId) as RaffleRow | undefined) ?? null;
}

export function upsertMetadata(db: Database.Database, row: MetadataRow) {
  db.prepare(
    `INSERT INTO metadata(id, title, description, image, attributesJson, createdAt)
     VALUES(@id, @title, @description, @image, @attributesJson, @createdAt)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       description = excluded.description,
       image = excluded.image,
       attributesJson = excluded.attributesJson,
       createdAt = excluded.createdAt`
  ).run(row);
}

export function findMetadata(db: Database.Database, id: string): MetadataRow | null {
  return (db.prepare("SELECT * FROM metadata WHERE id = ?").get(id) as MetadataRow | undefined) ?? null;
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

export function queryListings(db: Database.Database, q: ListingsQuery) {
  const where: string[] = [];
  const params: any[] = [];

  if (q.seller) {
    where.push("seller = ?");
    params.push(q.seller);
  }
  if (typeof q.saleType === "number") {
    where.push("saleType = ?");
    params.push(q.saleType);
  }
  if (typeof q.active === "boolean") {
    where.push("active = ?");
    params.push(q.active ? 1 : 0);
  }
  if (typeof q.minPrice === "bigint") {
    // Stored as decimal strings, so cast to INTEGER for comparisons.
    where.push("CAST(price AS INTEGER) >= ?");
    params.push(q.minPrice.toString());
  }
  if (typeof q.maxPrice === "bigint") {
    where.push("CAST(price AS INTEGER) <= ?");
    params.push(q.maxPrice.toString());
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const rows = db
    .prepare(
      `SELECT * FROM listings ${whereSql} ORDER BY blockNumber DESC LIMIT ? OFFSET ?`
    )
    .all(...params, q.limit, q.offset) as ListingRow[];

  return rows;
}
