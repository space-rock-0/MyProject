import fs from "node:fs";
import path from "node:path";
import { parseTrackerStatus, isISODate, TRACKER_STATUSES } from "@/lib/tracker-status.mjs";
import { readJsonObject } from "@/lib/json-body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { DATA_DIR } from "@/lib/data-dir.mjs";
const DATA_FILE = path.join(DATA_DIR, "job-tracker.json");

type JobTrackerRow = {
  id: number;
  company: string;
  jobLink?: string;
  role: string;
  date?: string;
  status: string;
  careerPage?: string;
  mail?: string;
  source?: string;
};

// A missing file is not a malformed file: ENOENT means "nothing tracked yet"
// and yields []. A file that exists but will not parse throws — the user's
// data is surfaced as an error instead of being silently replaced by a fresh
// single-row file on the next write.
function readRows(): JobTrackerRow[] {
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

function writeRows(rows: JobTrackerRow[]) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DATA_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(rows, null, 2), "utf8");
  fs.renameSync(tmp, DATA_FILE);
}

function corrupt(err: unknown) {
  console.error("[job-tracker] data file is unreadable:", err);
  return Response.json({ error: "job-tracker.json is corrupt or unreadable; refusing to overwrite it" }, { status: 500 });
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
  if (!b.company || !b.role) {
    return Response.json({ error: "company and role required" }, { status: 400 });
  }
  if (b.status !== undefined && !parseTrackerStatus(b.status)) {
    return Response.json({ error: `status must be one of: ${TRACKER_STATUSES.join(", ")}` }, { status: 400 });
  }
  if (b.date !== undefined && (typeof b.date !== "string" || !isISODate(b.date))) {
    return Response.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
  }
  let rows: JobTrackerRow[];
  try {
    rows = readRows();
  } catch (err) {
    return corrupt(err);
  }
  const nextId = rows.reduce((m, r) => Math.max(m, r.id), 0) + 1;
  const row: JobTrackerRow = {
    id: nextId,
    company: String(b.company),
    jobLink: b.jobLink ? String(b.jobLink) : undefined,
    role: String(b.role),
    date: b.date ? String(b.date) : new Date().toISOString().slice(0, 10),
    status: b.status ? parseTrackerStatus(b.status)! : "INBOX",
    careerPage: b.careerPage ? String(b.careerPage) : undefined,
    mail: b.mail ? String(b.mail) : undefined,
    source: b.source ? String(b.source) : undefined,
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
  if (b.status !== undefined && !parseTrackerStatus(b.status)) {
    return Response.json({ error: `status must be one of: ${TRACKER_STATUSES.join(", ")}` }, { status: 400 });
  }
  if (b.date !== undefined && b.date !== "" && (typeof b.date !== "string" || !isISODate(b.date))) {
    return Response.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
  }
  let rows: JobTrackerRow[];
  try {
    rows = readRows();
  } catch (err) {
    return corrupt(err);
  }
  const idx = rows.findIndex((r) => r.id === id);
  if (idx < 0) return Response.json({ error: "not found" }, { status: 404 });
  const updated: JobTrackerRow = { ...rows[idx], ...b, id } as JobTrackerRow;
  if (!updated.company || !updated.role) {
    return Response.json({ error: "company and role required" }, { status: 400 });
  }
  if (b.status !== undefined) updated.status = parseTrackerStatus(b.status)!;
  // Preserve the existing date unless the caller explicitly sends a new one —
  // an unrelated edit (e.g. a status flip) must not rewrite history.
  updated.date = b.date ? String(b.date) : rows[idx].date ?? new Date().toISOString().slice(0, 10);
  rows[idx] = updated;
  writeRows(rows);
  return Response.json(updated);
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const id = Number(url.searchParams.get("id"));
  if (!Number.isFinite(id)) return Response.json({ error: "id required" }, { status: 400 });
  let rows: JobTrackerRow[];
  try {
    rows = readRows();
  } catch (err) {
    return corrupt(err);
  }
  rows = rows.filter((r) => r.id !== id);
  writeRows(rows);
  return Response.json({ ok: true });
}
