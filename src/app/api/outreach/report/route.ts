import { readReport } from "@/lib/career-ops";
import { extractReportMeta } from "@/lib/outreach/context.mjs";
import { suggestResume } from "@/lib/outreach/drive.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Prefill one outreach draft from a tracked evaluation: company, role, URL, archived JD. */
export async function GET(req: Request) {
  const n = new URL(req.url).searchParams.get("n")?.trim() ?? "";
  if (!/^\d{1,4}$/.test(n)) return Response.json({ error: "n must be a report number" }, { status: 400 });
  const report = readReport(n);
  if (!report) return Response.json({ error: `report ${n} not found` }, { status: 404 });
  const meta = extractReportMeta(report.content);
  return Response.json({
    n,
    file: report.file,
    company: meta.company,
    role: meta.role,
    url: meta.url,
    score: meta.score,
    jd: meta.jd,
    suggest: suggestResume(meta.role, meta.jd),
  });
}
