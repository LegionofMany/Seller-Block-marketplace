ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS emailnormalized TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS passwordhash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS emailverifiedat BIGINT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS authmethod TEXT NOT NULL DEFAULT 'wallet';
ALTER TABLE users ADD COLUMN IF NOT EXISTS linkedwalletaddress TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS lastloginat BIGINT;

UPDATE users
SET authmethod = CASE
  WHEN authmethod IS NULL OR authmethod = '' THEN 'wallet'
  ELSE authmethod
END;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_emailnormalized ON users(emailnormalized) WHERE emailnormalized IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_authmethod_updatedat ON users(authmethod, updatedat DESC);

CREATE TABLE IF NOT EXISTS user_favorite_listings (
  useraddress TEXT NOT NULL REFERENCES users(address) ON DELETE CASCADE,
  listingchainkey TEXT NOT NULL,
  listingid TEXT NOT NULL,
  createdat BIGINT NOT NULL,
  PRIMARY KEY (useraddress, listingchainkey, listingid),
  FOREIGN KEY (listingchainkey, listingid) REFERENCES listings(chainkey, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_favorite_listings_useraddress_createdat ON user_favorite_listings(useraddress, createdat DESC);
CREATE INDEX IF NOT EXISTS idx_user_favorite_listings_listing ON user_favorite_listings(listingchainkey, listingid);

CREATE TABLE IF NOT EXISTS payments (
  id BIGSERIAL PRIMARY KEY,
  useraddress TEXT NOT NULL REFERENCES users(address) ON DELETE CASCADE,
  listingid TEXT,
  listingchainkey TEXT,
  provider TEXT NOT NULL,
  providersessionid TEXT UNIQUE,
  status TEXT NOT NULL,
  amount BIGINT NOT NULL,
  currency TEXT NOT NULL,
  promotiontype TEXT,
  metadatajson TEXT NOT NULL DEFAULT '{}',
  createdat BIGINT NOT NULL,
  updatedat BIGINT NOT NULL,
  FOREIGN KEY (listingchainkey, listingid) REFERENCES listings(chainkey, id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_payments_useraddress_createdat ON payments(useraddress, createdat DESC);
CREATE INDEX IF NOT EXISTS idx_payments_listingchainkey_listingid_createdat ON payments(listingchainkey, listingid, createdat DESC);

CREATE TABLE IF NOT EXISTS promotions (
  id BIGSERIAL PRIMARY KEY,
  listingid TEXT NOT NULL,
  listingchainkey TEXT NOT NULL DEFAULT 'sepolia',
  paymentid BIGINT REFERENCES payments(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  startsat BIGINT NOT NULL,
  endsat BIGINT NOT NULL,
  createdat BIGINT NOT NULL,
  updatedat BIGINT NOT NULL,
  FOREIGN KEY (listingchainkey, listingid) REFERENCES listings(chainkey, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_promotions_listingchainkey_listingid_status ON promotions(listingchainkey, listingid, status, endsat DESC);
CREATE INDEX IF NOT EXISTS idx_promotions_active_window ON promotions(status, startsat, endsat);

ALTER TABLE promotions ADD COLUMN IF NOT EXISTS placementslot TEXT;
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS campaignname TEXT;
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS sponsorlabel TEXT;
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS createdby TEXT;
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS metadatajson TEXT;

UPDATE promotions
SET metadatajson = '{}'
WHERE metadatajson IS NULL OR BTRIM(metadatajson) = '';

ALTER TABLE promotions ALTER COLUMN metadatajson SET DEFAULT '{}';
ALTER TABLE promotions ALTER COLUMN metadatajson SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_promotions_homepage_status_window ON promotions(type, status, startsat, endsat, priority DESC);
CREATE INDEX IF NOT EXISTS idx_promotions_createdby_createdat ON promotions(createdby, createdat DESC);