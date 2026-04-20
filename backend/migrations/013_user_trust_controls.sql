ALTER TABLE users ADD COLUMN IF NOT EXISTS sellerverifiedat BIGINT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS sellerverifiedby TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS sellertrustnote TEXT;

CREATE INDEX IF NOT EXISTS idx_users_sellerverifiedat ON users(sellerverifiedat DESC);