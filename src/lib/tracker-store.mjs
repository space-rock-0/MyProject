import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";

const snapshots = new WeakMap();
const hash = value => createHash("sha256").update(value).digest("hex");
const clean = row => { const { _revision, ...data } = row; return data; };
const revision = row => hash(JSON.stringify(clean(row)));
function raw(file) { try { return fs.readFileSync(file, "utf8"); } catch(e) { if(e.code === "ENOENT") return "[]"; throw e; } }
export function readTracker(file) {
  if (process.env.DATABASE_URL) return import("./tracker-postgres.mjs").then(m => m.readDatabase(file));
  const text = raw(file);
  const rows = JSON.parse(text);
  if (!Array.isArray(rows) || rows.some(r => !r || !Number.isSafeInteger(r.id) || r.id <= 0)) throw new Error("Invalid tracker records; refusing to overwrite data.");
  if (new Set(rows.map(r => r.id)).size !== rows.length) throw new Error("Duplicate tracker IDs; refusing to overwrite data.");
  const result = rows.map(r => ({ ...r, _revision: revision(r) }));
  snapshots.set(result, hash(text));
  return result;
}
export function writeTracker(file, rows) {
  if (process.env.DATABASE_URL) return import("./tracker-postgres.mjs").then(m => m.writeDatabase(file, rows));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const lock = file + ".lock";
  let fd;
  try { fd = fs.openSync(lock, "wx"); } catch { throw new Error("Tracker is busy. Retry the save shortly."); }
  const temp = file + "." + randomUUID() + ".tmp";
  try {
    const previous = raw(file);
    if (snapshots.get(rows) !== hash(previous)) throw new Error("Tracker changed during this operation. Reload and retry.");
    const current = JSON.parse(previous);
    for (const row of rows) {
      const old = current.find(r => r.id === row.id);
      if (old && row._revision !== revision(old)) throw new Error("This record was changed elsewhere. Reload before saving.");
    }
    const out = JSON.stringify(rows.map(clean), null, 2);
    const outFd = fs.openSync(temp, "wx");
    try { fs.writeFileSync(outFd, out, "utf8"); fs.fsyncSync(outFd); } finally { fs.closeSync(outFd); }
    // Retain the preceding valid snapshot for recovery.
    fs.writeFileSync(file + ".bak", previous, "utf8");
    fs.renameSync(temp, file);
    for (const row of rows) row._revision = revision(row);
    snapshots.set(rows, hash(out));
  } finally {
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
    fs.closeSync(fd);
    fs.unlinkSync(lock);
  }
}
