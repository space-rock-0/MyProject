import fs from "node:fs";
import path from "node:path";
import { careerOpsRoot } from "@/lib/career-ops";
import { readJsonObject } from "@/lib/json-body";
import { resolveDriveDir, resumePdfPath } from "@/lib/outreach/drive.mjs";
import { attachmentFromFile, buildMimeMessage, emlFilename } from "@/lib/outreach/gmail.mjs";
import { candidateFacts } from "@/lib/outreach/context.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  to?: string;
  subject?: string;
  body?: string;
  attachResume?: string;
  company?: string;
  role?: string;
};

function readProfileEmail(dataRoot: string): string {
  try {
    const yaml = fs.readFileSync(path.join(dataRoot, "config", "profile.yml"), "utf8");
    return candidateFacts(yaml).email;
  } catch {
    return "";
  }
}

/**
 * The no-credentials path: hand back the exact RFC822 message as an .eml file,
 * with the chosen résumé PDF attached. Opening it in a mail client produces the
 * draft the Gmail route would have created — a human still presses send.
 */
export async function POST(req: Request) {
  const body = await readJsonObject<Body>(req);
  if (!body) return Response.json({ error: "bad json" }, { status: 400 });
  if (!String(body.subject ?? "").trim() && !String(body.body ?? "").trim()) {
    return Response.json({ error: "Nothing to export — generate the email first." }, { status: 400 });
  }

  const dataRoot = careerOpsRoot();
  let attachment = null;
  if (body.attachResume) {
    const drive = resolveDriveDir({ dataRoot });
    const file = drive ? resumePdfPath(drive, body.attachResume) : null;
    attachment = attachmentFromFile(file);
  }

  const mime = buildMimeMessage({
    from: readProfileEmail(dataRoot) || "me@example.com",
    to: String(body.to ?? "").trim(),
    subject: String(body.subject ?? "").trim() || "Application",
    body: String(body.body ?? ""),
    attachment,
  });

  return new Response(mime, {
    headers: {
      "Content-Type": "message/rfc822",
      "Content-Disposition": `attachment; filename="${emlFilename(body.company, body.role)}"`,
      "Cache-Control": "no-store",
    },
  });
}
