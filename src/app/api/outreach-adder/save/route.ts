import { readTracker, writeTracker } from "@/lib/tracker-store.mjs";
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
function readRows() { return readTracker(DATA_FILE); }

function writeRows(rows: any[]) { return writeTracker(DATA_FILE, rows); }

export async function POST(req: Request) {
  const body = await readJsonObject<{ rows?: unknown[] }>(req);
  if (!body || !Array.isArray(body.rows)) return Response.json({ error: "rows required" }, { status: 400 });
  let rows: any[];
  try {
    rows = await readRows();
  } catch (err) {
    console.error("[outreach-adder/save] data file is unreadable:", err);
    return Response.json({ error: "outreach-tracker.json is corrupt or unreadable; refusing to overwrite it" }, { status: 500 });
  }
  let nextId = rows.reduce((m: number, r: any) => Math.max(m, r.id || 0), 0);
  const saved: any[] = [];
  let skipped = 0;
  const keyOf = (r: any) => [r.company, r.roles, r.email, r.contactPerson, r.outreachChannel].map(v => String(v || "").trim().toLowerCase()).join("|");
  const seen = new Set(rows.map(keyOf));
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
    const key = keyOf(row);
    if (seen.has(key)) { skipped++; continue; }
    seen.add(key);
    rows.push(row);
    saved.push(row);
  }
  await writeRows(rows);
  return Response.json({ saved, skipped });
}
