// Gmail connector for the Personal Drafter — uses credentials.json + token.json
// stored in data/personal-drafter. Gmail scope is compose-only: it can create
// drafts, never read your inbox.
import fs from "node:fs";
import { PD_DIR, CRED, TOKEN, GMAIL_REDIRECT } from "./pd-config.mjs";

const SCOPE = "https://www.googleapis.com/auth/gmail.compose";

function b64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function staticCreds() {
  if (!fs.existsSync(CRED)) return null;
  try {
    return JSON.parse(fs.readFileSync(CRED, "utf8")).installed || JSON.parse(fs.readFileSync(CRED, "utf8")).web;
  } catch {
    return null;
  }
}

function staticToken() {
  if (!fs.existsSync(TOKEN)) return null;
  try {
    return JSON.parse(fs.readFileSync(TOKEN, "utf8"));
  } catch {
    return null;
  }
}

function saveToken(t) {
  fs.writeFileSync(TOKEN, JSON.stringify(t, null, 2), "utf8");
}

async function freshAccessToken() {
  const tok = staticToken();
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
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) return null;
  const next = await res.json();
  const merged = { ...tok, ...next, expiry_date: Math.floor(Date.now() / 1000) * 1000 + (next.expires_in || 3600) * 1000 };
  saveToken(merged);
  return merged.access_token;
}

export async function status() {
  const configured = !!staticCreds();
  const out = { configured, connected: false, email: "" };
  if (!configured) return out;
  const tok = await freshAccessToken();
  if (!tok) return out;
  try {
    const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
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

export function loginUrl(redirectUri = GMAIL_REDIRECT) {
  const creds = staticCreds();
  if (!creds) throw new Error("credentials.json not found or unreadable");
  const params = new URLSearchParams({
    client_id: creds.client_id,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function finishLogin(code, redirectUri = GMAIL_REDIRECT) {
  const creds = staticCreds();
  if (!creds) throw new Error("credentials.json not found");
  const res = await fetch("https://oauth2.googleapis.com/token", {
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
  saveToken({
    access_token: tok.access_token,
    refresh_token: tok.refresh_token,
    scope: tok.scope,
    token_type: tok.token_type,
    expiry_date: Date.now() + (tok.expires_in || 3600) * 1000,
    client_id: creds.client_id,
  });
}

export function disconnect() {
  if (fs.existsSync(TOKEN)) fs.unlinkSync(TOKEN);
}

function mimeMessage(to, subject, body, pdfPath, pdfName) {
  const lines = [];
  if (to) lines.push(`To: ${to}`);
  lines.push(`Subject: ${subject}`);
  lines.push("MIME-Version: 1.0");
  if (pdfPath && fs.existsSync(pdfPath)) {
    const boundary = `pd_${Math.random().toString(36).slice(2)}`;
    lines.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
    lines.push("", `--${boundary}`, 'Content-Type: text/plain; charset="UTF-8"', "", body);
    lines.push(`--${boundary}`);
    lines.push(`Content-Type: application/pdf; name="${pdfName}"`);
    lines.push("Content-Transfer-Encoding: base64");
    lines.push(`Content-Disposition: attachment; filename="${pdfName}"`, "");
    lines.push(fs.readFileSync(pdfPath).toString("base64"));
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
