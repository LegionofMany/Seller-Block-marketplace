-- Migration: Add stablecoinaddress to users
-- Generated: 2026-04-27

ALTER TABLE users
ADD COLUMN IF NOT EXISTS stablecoinaddress TEXT;

-- Optional: populate existing users with NULL (no-op)
UPDATE users SET stablecoinaddress = NULL WHERE stablecoinaddress IS NULL;
