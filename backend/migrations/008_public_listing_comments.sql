CREATE TABLE IF NOT EXISTS listing_comments (
  id BIGSERIAL PRIMARY KEY,
  listingid TEXT NOT NULL,
  listingchainkey TEXT NOT NULL,
  authoraddress TEXT NOT NULL,
  body TEXT NOT NULL,
  createdat BIGINT NOT NULL,
  updatedat BIGINT NOT NULL,
  FOREIGN KEY (listingchainkey, listingid) REFERENCES listings(chainkey, id) ON DELETE CASCADE,
  FOREIGN KEY (authoraddress) REFERENCES users(address) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_listing_comments_listing_createdat
  ON listing_comments(listingchainkey, listingid, createdat DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_listing_comments_author_createdat
  ON listing_comments(authoraddress, createdat DESC, id DESC);