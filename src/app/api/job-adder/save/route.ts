import fs from "node:fs";
import path from "node:path";
import { readJsonObject } from "@/lib/json-body";
import { coerceTrackerStatus, isISODate } from "@/lib/tracker-status.mjs";

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
// and yields []. A file that exists but will not parse throws — the caller
// answers 500 instead of overwriting the user's tracker with a fresh file.
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

function atomicWrite(rows: JobTrackerRow[]) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DATA_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(rows, null, 2), "utf8");
  fs.renameSync(tmp, DATA_FILE);
}

function dedupeKey(r: { company: string; role: string; jobLink?: string }) {
  return `${r.jobLink || ""}|${r.company.toLowerCase()}|${r.role.toLowerCase()}`;
}

export async function POST(req: Request) {
  const body = await readJsonObject<{ rows?: unknown }>(req);
  if (!body || !Array.isArray(body.rows)) {
    return Response.json({ error: "rows required" }, { status: 400 });
  }
  const incoming = body.rows as any[];
  const valid = incoming
    .map((r) => ({
      company: String(r?.company ?? "").trim(),
      role: String(r?.role ?? "").trim(),
      jobLink: r?.jobLink ? String(r.jobLink) : undefined,
      careerPage: r?.careerPage ? String(r.careerPage) : undefined,
      mail: r?.mail ? String(r.mail) : undefined,
      source: r?.source ? String(r.source) : "pasted",
      date: r?.date && isISODate(String(r.date)) ? String(r.date) : new Date().toISOString().slice(0, 10),
      status: coerceTrackerStatus(r?.status, "INBOX"),
    }))
    .filter((r) => r.company && r.role);

  let rows: JobTrackerRow[];
  try {
    rows = readRows();
  } catch (err) {
    console.error("[job-adder/save] data file is unreadable:", err);
    return Response.json({ error: "job-tracker.json is corrupt or unreadable; refusing to overwrite it" }, { status: 500 });
  }
  const existingKeys = new Set(rows.map(dedupeKey));
  const saved: JobTrackerRow[] = [];
  let nextId = rows.reduce((m, r) => Math.max(m, r.id), 0) + 1;
  for (const r of valid) {
    const key = dedupeKey(r);
    if (existingKeys.has(key)) continue;
    const row: JobTrackerRow = { id: nextId++, ...r };
    rows.push(row);
    existingKeys.add(key);
    saved.push(row);
  }
  atomicWrite(rows);
  return Response.json({ saved, skipped: valid.length - saved.length });
}