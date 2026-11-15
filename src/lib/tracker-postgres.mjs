import pg from "pg";
import { attachDatabasePool } from "@vercel/functions";
import { createHash } from "node:crypto";
let pool;
export function database() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  if (!pool) { pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5, connectionTimeoutMillis: 15000 }); attachDatabasePool(pool); }
  return pool;
}
const snapshots = new WeakMap();
const clean = ({ _revision, ...data }) => data;
const hash = row => createHash("sha256").update(JSON.stringify(row)).digest("hex");
export function collection(file) {
  const name = file.replaceAll("\\", "/").split("/").pop();
  if (!["job-tracker.json", "outreach-tracker.json"].includes(name)) throw new Error("Unknown tracker");
  return name;
}
export async function readDatabase(file) {
  const name = collection(file);
  const result = await database().query("SELECT version, records FROM career_ops_trackers WHERE name=$1", [name]);
  if (!result.rows.length) throw new Error("Database migration is required; tracker is not initialized.");
  const { version, records } = result.rows[0];
  const rows = records.map(r => ({ ...r, _revision: hash(r) }));
  snapshots.set(rows, { version, records });
  return rows;
}
export async function writeDatabase(file, rows) {
  const snapshot = snapshots.get(rows);
  if (!snapshot) throw new Error("Reload tracker before saving.");
  for (const row of rows) {
    const old = snapshot.records.find(r => r.id === row.id);
    if (old && row._revision !== hash(old)) throw new Error("Record changed elsewhere. Reload before saving.");
  }
  const records = rows.map(clean);
  const result = await database().query("UPDATE career_ops_trackers SET records=$1::jsonb, version=version+1, updated_at=now() WHERE name=$2 AND version=$3 RETURNING version", [JSON.stringify(records), collection(file), snapshot.version]);
  if (!result.rowCount) throw new Error("Tracker changed elsewhere. Reload and retry.");
  // JSONB canonicalizes object key order; fresh reads supply authoritative revisions.
}
