import fs from "node:fs";
import path from "node:path";
import { readJsonObject } from "@/lib/json-body";
import { isISODate } from "@/lib/tracker-status.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { DATA_DIR } from "@/lib/data-dir.mjs";
const DATA_FILE = path.join(DATA_DIR, "outreach-tracker.json");

// A missing file is not a malformed file: ENOENT means "nothing tracked yet"
// and yields []. A file that exists but will not parse throws — the caller
// answers 500 instead of overwriting the user's tracker with a fresh file.
function readRows() {
  let raw: string;
  try {
    raw = fs.readFileSync(DATA_FILE, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
}

function writeRows(rows: any[]) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DATA_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(rows, null, 2), "utf8");
  fs.renameSync(tmp, DATA_FILE);
}

export async function POST(req: Request) {
  const body = await readJsonObject<{ rows?: unknown[] }>(req);
  if (!body || !Array.isArray(body.rows)) return Response.json({ error: "rows required" }, { status: 400 });
  let rows: any[];
  try {
    rows = readRows();
  } catch (err) {
    console.error("[outreach-adder/save] data file is unreadable:", err);
    return Response.json({ error: "outreach-tracker.json is corrupt or unreadable; refusing to overwrite it" }, { status: 500 });
  }
  let nextId = rows.reduce((m: number, r: any) => Math.max(m, r.id || 0), 0);
  const saved: any[] = [];
  let skipped = 0;
  for (const r of body.rows as any[]) {
    if (!r?.company) { skipped++; continue; }
    nextId += 1;
    const row = {
      id: nextId,
      company: String(r.company),
      roles: String(r.roles ?? ""),
      careersPage: r.careersPage ? String(r.careersPage) : undefined,
      salary: r.salary ? String(r.salary) : undefined,
      loginDate: r.loginDate ? String(r.loginDate) : undefined,
      contactPerson: r.contactPerson ? String(r.contactPerson) : undefined,
      email: r.email ? String(r.email) : undefined,
      outreachChannel: r.outreachChannel ? String(r.outreachChannel) : undefined,
      response: r.response ? String(r.response) : undefined,
      phone: r.phone ? String(r.phone) : undefined,
      followUpDate: r.followUpDate && isISODate(String(r.followUpDate)) ? String(r.followUpDate) : undefined,
    };
    rows.push(row);
    saved.push(row);
  }
  writeRows(rows);
  return Response.json({ saved, skipped });
}
