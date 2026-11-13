import fs from "node:fs";
import path from "node:path";
import { isISODate } from "@/lib/tracker-status.mjs";
import { readJsonObject } from "@/lib/json-body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { DATA_DIR } from "@/lib/data-dir.mjs";
const DATA_FILE = path.join(DATA_DIR, "outreach-tracker.json");

export type OutreachRow = {
  id: number;
  company: string;
  roles: string;
  careersPage?: string;
  salary?: string;
  loginDate?: string;
  contactPerson?: string;
  email?: string;
  outreachChannel?: string;
  response?: string;
  phone?: string;
  followUpDate?: string;
};

// A missing file is not a malformed file: ENOENT means "nothing tracked yet"
// and yields []. A file that exists but will not parse throws — the user's
// data is surfaced as an error instead of being silently replaced.
function readRows(): OutreachRow[] {
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

function writeRows(rows: OutreachRow[]) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DATA_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(rows, null, 2), "utf8");
  fs.renameSync(tmp, DATA_FILE);
}

function corrupt(err: unknown) {
  console.error("[outreach-tracker] data file is unreadable:", err);
  return Response.json({ error: "outreach-tracker.json is corrupt or unreadable; refusing to overwrite it" }, { status: 500 });
}

function checkFollowUp(v: unknown) {
  if (v === undefined || v === "") return null; // empty = clear the field
  if (typeof v !== "string" || !isISODate(v)) {
    return Response.json({ error: "followUpDate must be YYYY-MM-DD" }, { status: 400 });
  }
  return null;
}

export async function GET() {
  try {
    return Response.json(readRows());
  } catch (err) {
    return corrupt(err);
  }
}

export async function POST(req: Request) {
  const body = await readJsonObject<Record<string, unknown>>(req);
  if (!body) {
    return Response.json({ error: "bad json" }, { status: 400 });
  }
  const b = body as Record<string, unknown>;
  if (!b.company) {
    return Response.json({ error: "company required" }, { status: 400 });
  }
  const bad = checkFollowUp(b.followUpDate);
  if (bad) return bad;
  let rows: OutreachRow[];
  try {
    rows = readRows();
  } catch (err) {
    return corrupt(err);
  }
  const nextId = rows.reduce((m, r) => Math.max(m, r.id), 0) + 1;
  const row: OutreachRow = {
    id: nextId,
    company: String(b.company),
    roles: b.roles ? String(b.roles) : "",
    careersPage: b.careersPage ? String(b.careersPage) : undefined,
    salary: b.salary ? String(b.salary) : undefined,
    loginDate: b.loginDate ? String(b.loginDate) : undefined,
    contactPerson: b.contactPerson ? String(b.contactPerson) : undefined,
    email: b.email ? String(b.email) : undefined,
    outreachChannel: b.outreachChannel ? String(b.outreachChannel) : undefined,
    response: b.response ? String(b.response) : undefined,
    phone: b.phone ? String(b.phone) : undefined,
    followUpDate: b.followUpDate ? String(b.followUpDate) : undefined,
  };
  rows.push(row);
  writeRows(rows);
  return Response.json(row, { status: 201 });
}

export async function PUT(req: Request) {
  const body = await readJsonObject<Record<string, unknown>>(req);
  if (!body) {
    return Response.json({ error: "bad json" }, { status: 400 });
  }
  const b = body as Record<string, unknown>;
  const id = Number(b.id);
  if (!Number.isFinite(id)) return Response.json({ error: "id required" }, { status: 400 });
  const bad = checkFollowUp(b.followUpDate);
  if (bad) return bad;
  let rows: OutreachRow[];
  try {
    rows = readRows();
  } catch (err) {
    return corrupt(err);
  }
  const idx = rows.findIndex((r) => r.id === id);
  if (idx < 0) return Response.json({ error: "not found" }, { status: 404 });
  const updated = { ...rows[idx], ...b, id } as OutreachRow;
  if (!updated.company) {
    return Response.json({ error: "company required" }, { status: 400 });
  }
  if (b.followUpDate === "") updated.followUpDate = undefined;
  rows[idx] = updated;
  writeRows(rows);
  return Response.json(updated);
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const id = Number(url.searchParams.get("id"));
  if (!Number.isFinite(id)) return Response.json({ error: "id required" }, { status: 400 });
  let rows: OutreachRow[];
  try {
    rows = readRows();
  } catch (err) {
    return corrupt(err);
  }
  rows = rows.filter((r) => r.id !== id);
  writeRows(rows);
  return Response.json({ ok: true });
}
