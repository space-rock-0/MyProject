import { careerOpsRoot } from "@/lib/career-ops";
import { readJsonObject } from "@/lib/json-body";
import { resolveDriveDir, resumePdfPath } from "@/lib/outreach/drive.mjs";
import { attachmentFromFile, createGmailDraft, readGmailConfig } from "@/lib/outreach/gmail.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  to?: string;
  subject?: string;
  body?: string;
  attachResume?: string;
};

/**
 * Create a Gmail draft — never send. When credentials are absent this answers
 * 200 with `configured: false` and exactly what is missing, so the UI can offer
 * the .eml path instead of showing an error the user cannot act on.
 */
export async function POST(req: Request) {
  const body = await readJsonObject<Body>(req);
  if (!body) return Response.json({ error: "bad json" }, { status: 400 });

  const dataRoot = careerOpsRoot();
  const config = readGmailConfig({ dataRoot });
  if (!config.configured) {
    return Response.json({
      ok: false,
      configured: false,
      missing: config.missing,
      fileError: config.fileError,
      hint:
        "Add data/gmail.json with { clientId, clientSecret, refreshToken, from } (scope gmail.compose), " +
        "or set GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET / GMAIL_REFRESH_TOKEN / GMAIL_FROM. " +
        "Until then use Download .eml — it opens in Gmail with the PDF attached.",
    });
  }

  const to = String(body.to ?? "").trim();
  if (!to) return Response.json({ error: "Recipient email is required to create a draft." }, { status: 400 });
  const subject = String(body.subject ?? "").trim();
  const text = String(body.body ?? "").trim();
  if (!subject && !text) return Response.json({ error: "Generate the email first." }, { status: 400 });

  let attachment = null;
  if (body.attachResume) {
    const drive = resolveDriveDir({ dataRoot });
    const file = drive ? resumePdfPath(drive, body.attachResume) : null;
    attachment = attachmentFromFile(file);
  }

  try {
    const draft = await createGmailDraft(config, {
      to,
      subject: subject || "Application",
      body: text,
      attachment,
    });
    return Response.json({ ok: true, configured: true, draft, attached: Boolean(attachment) });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        configured: true,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 502 },
    );
  }
}
