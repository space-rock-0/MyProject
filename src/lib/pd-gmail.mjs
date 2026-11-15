// Gmail connector for the Personal Drafter — uses credentials.json + token.json
// stored in data/personal-drafter. Gmail scope is compose-only: it can create
// drafts, never read your inbox.
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { database } from "./tracker-postgres.mjs";
import { PD_DIR, CRED, TOKEN, GMAIL_REDIRECT } from "./pd-config.mjs";

const SCOPE = "https://www.googleapis.com/auth/gmail.compose";

function b64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function staticCreds() {
  if (process.env.PD_GOOGLE_CREDENTIALS) {
    try {
      const parsed = JSON.parse(process.env.PD_GOOGLE_CREDENTIALS);
      return parsed.installed || parsed.web || parsed;
    } catch {
      return null;
    }
  }
  if (!fs.existsSync(CRED)) return null;
  try {
    return JSON.parse(fs.readFileSync(CRED, "utf8")).installed || JSON.parse(fs.readFileSync(CRED, "utf8")).web;
  } catch {
    return null;
  }
}

function staticTokenFile() {
  if (!fs.existsSync(TOKEN)) return null;
  try {
    return JSON.parse(fs.readFileSync(TOKEN, "utf8"));
  } catch {
    return null;
  }
}

async function staticToken() {
  if (process.env.DATABASE_URL) {
    const result = await database().query(
      "SELECT oauth_token FROM career_ops_pd_gmail_tokens WHERE singleton = TRUE",
    );
    if (result.rows[0]?.oauth_token) return result.rows[0].oauth_token;
  }
  return staticTokenFile();
}

async function saveToken(t) {
  if (process.env.DATABASE_URL) {
    await database().query(
      `INSERT INTO career_ops_pd_gmail_tokens (singleton, oauth_token, updated_at)
       VALUES (TRUE, $1::jsonb, now())
       ON CONFLICT (singleton) DO UPDATE
       SET oauth_token = EXCLUDED.oauth_token, updated_at = now()`,
      [JSON.stringify(t)],
    );
    return;
  }
  const tmp = `${TOKEN}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(t, null, 2), { encoding: "utf8", mode: 0o600 });
    fs.renameSync(tmp, TOKEN);
  } finally { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); }
}

async function freshAccessToken() {
  const tok = await staticToken();
  if (!tok) return null;
  const now = Math.floor(Date.now() / 1000);
  if (tok.access_token && tok.expiry_date && tok.expiry_date - 60000 > now * 1000) return tok.access_token;
  if (!tok.refresh_token) return tok.access_token || null;
  const creds = staticCreds();
  if (!creds) return null;
  const body = new URLSearchParams({
    client_id: creds.client_id,
    client_secret: creds.client_secret,
    refresh_token: tok.refresh_token,
    grant_type: "refresh_token",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    signal: AbortSignal.timeout(10000),
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) return null;
  const next = await res.json();
  const merged = { ...tok, ...next, expiry_date: Math.floor(Date.now() / 1000) * 1000 + (next.expires_in || 3600) * 1000 };
  await saveToken(merged);
  return merged.access_token;
}

export async function status() {
  const configured = !!staticCreds();
  const out = { configured, connected: false, email: "" };
  if (!configured) return out;
  try {
    const tok = await freshAccessToken();
    if (!tok) return out;
    const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
      signal: AbortSignal.timeout(5000),
      headers: { authorization: `Bearer ${tok}` },
    });
    if (res.ok) {
      out.email = (await res.json()).emailAddress || "";
      out.connected = true;
    }
  } catch {
    /* treat as not connected */
  }
  return out;
}

export function loginUrl(redirectUri = GMAIL_REDIRECT, state) {
  const creds = staticCreds();
  if (!creds) throw new Error("credentials.json not found or unreadable");
  const params = new URLSearchParams({
    client_id: creds.client_id,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
    ...(state ? { state } : {}),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function finishLogin(code, redirectUri = GMAIL_REDIRECT) {
  const creds = staticCreds();
  if (!creds) throw new Error("credentials.json not found");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    signal: AbortSignal.timeout(10000),
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: creds.client_id,
      client_secret: creds.client_secret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google rejected the sign-in: ${err}`);
  }
  const tok = await res.json();
  await saveToken({
    access_token: tok.access_token,
    refresh_token: tok.refresh_token,
    scope: tok.scope,
    token_type: tok.token_type,
    expiry_date: Date.now() + (tok.expires_in || 3600) * 1000,
    client_id: creds.client_id,
  });
}

export async function disconnect() {
  if (process.env.DATABASE_URL) {
    await database().query("DELETE FROM career_ops_pd_gmail_tokens WHERE singleton = TRUE");
  }
  if (fs.existsSync(TOKEN)) fs.unlinkSync(TOKEN);
}

function mimeMessage(to, subject, body, pdfPath, pdfName) {
  if (/[\r\n]/.test(to) || /[\r\n]/.test(subject)) throw new Error("Recipient and subject must each be a single line.");
  if (pdfPath && !fs.existsSync(pdfPath)) throw new Error("Selected resume PDF is missing.");
  pdfName = pdfName.replace(/[\r\n"\\]/g, "_");
  const lines = [];
  if (to) lines.push(`To: ${to}`);
  lines.push(`Subject: =?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`);
  lines.push("MIME-Version: 1.0");
  if (pdfPath && fs.existsSync(pdfPath)) {
    const boundary = `pd_${Math.random().toString(36).slice(2)}`;
    lines.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
    lines.push("", `--${boundary}`, 'Content-Type: text/plain; charset="UTF-8"', "", body);
    lines.push(`--${boundary}`);
    lines.push(`Content-Type: application/pdf; name="${pdfName}"`);
    lines.push("Content-Transfer-Encoding: base64");
    lines.push(`Content-Disposition: attachment; filename="${pdfName}"`, "");
    lines.push(fs.readFileSync(pdfPath).toString("base64").match(/.{1,76}/g)?.join("\r\n") || "");
    lines.push(`--${boundary}--`);
  } else {
    lines.push('Content-Type: text/plain; charset="UTF-8"');
    lines.push("", body);
  }
  return b64url(lines.join("\r\n"));
}

export async function createDraft(to, subject, body, pdfPath, pdfName = "Resume.pdf") {
  const tok = await freshAccessToken();
  if (!tok) throw new Error("Gmail is not connected. Click Connect Gmail.");
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/drafts", {
    signal: AbortSignal.timeout(20000),
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${tok}` },
    body: JSON.stringify({ message: { raw: mimeMessage(to, subject, body, pdfPath, pdfName) } }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gmail rejected the draft: ${err}`);
  }
  const d = await res.json();
  const mid = d?.message?.id || "";
  return {
    draft_id: d.id || "",
    url: mid ? `https://mail.google.com/mail/u/0/#drafts?compose=${mid}` : "https://mail.google.com/mail/u/0/#drafts",
  };
}
