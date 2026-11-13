import fs from "node:fs";
import path from "node:path";
import { readJsonObject } from "@/lib/json-body";
import { resumePdfs, PROFILE } from "@/lib/pd-config.mjs";
import { createDraft } from "@/lib/pd-gmail.mjs";
import { DATA_DIR } from "@/lib/data-dir.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const JOB_FILE = path.join(DATA_DIR, "job-tracker.json");

function readJobs() {
  try {
    if (!fs.existsSync(JOB_FILE)) return [];
    const parsed = JSON.parse(fs.readFileSync(JOB_FILE, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function addToTracker({ company, role, jobLink, to }: { company?: string; role?: string; jobLink?: string; to?: string }) {
  const jobs = readJobs();
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
      const tmp = JOB_FILE + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(jobs, null, 2), "utf8");
      fs.renameSync(tmp, JOB_FILE);
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
    status: "APPLIED",
    careerPage: undefined,
    mail: to || undefined,
    source: "Mail",
  });
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = JOB_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(jobs, null, 2), "utf8");
  fs.renameSync(tmp, JOB_FILE);
  return nextId;
}

export async function POST(req: Request) {
  const body = await readJsonObject<{ to?: string; subject?: string; body?: string; resume_key?: string; company?: string; role?: string; jobLink?: string }>(req);
  if (!body) return Response.json({ error: "bad json" }, { status: 400 });
  if (!body.subject || !body.body) return Response.json({ error: "subject and body required" }, { status: 400 });
  const pdfs = resumePdfs() as Record<string, string>;
  const pdf = body.resume_key ? pdfs[String(body.resume_key).toLowerCase()] : undefined;
  try {
    const draft = await createDraft(
      (body.to || "").trim(),
      String(body.subject),
      String(body.body),
      pdf,
      PROFILE.attachment_name || "Resume.pdf",
    );
    // A drafted email = an application in flight: move it to the job tracker.
    const id = addToTracker({ company: body.company, role: body.role, jobLink: body.jobLink, to: body.to });
    return Response.json({ ...draft, tracker_id: id });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Gmail error";
    const status = /not connected|unauthorized|403/i.test(message) ? 401 : 502;
    return Response.json({ error: message }, { status });
  }
}
