import { readTracker, writeTracker } from "@/lib/tracker-store.mjs";
import fs from "node:fs";
import path from "node:path";
import { readJsonObject } from "@/lib/json-body";
import { resumePdfs, PROFILE } from "@/lib/pd-config.mjs";
import { createDraft } from "@/lib/pd-gmail.mjs";
import { DATA_DIR } from "@/lib/data-dir.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const JOB_FILE = path.join(DATA_DIR, "job-tracker.json");
type JobTrackerRecord = { id: number; company: string; role: string; jobLink?: string; date?: string; status: string; mail?: string; source?: string; careerPage?: string; _revision?: string };

function readJobs() { return readTracker(JOB_FILE); }

async function addToTracker({ company, role, jobLink, to }: { company?: string; role?: string; jobLink?: string; to?: string }) {
  const jobs = await readJobs() as JobTrackerRecord[];
  // Dedup: if a row with the same job link already exists, update it instead of adding a duplicate.
  if (jobLink) {
    const norm = (u?: string) => (u || "").trim().toLowerCase().replace(/\/$/, "");
    const key = norm(jobLink);
    const existing = jobs.find((j) => norm(j.jobLink) === key);
    if (existing) {
      existing.date = new Date().toISOString().slice(0, 10);
      existing.mail = to || existing.mail;
      if (company) existing.company = company;
      if (role) existing.role = role;
      await writeTracker(JOB_FILE, jobs);
      return existing.id;
    }
  }
  const nextId = jobs.reduce((m, r) => Math.max(m, r.id || 0), 0) + 1;
  const today = new Date().toISOString().slice(0, 10);
  jobs.push({
    id: nextId,
    company: String(company || "Unknown company").trim(),
    role: String(role || "Applied role").trim(),
    jobLink: jobLink || undefined,
    date: today,
    status: "INBOX",
    careerPage: undefined,
    mail: to || undefined,
    source: "Mail",
  });
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  await writeTracker(JOB_FILE, jobs);
  return nextId;
}

export async function POST(req: Request) {
  const body = await readJsonObject<{ to?: string; subject?: string; body?: string; resume_key?: string; company?: string; role?: string; jobLink?: string }>(req);
  if (!body) return Response.json({ error: "bad json" }, { status: 400 });
  if (Object.values(body).some(v => v !== undefined && typeof v !== "string")) return Response.json({ error: "All draft fields must be text." }, { status: 400 });
  if (!body.subject || !body.body) return Response.json({ error: "subject and body required" }, { status: 400 });
  const pdfs = resumePdfs() as Record<string, string>;
  const pdf = body.resume_key ? pdfs[String(body.resume_key).toLowerCase()] : undefined;
  if (body.resume_key && !pdf) return Response.json({ error: "Selected resume is not available. Choose another attachment." }, { status: 400 });
  if (/[\r\n]/.test(body.subject)) return Response.json({ error: "Subject must be a single line." }, { status: 400 });
  const to = (body.to || "").trim();
  if (to) {
    // Gmail rejects malformed To headers with a raw 400 — catch it here with a useful message.
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to);
    if (!emailOk) {
      return Response.json(
        { error: `"${to}" is not a valid email address — use the full address, e.g. name@company.com` },
        { status: 400 },
      );
    }
  }
  try {
    const draft = await createDraft(
      to,
      String(body.subject),
      String(body.body),
      pdf,
      PROFILE.attachment_name || "Resume.pdf",
    );
    // A drafted email = an application in flight: move it to the job tracker.
    try {
      const id = await addToTracker({ company: body.company, role: body.role, jobLink: body.jobLink, to: body.to });
      return Response.json({ ...draft, tracker_id: id });
    } catch {
      return Response.json({ ...draft, warning: "Draft saved in Gmail, but the job tracker could not be updated. Do not recreate the Gmail draft." });
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Gmail error";
    const status = /not connected|unauthorized|403/i.test(message) ? 401 : 502;
    return Response.json({ error: message }, { status });
  }
}
