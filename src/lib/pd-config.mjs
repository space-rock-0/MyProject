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

// Keep the standalone drafter and the web app on the same source files.
const standalone = path.resolve(ROOT, "../personal_drafter");
export const PD_DATA = process.env.PD_DATA_DIR ? PD_DIR
  : fs.existsSync(path.join(standalone, "Personal Drive")) ? path.join(standalone, "Personal Drive") : PD_DIR;
export function pdFile(current, legacy) {
  const candidate = path.join(PD_DATA, current);
  return fs.existsSync(candidate) ? candidate : path.join(PD_DIR, legacy);
}

export const PD_KEY = process.env.PD_GROQ_API_KEY || "";

// Tried in order; if one is rate-limited the next is used (free tier limits are per model).
export const MODELS = (process.env.PD_MODELS || "openai/gpt-oss-120b,openai/gpt-oss-20b")
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);

const profilePath = !process.env.PD_DATA_DIR && fs.existsSync(path.join(standalone, "profile.json"))
  ? path.join(standalone, "profile.json") : path.join(PD_DIR, "profile.json");
export const PROFILE = JSON.parse(fs.readFileSync(profilePath, "utf8").replace(/^\uFEFF/, ""));

export function resumePdfs() {
  const dir = pdFile("03_Resume_PDFs", "Resume_org");
  const found = {};
  if (!fs.existsSync(dir)) return found;
  for (const file of fs.readdirSync(dir)) {
    const m = file.match(/_([A-Za-z]+)\.pdf$/i);
    if (m) found[m[1].toLowerCase()] = path.join(dir, file);
  }
  return found;
}

export const COMBINED_RESUME = pdFile("02_Resume_Data/Master_Resume_Data.txt", "Resumes/Resume combiined.txt");
// Local checkout: credentials.json sits inside the data dir (gitignored there).
// Render secret file: /etc/secrets/credentials.json. Prefer whichever exists.
export const CRED = fs.existsSync(path.join(PD_DIR, "credentials.json"))
  ? path.join(PD_DIR, "credentials.json")
  : "/etc/secrets/credentials.json";
export const TOKEN = path.join(PD_DIR, "token.json");
export const GMAIL_REDIRECT =
  process.env.PD_GOOGLE_REDIRECT_URI || "http://localhost:3000/auth/google/callback";
