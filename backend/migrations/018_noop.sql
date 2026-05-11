-- Migration 018: placeholder (sequence gap filler)
-- This file intentionally contains no schema changes.
-- It exists to preserve the numeric sequence between 017 and 019
-- so the migration runner does not error or re-apply later migrations
-- if sequence continuity is ever validated.
SELECT 1;
