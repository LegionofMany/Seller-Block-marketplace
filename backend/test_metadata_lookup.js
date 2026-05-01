const fetch = require('node-fetch');

async function check() {
  const uri = "ipfs://bafkreifcglpiqm3tmligvcueyhkgee6cb7z636ppy4zl2jkumirzehwtsq";
  const url = `http://localhost:4000/metadata/lookup?uri=${encodeURIComponent(uri)}`;
  
  try {
    const res = await fetch(url);
    const json = await res.json();
    console.log(JSON.stringify(json, null, 2));
  } catch (err) {
    console.error(err);
  }
}
check();
