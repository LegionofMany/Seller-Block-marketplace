ALTER TABLE listings ADD COLUMN IF NOT EXISTS chainkey TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS chainid INTEGER;

UPDATE listings
SET chainkey = COALESCE(NULLIF(chainkey, ''), 'sepolia'),
    chainid = COALESCE(chainid, 11155111)
WHERE chainkey IS NULL OR chainkey = '' OR chainid IS NULL;

ALTER TABLE listings ALTER COLUMN chainkey SET NOT NULL;
ALTER TABLE listings ALTER COLUMN chainid SET NOT NULL;
ALTER TABLE listings ALTER COLUMN chainkey SET DEFAULT 'sepolia';
ALTER TABLE listings ALTER COLUMN chainid SET DEFAULT 11155111;

ALTER TABLE auctions ADD COLUMN IF NOT EXISTS chainkey TEXT;
UPDATE auctions a
SET chainkey = COALESCE(a.chainkey, l.chainkey, 'sepolia')
FROM listings l
WHERE l.id = a.listingid
  AND (a.chainkey IS NULL OR a.chainkey = '');
UPDATE auctions SET chainkey = 'sepolia' WHERE chainkey IS NULL OR chainkey = '';
ALTER TABLE auctions ALTER COLUMN chainkey SET NOT NULL;
ALTER TABLE auctions ALTER COLUMN chainkey SET DEFAULT 'sepolia';

ALTER TABLE raffles ADD COLUMN IF NOT EXISTS chainkey TEXT;
UPDATE raffles r
SET chainkey = COALESCE(r.chainkey, l.chainkey, 'sepolia')
FROM listings l
WHERE l.id = r.listingid
  AND (r.chainkey IS NULL OR r.chainkey = '');
UPDATE raffles SET chainkey = 'sepolia' WHERE chainkey IS NULL OR chainkey = '';
ALTER TABLE raffles ALTER COLUMN chainkey SET NOT NULL;
ALTER TABLE raffles ALTER COLUMN chainkey SET DEFAULT 'sepolia';

ALTER TABLE payments ADD COLUMN IF NOT EXISTS listingchainkey TEXT;
UPDATE payments p
SET listingchainkey = COALESCE(p.listingchainkey, l.chainkey, 'sepolia')
FROM listings l
WHERE l.id = p.listingid
  AND p.listingid IS NOT NULL
  AND (p.listingchainkey IS NULL OR p.listingchainkey = '');

ALTER TABLE promotions ADD COLUMN IF NOT EXISTS listingchainkey TEXT;
UPDATE promotions pr
SET listingchainkey = COALESCE(pr.listingchainkey, l.chainkey, 'sepolia')
FROM listings l
WHERE l.id = pr.listingid
  AND (pr.listingchainkey IS NULL OR pr.listingchainkey = '');
UPDATE promotions SET listingchainkey = 'sepolia' WHERE listingchainkey IS NULL OR listingchainkey = '';
ALTER TABLE promotions ALTER COLUMN listingchainkey SET NOT NULL;
ALTER TABLE promotions ALTER COLUMN listingchainkey SET DEFAULT 'sepolia';

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS listingchainkey TEXT;
UPDATE conversations c
SET listingchainkey = COALESCE(c.listingchainkey, l.chainkey, 'sepolia')
FROM listings l
WHERE l.id = c.listingid
  AND c.listingid IS NOT NULL
  AND (c.listingchainkey IS NULL OR c.listingchainkey = '');

ALTER TABLE auctions DROP CONSTRAINT IF EXISTS auctions_pkey;
ALTER TABLE raffles DROP CONSTRAINT IF EXISTS raffles_pkey;
ALTER TABLE auctions DROP CONSTRAINT IF EXISTS auctions_listingid_fkey;
ALTER TABLE raffles DROP CONSTRAINT IF EXISTS raffles_listingid_fkey;
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_listingid_fkey;
ALTER TABLE promotions DROP CONSTRAINT IF EXISTS promotions_listingid_fkey;
ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_listingid_fkey;
ALTER TABLE listings DROP CONSTRAINT IF EXISTS listings_pkey;

ALTER TABLE listings ADD CONSTRAINT listings_pkey PRIMARY KEY (chainkey, id);
ALTER TABLE auctions ADD CONSTRAINT auctions_pkey PRIMARY KEY (chainkey, listingid);
ALTER TABLE raffles ADD CONSTRAINT raffles_pkey PRIMARY KEY (chainkey, listingid);

ALTER TABLE auctions
  ADD CONSTRAINT auctions_listing_chain_fkey
  FOREIGN KEY (chainkey, listingid) REFERENCES listings(chainkey, id) ON DELETE CASCADE;

ALTER TABLE raffles
  ADD CONSTRAINT raffles_listing_chain_fkey
  FOREIGN KEY (chainkey, listingid) REFERENCES listings(chainkey, id) ON DELETE CASCADE;

ALTER TABLE payments
  ADD CONSTRAINT payments_listing_chain_fkey
  FOREIGN KEY (listingchainkey, listingid) REFERENCES listings(chainkey, id) ON DELETE SET NULL;

ALTER TABLE promotions
  ADD CONSTRAINT promotions_listing_chain_fkey
  FOREIGN KEY (listingchainkey, listingid) REFERENCES listings(chainkey, id) ON DELETE CASCADE;

ALTER TABLE conversations
  ADD CONSTRAINT conversations_listing_chain_fkey
  FOREIGN KEY (listingchainkey, listingid) REFERENCES listings(chainkey, id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_listings_chainid ON listings(chainid);
CREATE INDEX IF NOT EXISTS idx_listings_chainkey_active ON listings(chainkey, active, blocknumber DESC);
CREATE INDEX IF NOT EXISTS idx_listings_seller_chainkey ON listings(seller, chainkey);
CREATE INDEX IF NOT EXISTS idx_auctions_chainkey_listingid ON auctions(chainkey, listingid);
CREATE INDEX IF NOT EXISTS idx_raffles_chainkey_listingid ON raffles(chainkey, listingid);
CREATE INDEX IF NOT EXISTS idx_payments_listingchainkey_listingid_createdat ON payments(listingchainkey, listingid, createdat DESC);
CREATE INDEX IF NOT EXISTS idx_promotions_listingchainkey_listingid_status ON promotions(listingchainkey, listingid, status, endsat DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_listingchainkey_listingid ON conversations(listingchainkey, listingid);
