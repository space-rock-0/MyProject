// Resume keyword scoring + the "smart"/"full" context builder, ported from the
// original personal drafter. Zero tokens when choosing the best-matching resume.
import fs from "node:fs";
import { COMBINED_RESUME } from "./pd-config.mjs";

export const ROLE_KEYWORDS = {
  fde: ["forward deployed", "forward deployment", "solutions engineer", "solution engineer", "customer", "client", "integration",
    "implementation", "deployment", "stakeholder", "requirements", "onboarding", "workflow automation", "technical scoping", "consulting"],
  ai: ["llm", "rag", "agent", "agentic", "genai", "generative", "langchain", "langgraph", "prompt", "vector", "embedding",
    "openai", "retrieval", "ai engineer", "mcp", "fine-tuning", "evaluation"],
  ml: ["machine learning", "ml engineer", "pytorch", "scikit-learn", "model training", "classification", "regression", "recommendation",
    "deep learning", "data scientist", "mlops", "feature engineering", "anomaly", "tensorflow", "nlp", "computer vision"],
  sde: ["software engineer", "sde", "backend", "frontend", "full stack", "full-stack", "react", "node", "java", "microservices",
    "system design", "rest api", "distributed", "web developer", "developer", "typescript"],
};
export const PREFERENCE = ["ai", "fde", "ml", "sde"];
const ALWAYS = /^(languages & cloud|machine learning:|programming languages|education|technical skills|vellore)/i;
const EXPERIENCE = /\b(intern|externship|inc\.|junior)\b/i;
const STOP = new Set("the and for with that this from your into over using used use built build have has are was were their our out per via not but all any can will more less than then also its been one two three each across within".split(" "));

const _count = (kw, text) => (text.match(new RegExp(`\\b${escapeReg(kw)}s?\\b`, "gi")) || []).length;
const escapeReg = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function scoreRoles(title = "", jd = "") {
  const t = title.toLowerCase(), j = jd.toLowerCase();
  const out = {};
  for (const [role, kws] of Object.entries(ROLE_KEYWORDS)) {
    out[role] = kws.reduce((sum, kw) => sum + 3 * _count(kw, t) + Math.min(_count(kw, j), 3), 0);
  }
  return out;
}

export function choose(title, jd, available) {
  const scores = scoreRoles(title, jd);
  const pool = PREFERENCE.filter((r) => available.includes(r));
  const candidates = pool.length ? pool : available;
  let best = candidates[0];
  for (const r of candidates) {
    const s = scores[r] || 0, b = scores[best] || 0;
    if (s > b || (s === b && PREFERENCE.indexOf(r) < PREFERENCE.indexOf(best))) best = r;
  }
  return [best, scores];
}

export function loadClean() {
  const raw = fs.readFileSync(COMBINED_RESUME, "utf8").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const seen = new Set();
  const out = [];
  for (const line of raw.split("\n")) {
    const s = line.replace(/[ \t]+/g, " ").trim();
    if (s.length > 40) {
      if (seen.has(s)) continue;
      seen.add(s);
    }
    out.push(s);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

const _dropOtherProfiles = (text, role) => {
  const m = text.match(/^(Profile summary:\s*\n)((?:.+\n?)+)/);
  if (!m) return text;
  const starters = {
    ai: "AI Engineer specializing",
    fde: "AI Engineer focused on Forward",
    ml: "Machine Learning Engineer",
    sde: "Software Engineer hands-on",
  };
  const block = m[2];
  const pos = Object.entries(starters)
    .map(([r, s]) => [block.indexOf(s), r])
    .filter(([i]) => i >= 0)
    .sort((a, b) => a[0] - b[0]);
  if (pos.length < 2) return text;
  const ranges = {};
  for (let i = 0; i < pos.length; i++) {
    const start = pos[i][0];
    const end = i + 1 < pos.length ? pos[i + 1][0] : block.length;
    ranges[pos[i][1]] = block.slice(start, end).trim();
  }
  if (!ranges[role]) return text;
  return m[1] + ranges[role] + "\n" + text.slice(m[0].length);
};

const paragraphs = (text) => text.split("\n\n").map((p) => p.trim()).filter(Boolean);
const _isHeader = (par) => {
  const lines = par.split("\n");
  const first = lines[0];
  if (first.length > 120 || first.endsWith(".") || first.startsWith("•") || ALWAYS.test(first)) return false;
  if (lines.length === 1) return true;
  const second = lines[1] || "";
  return second.includes("|") || (/\b(19|20)\d\d\b/.test(second) && second.length < 60) || first.includes("|");
};
const _groups = (text) => {
  const groups = [];
  let cur = null;
  for (const par of paragraphs(text)) {
    if (ALWAYS.test(par)) {
      groups.push({ text: par, always: true });
      cur = null;
    } else if (_isHeader(par) || cur === null) {
      cur = { text: par, always: false, header: par.split("\n")[0] };
      groups.push(cur);
    } else {
      cur.text += "\n\n" + par;
    }
  }
  return groups;
};
const _tokens = (s) =>
  new Set((s.toLowerCase().match(/[a-z][a-z0-9+.#-]{2,}/g) || []).filter((t) => !STOP.has(t)));

export function contextFor(role, query = "", mode = "full", budgetChars = 9000) {
  const text = _dropOtherProfiles(loadClean(), role);
  if (mode === "full" || text.length <= budgetChars) return text;
  const groups = _groups(text);
  const q = _tokens(query);
  const df = {};
  for (const g of groups) {
    for (const t of _tokens(g.text)) df[t] = (df[t] || 0) + 1;
  }
  const n = groups.length;
  for (const g of groups) {
    const toks = _tokens(g.text);
    let score = 0;
    if (q.size) for (const t of toks) if (q.has(t)) score += Math.log(1 + n / (df[t] || 1));
    g.score = score;
    g.keep = g.always || g === groups[0] || EXPERIENCE.test(g.header || "") || g.text.startsWith("Profile summary");
  }
  let used = groups.filter((g) => g.keep).reduce((sum, g) => sum + g.text.length, 0);
  for (const g of groups.filter((g) => !g.keep).sort((a, b) => b.score - a.score)) {
    if (used + g.text.length <= budgetChars) {
      g.keep = true;
      used += g.text.length;
    }
  }
  return groups.filter((g) => g.keep).map((g) => g.text).join("\n\n");
}
