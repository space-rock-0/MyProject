import { readJsonObject } from "@/lib/json-body";
import { coerceTrackerStatus, isISODate } from "@/lib/tracker-status.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ParsedRow = {
  company: string;
  role: string;
  jobLink?: string;
  careerPage?: string;
  mail?: string;
  source?: string;
  date?: string;
  status?: string;
};

const SYSTEM = `You parse free-text job postings into structured rows.
Return ONLY valid JSON: an object with a "rows" array. Each row has:
company (string, required), role (string, required), jobLink (string url or null),
careerPage (string url or null), mail (string email or null), source (string or null),
date (YYYY-MM-DD or null), status (one of INBOX, EVALUATED, APPLIED, RESPONDED, ASSESSMENT, INTERVIEW, OFFER, HIRED, REJECTED, DISCARDED, SKIP; default "INBOX").
If a field is missing use null. Multiple jobs => multiple objects in "rows". No prose.`;

export async function POST(req: Request) {
  const body = await readJsonObject<{ text?: unknown }>(req);
  if (!body) return Response.json({ error: "bad json" }, { status: 400 });
  const text = typeof body.text === "string" ? body.text : "";
  if (!text.trim()) return Response.json({ error: "text required" }, { status: 400 });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return Response.json({ error: "GROQ_API_KEY not configured" }, { status: 500 });

  const model = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: text },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return Response.json({ error: "groq failed", detail: err }, { status: 502 });
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content ?? "[]";
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return Response.json({ error: "invalid llm json", raw: content }, { status: 502 });
  }
  const p = parsed as any;
  let arr: any[] = [];
  if (Array.isArray(parsed)) arr = parsed;
  else if (Array.isArray(p?.rows)) arr = p.rows;
  else if (Array.isArray(p?.jobs)) arr = p.jobs;
  else if (p && typeof p === "object" && p.company && p.role) arr = [p]; // single posting returned as a bare object
  const today = new Date().toISOString().slice(0, 10);
  const rows: ParsedRow[] = (arr as any[]).map((r) => ({
    company: String(r?.company ?? "").trim(),
    role: String(r?.role ?? "").trim(),
    jobLink: r?.jobLink ? String(r.jobLink) : undefined,
    careerPage: r?.careerPage ? String(r.careerPage) : undefined,
    mail: r?.mail ? String(r.mail) : undefined,
    source: r?.source ? String(r.source) : "pasted",
    date: r?.date && isISODate(String(r.date)) ? String(r.date) : today,
    status: coerceTrackerStatus(r?.status, "INBOX"),
  })).filter((r) => r.company && r.role);

  return Response.json({ rows });
}