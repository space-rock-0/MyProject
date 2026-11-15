// Shared generation logic — ported from the Personal Drafter's API handlers.
import { PROFILE, resumePdfs } from "./pd-config.mjs";
import * as resumes from "./pd-resumes.mjs";
import * as tpl from "./pd-templates.mjs";
import * as prompts from "./pd-prompts.mjs";
import { complete } from "./pd-llm.mjs";

const RECIPIENT_TO_TEMPLATE = { recruiter: "1", employee: "2", founder: "3", general: "4" };
export const LINKEDIN_LIMIT = { "1": 300 };
export const LINKEDIN_SOFT = 700;

const metaOf = (out, extra = {}) => ({
  model: out.model,
  prompt_tokens: out.prompt_tokens,
  completion_tokens: out.completion_tokens,
  ...extra,
});

export async function makeEmail(r) {
  r = validateInput(r);
  const available = Object.keys(resumePdfs());
  let key, scores;
  if (available.includes(r.resume)) {
    key = r.resume;
    scores = resumes.scoreRoles(r.job_title, r.jd);
  } else {
    [key, scores] = resumes.choose(r.job_title, r.jd, available);
  }
  const templates = tpl.emailTemplates();
  const t = templates[RECIPIENT_TO_TEMPLATE[r.recipient_type || "recruiter"]] || templates["1"];
  if (!t) throw new Error("Email template not found. Check Personal Drive/01_Templates/Email_Templates.txt.");
  const resumeText = resumes.contextFor(key, `${r.job_title} ${r.jd} ${r.company_info}`, "smart");
  const ctx = prompts.ctxBlock(r, [
    ["recipient_name", "Recipient name"], ["company", "Company"], ["job_title", "Job title"], ["job_link", "Job link"],
    ["jd", "Job description"], ["company_info", "Company notes"], ["person_info", "About the recipient"],
  ]);
  const out = await complete(prompts.SYSTEM, prompts.emailPrompt(resumeText, t.body, ctx), 500, 0.6);
  const m = out.text.match(/SUBJECT:\s*(.*?)\s*\n\s*BODY:\s*([\s\S]*)/i);
  let subject, body;
  if (m) {
    subject = m[1].trim();
    body = m[2].trim();
  } else {
    subject = "";
    body = out.text.trim();
  }
  if (!subject) subject = r.job_title ? `Application for ${r.job_title}` : `Interested in opportunities at ${r.company || "your team"}`;
  body = body.replace(/\n*\s*(best regards|regards|sincerely),?\s*\n[\s\S]*$/i, "").trim();
  return {
    subject,
    body: body + "\n\n" + prompts.signature(),
    resume_key: key,
    scores,
    template: t.label,
    meta: metaOf(out),
  };
}

export async function makeLinkedin(r) {
  r = validateInput(r);
  r.stage = r.stage || "1";
  const templates = tpl.linkedinTemplates();
  const t = templates[r.stage || "1"];
  if (!t) throw new Error("Unknown LinkedIn stage.");
  const limit = LINKEDIN_LIMIT[r.stage] ?? LINKEDIN_SOFT;
  const [key] = resumes.choose(r.job_title, `${r.jd || ""} ${r.domain || ""}`, Object.keys(resumePdfs()));
  const resumeText = resumes.contextFor(key, `${r.job_title} ${r.jd} ${r.domain} ${r.person_info}`, "smart", 7000);
  const ctx = prompts.ctxBlock(r, [
    ["person_name", "Their name"], ["person_role", "Their role/team"], ["domain", "My target domain"], ["company", "Company"],
    ["job_title", "Job title"], ["job_link", "Job link / req ID"], ["jd", "Job description"],
    ["person_info", "Their LinkedIn info (summary, posts)"], ["company_info", "Company notes"],
  ]);
  const out = await complete(prompts.SYSTEM, prompts.linkedinPrompt(resumeText, t, ctx, limit - 20), 350, 0.6);
  let msg = out.text.trim().replace(/^"+|"+$/g, "");
  let note = "";
  if (msg.length > limit) {
    const fix = await complete(
      "Shorten the message. Keep the meaning, first person, plain text. Output only the message.",
      `Max ${limit - 20} characters including spaces.\n\n${msg}`,
      250,
      0.3
    );
    msg = fix.text.trim().replace(/^"+|"+$/g, "");
    note = "Shortened to fit LinkedIn's limit.";
  }
  if (msg.length > limit) throw new Error("The message still exceeds LinkedIn's character limit. Please generate again.");
  return { message: msg, limit, note, meta: metaOf(out, { resume_key: key }) };
}

export async function makeForm(r) {
  r = validateInput(r);
  const qs = (r.questions || "")
    .split(/\n\s*-{3,}\s*(?:\n|$)/g)
    .map((q) => q.trim())
    .filter(Boolean)
    .slice(0, 10);
  if (!qs.length) throw new Error("Paste at least one question.");
  const limit = Math.max(15, Math.min(Number(r.limit_words) || 60, 250));
  const [key] = resumes.choose(r.job_title, r.jd, Object.keys(resumePdfs()));
  const resumeText = resumes.contextFor(key, "", "full");
  const ctx = prompts.ctxBlock(r, [
    ["company", "Company"], ["job_title", "Job title"], ["jd", "Job description"], ["company_info", "Company notes"],
  ]);
  const numbered = qs.map((q, i) => `${i + 1}. ${q}`).join("\n");
  const out = await complete(prompts.SYSTEM, prompts.formPrompt(resumeText, ctx, numbered, limit), 160 * qs.length + 100, 0.6);
  const parts = out.text.split(/^\s*###\s*(\d+)\s*$/m);
  const answers = {};
  for (let i = 1; i < parts.length - 1; i += 2) answers[Number(parts[i])] = parts[i + 1].trim();
  if (!Object.keys(answers).length) answers[1] = out.text.trim();
  return { answers: qs.map((q, i) => ({ q, a: answers[i + 1] || "" })), meta: metaOf(out) };
}

export async function makeCover(r) {
  r = validateInput(r);
  const template = tpl.coverTemplate();
  const [key] = resumes.choose(r.job_title, r.jd, Object.keys(resumePdfs()));
  const resumeText = resumes.contextFor(key, `${r.job_title} ${r.jd} ${r.company_info}`, "smart");
  const ctx = prompts.ctxBlock(r, [
    ["company", "Company"], ["job_title", "Job title"], ["jd", "Job description"], ["company_info", "Company notes"],
  ]);
  const out = await complete(prompts.SYSTEM, prompts.coverPrompt(resumeText, template.body, ctx), 600, 0.6);
  const today = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
  const letter = (
    `${template.header}\n\n${today}\n\n${r.company}\n${r.location || ""}\n\nDear Hiring Manager,\n\n${out.text.trim()}\n\nSincerely,\n${PROFILE.name}`
  );
  return { text: letter, meta: metaOf(out, { resume_key: key }) };
}

function validateInput(input) {
  const out = {};
  for (const [key, value] of Object.entries(input)) {
    if (key === "limit_words") {
      if (!Number.isFinite(Number(value))) throw new Error("Words per answer must be a number.");
      out[key] = Number(value);
    } else {
      if (typeof value !== "string") throw new Error(`Invalid ${key}: expected text.`);
      if (value.length > 50000) throw new Error(`${key} is too long (maximum 50,000 characters).`);
      out[key] = value.trim();
    }
  }
  for (const key of ["job_title", "jd", "company", "company_info", "person_info", "domain"]) out[key] ??= "";
  return out;
}
