import fs from "node:fs";
import path from "node:path";
import { careerOpsRoot, readApplications } from "@/lib/career-ops";
import { readCatalog, resolveDriveDir } from "@/lib/outreach/drive.mjs";
import { readGmailConfig } from "@/lib/outreach/gmail.mjs";
import { candidateFacts } from "@/lib/outreach/context.mjs";
import { RECIPIENT_TYPES } from "@/lib/outreach/prompt.mjs";
import type { OutreachCatalog, RecipientTypeOption, ResumeOption } from "@/lib/outreach/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Everything the outreach UI needs to render: the template library, the resume
 * set, the tracked applications (for prefill), and whether Gmail can draft.
 * Read-only.
 */
export async function GET() {
  const dataRoot = careerOpsRoot();
  const drive = resolveDriveDir({ dataRoot });
  const gmail = readGmailConfig({ dataRoot });

  let applications: OutreachCatalog["applications"] = [];
  try {
    applications = readApplications()
      .filter((app) => app.company && app.role)
      .map((app) => ({
        n: app.n,
        company: app.company,
        role: app.role,
        url: app.url || app.applyLink || "",
        report: app.report,
      }))
      .reverse();
  } catch {
    applications = [];
  }

  const library = drive ? readCatalog(drive) : null;
  let profile = "";
  try {
    profile = fs.readFileSync(path.join(dataRoot, "config", "profile.yml"), "utf8");
  } catch {
    profile = "";
  }
  const candidate = candidateFacts(profile);
  const payload: OutreachCatalog = {
    drive,
    templates: library?.templates ?? { email: [], linkedin: [] },
    resumes: (library?.resumes ?? []) as ResumeOption[],
    missing: library?.missing ?? ["Personal Drive"],
    recipientTypes: RECIPIENT_TYPES.map((r) => ({ id: r.id, label: r.label })) as RecipientTypeOption[],
    candidate: { name: candidate.name, email: candidate.email, links: candidate.links },
    gmail: {
      configured: gmail.configured,
      source: gmail.source,
      missing: gmail.missing,
      fileError: gmail.fileError,
    },
    applications,
  };

  return Response.json(payload);
}
