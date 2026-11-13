/**
 * context.mjs — turn the user's canonical files into the context an outreach
 * prompt needs. Pure functions over text so both the route and the tests can
 * use them; the route is responsible for reading the files.
 */

import * as yaml from "js-yaml";

/**
 * Candidate facts for the prompt and for the email signature block.
 * Missing or malformed YAML degrades to an empty object — a broken profile is
 * reported by doctor.mjs, not invented here.
 *
 * @param {string} profileYaml
 * @returns {{name: string, email: string, phone: string, location: string, links: string[], headline: string}}
 */
export function candidateFacts(profileYaml) {
  let data = {};
  try {
    data = yaml.load(profileYaml) ?? {};
  } catch {
    data = {};
  }
  const candidate = data?.candidate ?? {};
  const links = [];
  for (const value of [candidate.linkedin, candidate.github, candidate.portfolio, candidate.website]) {
    const link = typeof value === "string" ? value.trim() : "";
    if (!link) continue;
    links.push(/^https?:\/\//i.test(link) ? link : `https://${link.replace(/^\/+/, "")}`);
  }
  return {
    name: String(candidate.full_name ?? "").trim(),
    email: String(candidate.email ?? "").trim(),
    phone: String(candidate.phone ?? "").trim(),
    location: String(candidate.location ?? "").trim(),
    headline: String(candidate.title ?? "").trim(),
    links,
  };
}

/**
 * Pull the archived JD and identifying fields out of an evaluation report.
 *
 * @param {string} markdown
 * @returns {{company: string, role: string, url: string, score: string, jd: string}}
 */
export function extractReportMeta(markdown) {
  const text = String(markdown ?? "");
  const heading = text.match(/^#\s+Evaluation:\s*(.+?)\s+[—–-]\s+(.+?)\s*$/m);
  const url = text.match(/^\*\*URL:\*\*\s*(\S+)\s*$/m);
  const score = text.match(/^\*\*Score:\*\*\s*(\S+)\s*$/m);

  const start = text.search(/^##\s+Job Description[^\n]*$/m);
  let jd = "";
  if (start >= 0) {
    const afterHeading = text.indexOf("\n", start);
    const remainder = text.slice(afterHeading + 1);
    const next = remainder.search(/^##\s+/m);
    jd = (next >= 0 ? remainder.slice(0, next) : remainder).trim();
  }

  return {
    company: heading?.[1]?.trim() ?? "",
    role: heading?.[2]?.trim() ?? "",
    url: url?.[1]?.trim() ?? "",
    score: score?.[1]?.trim() ?? "",
    jd,
  };
}

/**
 * Break a textarea of questions into a clean list. Accepts numbered lists
 * ("1. …"), bullets, or one question per line.
 *
 * @param {string[] | string | undefined} questions
 * @returns {string[]}
 */
export function normalizeQuestions(questions) {
  const raw = Array.isArray(questions) ? questions.join("\n") : String(questions ?? "");
  return raw
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:\d+[.)]|[-*•])\s+/, "").trim())
    .filter(Boolean);
}

/** Plain-text signature block from candidate facts, links included once. */
export function signatureBlock(candidate) {
  const links = (candidate.links ?? []).filter(Boolean);
  const contact = [candidate.phone, candidate.email, ...links].filter(Boolean).join(" | ");
  return [candidate.name, contact].filter(Boolean).join("\n");
}
