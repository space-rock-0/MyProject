/**
 * drive.mjs — locate and read the user's "Personal Drive" template library.
 *
 * Plain .mjs so `node --test` can import it without a build step (web/AGENTS.md).
 * The folder is user-owned data: this module only ever READS it, and every path
 * that comes from a request is re-derived from the catalog rather than trusted.
 */

import fs from "node:fs";
import path from "node:path";

export const RESUME_KEYS = Object.freeze(["ai", "fde", "ml", "sde"]);

export const RESUME_LABELS = Object.freeze({
  ai: "AI Engineer",
  fde: "Forward Deployed Engineer",
  ml: "ML Engineer",
  sde: "Software Engineer",
});

/** Directories the drive is expected to have. Only Resumes/ is required. */
const TEMPLATE_DIRS = Object.freeze({ email: "Email", linkedin: "Linkedin" });

function isDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function isFile(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

/**
 * Absolute path of the Personal Drive folder, or null when it is not there.
 *
 * Order: CAREER_OPS_DRIVE_DIR → `<dataRoot>/Personal Drive` →
 * `<parent of dataRoot>/Personal Drive` → `<cwd>/Personal Drive`.
 * A candidate only counts when it actually holds `Resumes/`, so a stray
 * same-named folder cannot shadow the real library.
 *
 * @param {{env?: NodeJS.ProcessEnv, dataRoot?: string, cwd?: string}} [opts]
 * @returns {string | null}
 */
export function resolveDriveDir({ env = process.env, dataRoot, cwd = process.cwd() } = {}) {
  const candidates = [];
  const explicit = env.CAREER_OPS_DRIVE_DIR?.trim();
  if (explicit) candidates.push(path.resolve(cwd, explicit));
  if (dataRoot) {
    candidates.push(path.join(dataRoot, "Personal Drive"));
    candidates.push(path.join(path.dirname(path.resolve(dataRoot)), "Personal Drive"));
  }
  candidates.push(path.join(cwd, "Personal Drive"));
  const seen = new Set();
  for (const candidate of candidates) {
    const key = process.platform === "win32" ? candidate.toLowerCase() : candidate;
    if (seen.has(key)) continue;
    seen.add(key);
    if (isDir(candidate) && isDir(path.join(candidate, "Resumes"))) return candidate;
  }
  return null;
}

/** Markdown files directly inside `dir`, sorted, with their size in characters. */
function listMarkdown(dir) {
  if (!isDir(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".md"))
    .map((entry) => {
      const full = path.join(dir, entry.name);
      let chars = 0;
      try {
        chars = fs.readFileSync(full, "utf8").length;
      } catch {
        /* unreadable template: still list it so the UI can say so */
      }
      return { id: entry.name, name: entry.name.replace(/\.md$/i, ""), chars };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** True when a filename is one of the four resume variants (Ai/fde/ml/sde). */
export function resumeKeyFromFilename(filename) {
  const base = path.basename(filename).toLowerCase();
  if (base.includes("_ai") || base.includes("-ai") || /\bai\b/.test(base)) return "ai";
  if (base.includes("_fde") || base.includes("-fde")) return "fde";
  if (base.includes("_ml") || base.includes("-ml")) return "ml";
  if (base.includes("_sde") || base.includes("-sde")) return "sde";
  return null;
}

function resumeFiles(driveDir, folder, extension) {
  const dir = path.join(driveDir, folder);
  const out = new Map();
  if (!isDir(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(extension)) continue;
    const key = resumeKeyFromFilename(entry.name);
    if (key && !out.has(key)) out.set(key, path.join(dir, entry.name));
  }
  return out;
}

/**
 * Everything the UI needs to render its pickers.
 *
 * @param {string} driveDir
 * @returns {{
 *   drive: string,
 *   templates: { email: Array<{id: string, name: string, chars: number}>, linkedin: Array<{id: string, name: string, chars: number}> },
 *   resumes: Array<{key: string, label: string, md: boolean, pdf: string | null}>,
 *   missing: string[],
 * }}
 */
export function readCatalog(driveDir) {
  const templates = {
    email: listMarkdown(path.join(driveDir, TEMPLATE_DIRS.email)),
    linkedin: listMarkdown(path.join(driveDir, TEMPLATE_DIRS.linkedin)),
  };
  const markdown = resumeFiles(driveDir, "Resumes", ".md");
  const pdfs = resumeFiles(driveDir, "Resume_org", ".pdf");
  const resumes = RESUME_KEYS.map((key) => ({
    key,
    label: RESUME_LABELS[key],
    md: markdown.has(key),
    pdf: pdfs.has(key) ? path.basename(pdfs.get(key)) : null,
  }));
  const missing = [];
  for (const [channel, folder] of Object.entries(TEMPLATE_DIRS)) {
    if (!isDir(path.join(driveDir, folder))) missing.push(`${folder}/`);
    else if (templates[channel].length === 0) missing.push(`${folder}/*.md`);
  }
  if (!resumes.some((r) => r.md)) missing.push("Resumes/*.md");
  return { drive: driveDir, templates, resumes, missing };
}

/**
 * Resolve a path inside the drive from an untrusted relative id, refusing
 * traversal and absolute paths. Returns null rather than throwing so a stale
 * template id in the UI degrades to "auto", not a 500.
 *
 * @param {string} driveDir
 * @param {string | undefined} relative
 * @returns {string | null}
 */
export function safeDrivePath(driveDir, relative) {
  if (!relative || typeof relative !== "string") return null;
  if (path.isAbsolute(relative)) return null;
  const resolved = path.resolve(driveDir, relative);
  const root = path.resolve(driveDir);
  const rel = path.relative(root, resolved);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return isFile(resolved) ? resolved : null;
}

/**
 * Read one template by its catalog id (`Template 2 (For Students).md`) and
 * channel folder. Returns '' when the file is gone — the caller already has a
 * usable fallback and should not fail the whole request over a renamed file.
 */
export function readTemplate(driveDir, channel, id) {
  const folder = TEMPLATE_DIRS[channel];
  if (!folder || !id) return "";
  const full = safeDrivePath(driveDir, path.join(folder, path.basename(id)));
  if (!full || path.extname(full).toLowerCase() !== ".md") return "";
  try {
    return fs.readFileSync(full, "utf8");
  } catch {
    return "";
  }
}

/** Read one resume's markdown. `key` is validated against the four known keys. */
export function readResumeMarkdown(driveDir, key) {
  if (!RESUME_KEYS.includes(key)) return "";
  const full = resumeFiles(driveDir, "Resumes", ".md").get(key);
  if (!full) return "";
  try {
    return fs.readFileSync(full, "utf8");
  } catch {
    return "";
  }
}

/** Absolute path of one resume PDF, or null. `key` is validated. */
export function resumePdfPath(driveDir, key) {
  if (!RESUME_KEYS.includes(key)) return null;
  return resumeFiles(driveDir, "Resume_org", ".pdf").get(key) ?? null;
}

/**
 * Pick the resume variant that matches the role, so the default selection is
 * usually right and the user only has to correct it.
 *
 * @param {string} [role]
 * @param {string} [jd]
 * @returns {"ai" | "fde" | "ml" | "sde"}
 */
export function suggestResume(role = "", jd = "") {
  const text = `${role}\n${jd}`.toLowerCase();
  const score = { ai: 0, fde: 0, ml: 0, sde: 0 };
  const add = (key, weight, patterns) => {
    for (const p of patterns) if (p.test(text)) score[key] += weight;
  };
  add("ai", 3, [/generative ai/, /\bgen\s?ai\b/, /\brag\b/, /\bllm\b/, /agentic/, /prompt engineer/]);
  add("ai", 2, [/\bai\b/, /retrieval/, /langchain/, /langgraph/]);
  add("fde", 3, [/forward deployed/, /solutions engineer/, /customer engineer/, /pre-?sales/, /technical account/]);
  add("fde", 2, [/implementation/, /customer-facing/]);
  add("ml", 3, [/machine learning/, /\bml engineer/, /\bmlops\b/, /deep learning/, /model training/, /data scien/]);
  add("ml", 2, [/pytorch/, /tensorflow/, /\bnlp\b/, /computer vision/]);
  add("sde", 3, [/software engineer/, /\bsde\b/, /full[- ]stack/, /backend/, /frontend/, /\bplatform engineer/]);
  add("sde", 2, [/\bapi\b/, /microservice/, /distributed systems/]);
  const ranked = Object.entries(score).sort((a, b) => b[1] - a[1]);
  return ranked[0][1] > 0 ? ranked[0][0] : "ai";
}

/**
 * LinkedIn note limits. 200 is the free-account default; 300 requires Premium
 * or Sales Navigator. The caller chooses, and the note is trimmed to fit.
 */
export const LINKEDIN_LIMITS = Object.freeze([200, 300]);
