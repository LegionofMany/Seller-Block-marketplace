-- Initial schema for Seller-Block Marketplace (Postgres)

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
  createdAt BIGINT NOT NULL,
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
  endTime BIGINT NOT NULL,
  FOREIGN KEY(listingId) REFERENCES listings(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS raffles (
  listingId TEXT PRIMARY KEY,
  ticketsSold INTEGER NOT NULL,
  endTime BIGINT NOT NULL,
  FOREIGN KEY(listingId) REFERENCES listings(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS metadata (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  image TEXT NOT NULL,
  attributesJson TEXT NOT NULL,
  createdAt BIGINT NOT NULL
);
