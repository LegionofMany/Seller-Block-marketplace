-- Phase 1: IPFS-backed metadata + classifieds fields

-- Add a stable lookup key for metadata by URI (supports ipfs://... and legacy metadata://sha256/...)
ALTER TABLE metadata ADD COLUMN IF NOT EXISTS uri TEXT;

-- Backfill existing rows with the legacy placeholder URI
UPDATE metadata
SET uri = CONCAT('metadata://sha256/', id)
WHERE uri IS NULL OR uri = '';

-- Ensure uniqueness for lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_metadata_uri_unique ON metadata(uri);

-- Support multiple images + classifieds fields
ALTER TABLE metadata ADD COLUMN IF NOT EXISTS imagesJson TEXT NOT NULL DEFAULT '[]';
ALTER TABLE metadata ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE metadata ADD COLUMN IF NOT EXISTS subcategory TEXT;
ALTER TABLE metadata ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE metadata ADD COLUMN IF NOT EXISTS region TEXT;
ALTER TABLE metadata ADD COLUMN IF NOT EXISTS postalCode TEXT;
ALTER TABLE metadata ADD COLUMN IF NOT EXISTS contactEmail TEXT;
ALTER TABLE metadata ADD COLUMN IF NOT EXISTS contactPhone TEXT;

CREATE INDEX IF NOT EXISTS idx_metadata_category ON metadata(category);
CREATE INDEX IF NOT EXISTS idx_metadata_city ON metadata(city);
CREATE INDEX IF NOT EXISTS idx_metadata_region ON metadata(region);
