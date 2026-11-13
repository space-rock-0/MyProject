// Personal Drafter configuration — single .env, two Groq keys.
// GROQ_API_KEY       -> the career-ops app (assistant, Add Job, Outreach)
// PD_GROQ_API_KEY    -> only the Personal Drafter (email / LinkedIn / forms / cover)
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

// Data dir precedence: PD_DATA_DIR env → ROOT/data/personal-drafter → ROOT/personal-drafter.
function resolvePdDir() {
  if (process.env.PD_DATA_DIR) return path.resolve(process.env.PD_DATA_DIR);
  const withData = path.join(ROOT, "data", "personal-drafter");
  if (fs.existsSync(withData)) return withData;
  return path.join(ROOT, "personal-drafter");
}
export const PD_DIR = resolvePdDir();

export const PD_KEY = process.env.PD_GROQ_API_KEY || "";

// Tried in order; if one is rate-limited the next is used (free tier limits are per model).
export const MODELS = (process.env.PD_MODELS || "openai/gpt-oss-120b,openai/gpt-oss-20b,gemma2-9b-it")
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);

export const PROFILE = JSON.parse(fs.readFileSync(path.join(PD_DIR, "profile.json"), "utf8"));

export function resumePdfs() {
  const dir = path.join(PD_DIR, "Resume_org");
  const found = {};
  if (!fs.existsSync(dir)) return found;
  for (const file of fs.readdirSync(dir)) {
    const m = file.match(/_([A-Za-z]+)\.pdf$/i);
    if (m) found[m[1].toLowerCase()] = path.join(dir, file);
  }
  return found;
}

export const COMBINED_RESUME = path.join(PD_DIR, "Resumes", "Resume combiined.txt");
export const CRED = path.join(PD_DIR, "credentials.json");
export const TOKEN = path.join(PD_DIR, "token.json");
export const GMAIL_REDIRECT =
  process.env.PD_GOOGLE_REDIRECT_URI || "http://localhost:3000/auth/google/callback";
