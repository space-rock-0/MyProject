import { readJsonObject } from "@/lib/json-body";
import { isISODate } from "@/lib/tracker-status.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYSTEM = `You parse free-text recruiter/outreach information into structured rows.
Return ONLY valid JSON: an object with a "rows" array. Each row has:
company (string, required), roles (string, required; comma or newline separated multiple titles), careersPage (url or null), salary (string or null), loginDate (dd/mm/yy or null), contactPerson (string or null), email (string or null), outreachChannel (string or null), response (string or null), phone (string or null), followUpDate (YYYY-MM-DD or null).
If a field is missing use null. Multiple contacts => multiple objects in "rows". No prose.`;

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
  else if (Array.isArray(p?.contacts)) arr = p.contacts;
  else if (p && typeof p === "object" && p.company) arr = [p]; // single contact returned as a bare object
  const rows = (arr as any[])
    .map((r) => ({
      company: String(r?.company ?? "").trim(),
      roles: String(r?.roles ?? "").trim(),
      careersPage: r?.careersPage ? String(r.careersPage) : undefined,
      salary: r?.salary ? String(r.salary) : undefined,
      loginDate: r?.loginDate ? String(r.loginDate) : undefined,
      contactPerson: r?.contactPerson ? String(r.contactPerson) : undefined,
      email: r?.email ? String(r.email) : undefined,
      outreachChannel: r?.outreachChannel ? String(r.outreachChannel) : undefined,
      response: r?.response ? String(r.response) : undefined,
      phone: r?.phone ? String(r.phone) : undefined,
      followUpDate: r?.followUpDate && isISODate(String(r.followUpDate)) ? String(r.followUpDate) : undefined,
    }))
    .filter((r) => r.company);

  return Response.json({ rows });
}
