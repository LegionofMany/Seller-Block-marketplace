CREATE TABLE IF NOT EXISTS user_trust_reviews (
  id BIGSERIAL PRIMARY KEY,
  useraddress TEXT NOT NULL REFERENCES users(address) ON DELETE CASCADE,
  reviewer TEXT NOT NULL,
  sellerverified BOOLEAN NOT NULL,
  sellertrustnote TEXT,
  previoussellerverified BOOLEAN,
  previoussellertrustnote TEXT,
  createdat BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_trust_reviews_user_createdat ON user_trust_reviews(useraddress, createdat DESC);
CREATE INDEX IF NOT EXISTS idx_user_trust_reviews_createdat ON user_trust_reviews(createdat DESC);