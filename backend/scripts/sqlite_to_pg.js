#!/usr/bin/env node
/*
  Simple migration script: copies data from a local SQLite DB to Postgres.
  Usage:
    DATABASE_URL=postgres://user:pass@host:5432/db DB_PATH=./data/marketplace.sqlite node scripts/sqlite_to_pg.js

  Note: run when Postgres is reachable and empty or compatible schema.
*/
const { Pool } = require('pg');
const Database = require('better-sqlite3');
const path = require('path');

function required(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing env ${name}`);
    process.exit(2);
  }
  return v;
}

const DATABASE_URL = process.env.DATABASE_URL || required('DATABASE_URL');
const DB_PATH = process.env.DB_PATH || './data/marketplace.sqlite';

async function run() {
  console.log('Connecting to Postgres...');
  const pool = new Pool({ connectionString: DATABASE_URL });
  const sqlitePath = path.resolve(DB_PATH);
  console.log('Opening SQLite:', sqlitePath);
  const sdb = new Database(sqlitePath, { readonly: true });

  try {
    // optional: ensure schema exists in Postgres by running migrations manually
    console.log('Beginning migration');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // indexer_state
      const states = sdb.prepare('SELECT key, value FROM indexer_state').all();
      for (const r of states) {
        await client.query(
          `INSERT INTO indexer_state(key, value) VALUES($1,$2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
          [r.key, r.value]
        );
      }

      // listings
      const listings = sdb.prepare('SELECT * FROM listings').all();
      for (const r of listings) {
        await client.query(
          `INSERT INTO listings(id, seller, metadataURI, price, token, saleType, active, createdAt, blockNumber)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
           ON CONFLICT (id) DO UPDATE SET
             seller = EXCLUDED.seller,
             metadataURI = EXCLUDED.metadataURI,
             price = EXCLUDED.price,
             token = EXCLUDED.token,
             saleType = EXCLUDED.saleType,
             active = EXCLUDED.active,
             createdAt = EXCLUDED.createdAt,
             blockNumber = EXCLUDED.blockNumber`,
          [r.id, r.seller, r.metadataURI, r.price, r.token, r.saleType, r.active, r.createdAt, r.blockNumber]
        );
      }

      // auctions
      const auctions = sdb.prepare('SELECT * FROM auctions').all();
      for (const r of auctions) {
        await client.query(
          `INSERT INTO auctions(listingId, highestBid, highestBidder, endTime)
           VALUES($1,$2,$3,$4)
           ON CONFLICT (listingId) DO UPDATE SET highestBid = EXCLUDED.highestBid, highestBidder = EXCLUDED.highestBidder, endTime = EXCLUDED.endTime`,
          [r.listingId, r.highestBid, r.highestBidder, r.endTime]
        );
      }

      // raffles
      const raffles = sdb.prepare('SELECT * FROM raffles').all();
      for (const r of raffles) {
        await client.query(
          `INSERT INTO raffles(listingId, ticketsSold, endTime)
           VALUES($1,$2,$3)
           ON CONFLICT (listingId) DO UPDATE SET ticketsSold = EXCLUDED.ticketsSold, endTime = EXCLUDED.endTime`,
          [r.listingId, r.ticketsSold, r.endTime]
        );
      }

      // metadata
      const metas = sdb.prepare('SELECT * FROM metadata').all();
      for (const r of metas) {
        await client.query(
          `INSERT INTO metadata(id, title, description, image, attributesJson, createdAt)
           VALUES($1,$2,$3,$4,$5,$6)
           ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description, image = EXCLUDED.image, attributesJson = EXCLUDED.attributesJson, createdAt = EXCLUDED.createdAt`,
          [r.id, r.title, r.description, r.image, r.attributesJson, r.createdAt]
        );
      }

      await client.query('COMMIT');
      console.log('Migration completed successfully');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } finally {
    sdb.close();
    await pool.end();
  }
}

run().catch((e) => {
  console.error('Migration failed:', e);
  process.exit(1);
});
