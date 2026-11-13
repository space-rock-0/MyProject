/**
 * gmail.mjs — Gmail draft creation (never sending) and a portable .eml fallback.
 *
 * Two paths, one contract:
 *   configured  → Gmail API draft, with the chosen résumé PDF attached.
 *   not configured → the same RFC822 message handed back as an .eml download,
 *                    which opens in Gmail, Outlook, Thunderbird or Apple Mail.
 *
 * Draft creation only. Nothing here can send mail: there is no `send` call and
 * the scope requested is gmail.compose, not gmail.send (web/AGENTS.md rule 3).
 */

import fs from "node:fs";
import path from "node:path";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRAFT_URL = "https://gmail.googleapis.com/gmail/v1/users/me/drafts";
const CREDENTIALS_FILE = path.join("data", "gmail.json");

const PDF_CONTENT_TYPE = "application/pdf";

function nonEmpty(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

/**
 * Resolve Gmail credentials from the environment or `data/gmail.json`.
 *
 * Accepted keys (file or env): clientId / clientSecret / refreshToken / from,
 * or a bare accessToken for a short-lived manual token. Env names are the same
 * in SCREAMING_SNAKE: GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN,
 * GMAIL_ACCESS_TOKEN, GMAIL_FROM.
 *
 * @param {{env?: NodeJS.ProcessEnv, dataRoot?: string}} [opts]
 * @returns {{configured: boolean, from: string, clientId: string, clientSecret: string, refreshToken: string, accessToken: string, missing: string[], source: "env" | "file" | "none", fileError: string | null}}
 */
export function readGmailConfig({ env = process.env, dataRoot } = {}) {
  const base = {
    configured: false,
    from: "",
    clientId: "",
    clientSecret: "",
    refreshToken: "",
    accessToken: "",
    missing: [],
    source: "none",
    fileError: null,
  };

  let fileConfig = {};
  if (dataRoot) {
    const file = path.join(dataRoot, CREDENTIALS_FILE);
    try {
      if (fs.existsSync(file)) {
        fileConfig = JSON.parse(fs.readFileSync(file, "utf8")) ?? {};
        base.source = "file";
      }
    } catch (error) {
      // A present-but-broken credentials file is an error the user must see,
      // never "not configured yet" (web/AGENTS.md: missing ≠ malformed).
      base.fileError = error instanceof Error ? error.message : String(error);
    }
  }

  const pick = (envKey, fileKey) => nonEmpty(env[envKey]) || nonEmpty(fileConfig[fileKey]);
  base.clientId = pick("GMAIL_CLIENT_ID", "clientId");
  base.clientSecret = pick("GMAIL_CLIENT_SECRET", "clientSecret");
  base.refreshToken = pick("GMAIL_REFRESH_TOKEN", "refreshToken");
  base.accessToken = pick("GMAIL_ACCESS_TOKEN", "accessToken");
  base.from = pick("GMAIL_FROM", "from");
  if (nonEmpty(env.GMAIL_CLIENT_ID) || nonEmpty(env.GMAIL_REFRESH_TOKEN) || nonEmpty(env.GMAIL_ACCESS_TOKEN)) {
    base.source = "env";
  }

  const missing = [];
  if (!base.from) missing.push("from");
  if (!base.accessToken) {
    if (!base.clientId) missing.push("clientId");
    if (!base.clientSecret) missing.push("clientSecret");
    if (!base.refreshToken) missing.push("refreshToken");
  }
  base.missing = missing;
  base.configured = missing.length === 0;
  return base;
}

/** RFC 2047 encode a header value when it is not plain ASCII. */
export function encodeHeader(value) {
  const text = String(value ?? "").replace(/[\r\n]+/g, " ").trim();
  // eslint-disable-next-line no-control-regex
  if (/^[\x20-\x7E]*$/.test(text)) return text;
  return `=?UTF-8?B?${Buffer.from(text, "utf8").toString("base64")}?=`;
}

function base64Lines(buffer, width = 76) {
  const b64 = buffer.toString("base64");
  const lines = [];
  for (let i = 0; i < b64.length; i += width) lines.push(b64.slice(i, i + width));
  return lines.join("\r\n");
}

/**
 * Build an RFC822 message. Used for both the Gmail API `raw` field and the
 * `.eml` download, so the two can never drift.
 *
 * @param {{from: string, to: string, subject: string, body: string, attachment?: {filename: string, contentType?: string, base64: string} | null}} message
 * @returns {string} CRLF-joined RFC822 text.
 */
export function buildMimeMessage({ from, to, subject, body, attachment }) {
  const boundary = `career-ops-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const headers = [
    `From: ${encodeHeader(from)}`,
    `To: ${encodeHeader(to)}`,
    `Subject: ${encodeHeader(subject)}`,
    `Date: ${new Date().toUTCString()}`,
    "MIME-Version: 1.0",
    "X-Mailer: career-ops outreach",
  ];

  const bodyPart = [
    `Content-Type: text/plain; charset="UTF-8"`,
    "Content-Transfer-Encoding: base64",
    "",
    base64Lines(Buffer.from(String(body ?? ""), "utf8")),
  ].join("\r\n");

  if (!attachment?.base64) {
    return [...headers, `Content-Type: text/plain; charset="UTF-8"`, "Content-Transfer-Encoding: base64", "", base64Lines(Buffer.from(String(body ?? ""), "utf8")), ""].join(
      "\r\n",
    );
  }

  const filename = String(attachment.filename || "resume.pdf").replace(/["\r\n]/g, "");
  const type = attachment.contentType || PDF_CONTENT_TYPE;
  const attachmentPart = [
    `Content-Type: ${type}; name="${filename}"`,
    "Content-Transfer-Encoding: base64",
    `Content-Disposition: attachment; filename="${filename}"`,
    "",
    attachment.base64.replace(/\s+/g, "").replace(/(.{76})/g, "$1\r\n").replace(/\r\n$/, ""),
  ].join("\r\n");

  return [
    ...headers,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    bodyPart,
    `--${boundary}`,
    attachmentPart,
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

/** Read a PDF from disk into the attachment shape. Returns null when absent. */
export function attachmentFromFile(filePath) {
  if (!filePath) return null;
  try {
    const buffer = fs.readFileSync(filePath);
    return {
      filename: path.basename(filePath),
      contentType: PDF_CONTENT_TYPE,
      base64: buffer.toString("base64"),
      bytes: buffer.length,
    };
  } catch {
    return null;
  }
}

export function base64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function accessTokenFor(config, fetchImpl = fetch) {
  if (config.accessToken) return config.accessToken;
  const form = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: config.refreshToken,
    grant_type: "refresh_token",
  });
  const response = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.access_token) {
    const reason = payload?.error_description || payload?.error || `HTTP ${response.status}`;
    throw new Error(`Gmail token refresh failed: ${reason}`);
  }
  return payload.access_token;
}

/**
 * Create a Gmail draft. Throws with a readable message on auth/API failure so
 * the route can return it to the UI instead of a generic 500.
 *
 * @param {ReturnType<typeof readGmailConfig>} config
 * @param {{to: string, subject: string, body: string, attachment?: object | null}} message
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<{id: string, messageId: string, threadId: string, webLink: string}>}
 */
export async function createGmailDraft(config, message, fetchImpl = fetch) {
  if (!config.configured) throw new Error("Gmail is not configured");
  const token = await accessTokenFor(config, fetchImpl);
  const raw = base64url(
    buildMimeMessage({
      from: config.from,
      to: message.to,
      subject: message.subject,
      body: message.body,
      attachment: message.attachment ?? null,
    }),
  );
  const response = await fetchImpl(DRAFT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message: { raw } }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.id) {
    const reason = payload?.error?.message || payload?.error || `HTTP ${response.status}`;
    throw new Error(`Gmail draft failed: ${reason}`);
  }
  return {
    id: payload.id,
    messageId: payload.message?.id ?? "",
    threadId: payload.message?.threadId ?? "",
    webLink: "https://mail.google.com/mail/u/0/#drafts",
  };
}

/** A safe download filename for the .eml fallback. */
export function emlFilename(company, role) {
  const slug = (value) =>
    String(value ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40);
  const parts = [slug(company), slug(role), new Date().toISOString().slice(0, 10)].filter(Boolean);
  return `${parts.join("-") || "outreach"}.eml`;
}
