import { PROFILE, resumePdfs, PD_KEY, MODELS } from "@/lib/pd-config.mjs";
import { emailTemplates, linkedinTemplates } from "@/lib/pd-templates.mjs";
import { status } from "@/lib/pd-gmail.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const gmail = await status();
  const email = emailTemplates() as Record<string, { label: string }>;
  const linkedin = linkedinTemplates() as Record<string, { label: string; stage?: string }>;
  const resumes = resumePdfs() as Record<string, string>;
  return Response.json({
    profile: { name: PROFILE.name, email: PROFILE.email },
    email_templates: Object.entries(email).map(([id, t]) => ({ id, label: t.label })),
    linkedin_templates: Object.entries(linkedin).map(([id, t]) => ({ id, label: t.label, stage: t.stage })),
    resumes: Object.entries(resumes).map(([key, p]) => ({ key, file: p.split(/[\\/]/).pop() })),
    available: Object.keys(resumes),
    linkedin_limits: { "1": 300 },
    models: MODELS,
    has_key: Boolean(PD_KEY),
    gmail,
  });
}
