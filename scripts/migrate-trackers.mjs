import fs from "node:fs";
import path from "node:path";
import pg from "pg";
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query("BEGIN");
  await client.query(`CREATE TABLE IF NOT EXISTS career_ops_trackers (
    name text PRIMARY KEY CHECK(name IN ('job-tracker.json','outreach-tracker.json')),
    records jsonb NOT NULL CHECK(jsonb_typeof(records)='array'),
    version bigint NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now())`);
  for (const name of ['job-tracker.json','outreach-tracker.json']) {
    const file = path.join(process.env.CAREER_OPS_DATA_DIR || 'data', name);
    const rows = JSON.parse(fs.readFileSync(file,'utf8'));
    if (!Array.isArray(rows) || rows.some(r => !Number.isSafeInteger(r.id) || r.id <= 0) || new Set(rows.map(r=>r.id)).size !== rows.length) throw new Error('Invalid source: '+name);
    for(const row of rows) delete row._revision;
    await client.query('INSERT INTO career_ops_trackers(name,records) VALUES($1,$2::jsonb) ON CONFLICT(name) DO NOTHING',[name,JSON.stringify(rows)]);
    const check = await client.query('SELECT records=$2::jsonb AS matches FROM career_ops_trackers WHERE name=$1',[name,JSON.stringify(rows)]);
    if(!check.rows[0].matches) throw new Error('Destination differs: '+name+'. Refusing to overwrite.');
    console.log(name+': '+rows.length+' records matched exactly');
  }
  await client.query('COMMIT');
} catch(e) { await client.query('ROLLBACK'); throw e; } finally { await client.end(); }
