-- Add cascade tracking columns to listings table
ALTER TABLE listings 
  ADD COLUMN IF NOT EXISTS original_sale_type INTEGER,
  ADD COLUMN IF NOT EXISTS cascade_stage INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS listed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS cascade_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cascade_notified_at TIMESTAMPTZ;

-- Backfill existing listings
-- createdAt stored as BIGINT (Unix ms), cast to TIMESTAMPTZ
-- PostgreSQL lowercases all unquoted identifiers so columns
-- are saletype, createdat, active (not camelCase)
UPDATE listings 
  SET original_sale_type = saletype,
      listed_at = to_timestamp(createdat / 1000.0),
      cascade_at = to_timestamp(createdat / 1000.0) + INTERVAL '90 days'
  WHERE original_sale_type IS NULL
    AND saletype IN (0, 1, 2)
    AND active = 1;

-- Index for the cascade job query
CREATE INDEX IF NOT EXISTS idx_listings_cascade_at 
  ON listings (cascade_at) 
  WHERE active = 1 AND cascade_stage < 2;
