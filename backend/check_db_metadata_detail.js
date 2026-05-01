const { Pool } = require('pg');

async function check() {
  const pool = new Pool({
    connectionString: "postgresql://market_hub_5cd3_user:PSocYkgCI88kvUqZSZThqe5KTVetQIJc@dpg-d76fcaudqaus73cv6f6g-a.oregon-postgres.render.com/market_hub_5cd3?sslmode=require"
  });
  
  try {
    const res = await pool.query("SELECT * FROM metadata WHERE uri LIKE 'ipfs://%' ORDER BY createdat DESC LIMIT 1");
    console.log(JSON.stringify(res.rows[0], null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}
check();
