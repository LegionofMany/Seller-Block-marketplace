CREATE TABLE IF NOT EXISTS airdrop_claims (
  id SERIAL PRIMARY KEY,
  address TEXT NOT NULL,
  tx_hash TEXT,
  amount TEXT,
  claim_count INTEGER NOT NULL DEFAULT 1,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_airdrop_claims_address 
  ON airdrop_claims (address);
