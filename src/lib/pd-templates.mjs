// Reads the Email / LinkedIn / CV template .txt files. The {input}/{output}
// notes inside them are for the user, not the model, and are stripped.
import fs from "node:fs";
import path from "node:path";
import { PD_DIR } from "./pd-config.mjs";

const read = (p) => fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
const stripMeta = (t) =>
  t
    .replace(/\{\s*input[\s\S]*$/im, "") // trailing {Input: ...}{Output: ...} block
    .replace(/\{[^{}]*\}/g, "") // stray one-liners like {add suitable resume ...}
    .replace(/\*\*/g, "")
    .trim();

export function emailTemplates() {
  const t = stripMeta(read(path.join(PD_DIR, "Email", "Email Template.txt")));
  const parts = t.split(/^## Template (\d+)\s*[—–-]\s*(.+)$/m);
  const out = {};
  for (let i = 1; i < parts.length; i += 3) {
    const body = parts[i + 2].split(/Best regards,/i)[0].trim();
    out[parts[i]] = { id: parts[i], label: parts[i + 1].trim(), body };
  }
  return out;
}

export function linkedinTemplates() {
  const t = stripMeta(read(path.join(PD_DIR, "Linkedin", "Linkedin Template.txt")));
  const parts = t.split(/^## (\d+)\.\s*(.+)$/m);
  const out = {};
  for (let i = 1; i < parts.length; i += 3) {
    let chunk = parts[i + 2].trim();
    const personalization = chunk.split(/Personalization:/i);
    const guidance = personalization.length > 1 ? personalization[1].trim() : "";
    chunk = personalization[0].trim();
    const lines = chunk.split("\n").map((l) => l.trimEnd());
    const stage = lines[0] && lines[0].toLowerCase().startsWith("stage") ? lines[0].trim() : "";
    const body = (stage ? lines.slice(1) : lines).join("\n").trim();
    out[parts[i]] = { id: parts[i], label: parts[i + 1].trim(), stage, body, guidance };
  }
  return out;
}

export function coverTemplate() {
  const t = stripMeta(read(path.join(PD_DIR, "CV", "CV TEMPLATE.txt")));
  const headerAndDate = t.split(/\[DATE\]/i);
  const header = headerAndDate[0].trim();
  const rest = headerAndDate[1] || "";
  const afterGreeting = rest.split(/Dear Hiring Manager,/i)[1] || rest;
  const body = afterGreeting.split(/Sincerely,/i)[0].trim();
  return { header, body };
}
