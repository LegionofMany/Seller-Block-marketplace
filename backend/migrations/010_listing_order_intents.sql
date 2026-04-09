CREATE TABLE IF NOT EXISTS listing_order_intents (
  orderhash TEXT PRIMARY KEY,
  chainkey TEXT NOT NULL,
  listingid TEXT NOT NULL,
  seller TEXT NOT NULL,
  signature TEXT NOT NULL,
  token TEXT NOT NULL,
  price TEXT NOT NULL,
  expiry BIGINT NOT NULL,
  nonce TEXT NOT NULL,
  termshash TEXT NOT NULL,
  islatest BOOLEAN NOT NULL DEFAULT TRUE,
  createdat BIGINT NOT NULL,
  updatedat BIGINT NOT NULL,
  FOREIGN KEY (chainkey, listingid) REFERENCES listings(chainkey, id) ON DELETE CASCADE,
  FOREIGN KEY (seller) REFERENCES users(address) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_listing_order_intents_latest_listing
  ON listing_order_intents(chainkey, listingid)
  WHERE islatest = TRUE;

CREATE INDEX IF NOT EXISTS idx_listing_order_intents_listing_updatedat
  ON listing_order_intents(chainkey, listingid, updatedat DESC);

CREATE INDEX IF NOT EXISTS idx_listing_order_intents_seller_updatedat
  ON listing_order_intents(seller, updatedat DESC);