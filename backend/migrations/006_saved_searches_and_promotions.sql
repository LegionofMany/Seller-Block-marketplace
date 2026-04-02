CREATE TABLE IF NOT EXISTS saved_searches (
  id BIGSERIAL PRIMARY KEY,
  useraddress TEXT NOT NULL REFERENCES users(address) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  queryjson TEXT NOT NULL,
  lastcheckedat BIGINT NOT NULL DEFAULT 0,
  createdat BIGINT NOT NULL,
  updatedat BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_saved_searches_useraddress ON saved_searches(useraddress, updatedat DESC);

CREATE TABLE IF NOT EXISTS notifications (
  id BIGSERIAL PRIMARY KEY,
  useraddress TEXT NOT NULL REFERENCES users(address) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  dedupekey TEXT,
  payloadjson TEXT NOT NULL,
  readat BIGINT,
  createdat BIGINT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_dedupekey ON notifications(dedupekey) WHERE dedupekey IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_useraddress_createdat ON notifications(useraddress, createdat DESC);

CREATE TABLE IF NOT EXISTS payments (
  id BIGSERIAL PRIMARY KEY,
  useraddress TEXT NOT NULL REFERENCES users(address) ON DELETE CASCADE,
  listingid TEXT REFERENCES listings(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  providersessionid TEXT UNIQUE,
  status TEXT NOT NULL,
  amount BIGINT NOT NULL,
  currency TEXT NOT NULL,
  promotiontype TEXT,
  metadatajson TEXT NOT NULL,
  createdat BIGINT NOT NULL,
  updatedat BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_payments_useraddress_createdat ON payments(useraddress, createdat DESC);
CREATE INDEX IF NOT EXISTS idx_payments_listingid_createdat ON payments(listingid, createdat DESC);

CREATE TABLE IF NOT EXISTS promotions (
  id BIGSERIAL PRIMARY KEY,
  listingid TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  paymentid BIGINT REFERENCES payments(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  startsat BIGINT NOT NULL,
  endsat BIGINT NOT NULL,
  createdat BIGINT NOT NULL,
  updatedat BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_promotions_listingid_status ON promotions(listingid, status, endsat DESC);
CREATE INDEX IF NOT EXISTS idx_promotions_active_window ON promotions(status, startsat, endsat);