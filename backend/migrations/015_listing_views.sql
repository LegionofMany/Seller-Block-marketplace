CREATE TABLE IF NOT EXISTS listing_views (
  id BIGSERIAL PRIMARY KEY,
  listingchainkey TEXT NOT NULL,
  listingid TEXT NOT NULL,
  viewerkey TEXT NOT NULL,
  viewbucketstart BIGINT NOT NULL,
  createdat BIGINT NOT NULL,
  FOREIGN KEY (listingchainkey, listingid) REFERENCES listings(chainkey, id) ON DELETE CASCADE,
  UNIQUE (listingchainkey, listingid, viewerkey, viewbucketstart)
);

CREATE INDEX IF NOT EXISTS idx_listing_views_listing_createdat ON listing_views(listingchainkey, listingid, createdat DESC);
CREATE INDEX IF NOT EXISTS idx_listing_views_createdat ON listing_views(createdat DESC);