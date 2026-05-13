-- Add geocoded coordinates and country to metadata rows.
-- All columns are nullable so existing rows stay untouched.
ALTER TABLE metadata
  ADD COLUMN IF NOT EXISTS lat  DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS lng  DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS country TEXT;
