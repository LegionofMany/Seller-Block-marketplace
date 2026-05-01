const { Pool } = require('pg');

async function check() {
  const pool = new Pool({
    connectionString: "postgresql://market_hub_5cd3_user:PSocYkgCI88kvUqZSZThqe5KTVetQIJc@dpg-d76fcaudqaus73cv6f6g-a.oregon-postgres.render.com/market_hub_5cd3?sslmode=require"
  });
  
  try {
    const res = await pool.query("SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'metadata'");
    console.log(JSON.stringify(res.rows, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}
check();
