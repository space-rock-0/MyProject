import fs from "node:fs";
import path from "node:path";
import { careerOpsRoot, readReport } from "@/lib/career-ops";
import { resolveCliOrFallback, cliUnavailableError } from "@/lib/clis";
import { spawnHeadlessCli } from "@/lib/spawn-cli.mjs";
import { CAPS } from "@/lib/worker-capabilities.mjs";
import { scopeFrom } from "@/lib/claude-invocation.mjs";
import { fencingReport } from "@/lib/cli-fencing.mjs";
import { readJsonObject } from "@/lib/json-body";
import { readResumeMarkdown, readTemplate, resolveDriveDir } from "@/lib/outreach/drive.mjs";
import { candidateFacts, extractReportMeta, normalizeQuestions } from "@/lib/outreach/context.mjs";
import { composeLocal, localContext, personalizationQuestions } from "@/lib/outreach/composer.mjs";
import { buildPrompt, normalizeRequest, parseOutreachOutput } from "@/lib/outreach/prompt.mjs";
import type { OutreachResult } from "@/lib/outreach/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Reads the user's own files and returns text. No writes, no network: the prompt
// carries everything the model needs, so a bare read-only scope is enough. The
// deny list is derived (scopeFrom), never hand-written (#2185).
const SCOPE = scopeFrom("Read,Glob,Grep");

type Body = {
  cliId?: string;
  /** "local" (default) composes from the user's files; "ai" asks their own CLI. */
  engine?: string;
  channel?: string;
  company?: string;
  role?: string;
  jd?: string;
  jobUrl?: string;
  report?: string;
  recipientName?: string;
  recipientEmail?: string;
  recipientProfile?: string;
  recipientType?: string;
  template?: string;
  resumes?: string[];
  attachResume?: string;
  formText?: string;
  questions?: string[] | string;
  answers?: Record<string, string>;
  notes?: string;
  limit?: number;
};

function readText(file: string): string {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

/** The last non-empty stderr line, ANSI stripped and clipped — enough to say why. */
function lastStderrLine(stderr: string): string {
  const line = stderr
    // eslint-disable-next-line no-control-regex
    .replace(/\u001b\[[0-9;]*m/g, "")
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean)
    .pop();
  return line ? line.slice(0, 200) : "";
}

function cliArgs(cliId: string, spec: { args: (prompt: string) => string[] }, prompt: string): string[] {
  if (cliId !== "claude") return spec.args(prompt);
  return [
    "-p",
    prompt,
    "--permission-mode",
    "acceptEdits",
    "--strict-mcp-config",
    "--allowedTools",
    SCOPE.allowed,
    "--disallowedTools",
    SCOPE.disallowed,
  ];
}

/** Run one headless CLI turn and return its stdout (empty string on failure). */
async function runCli(
  binPath: string,
  args: string[],
  cliId: string,
  cwd: string,
): Promise<{ stdout: string; stderr: string; code: number | null; error?: string }> {
  let child;
  try {
    child = spawnHeadlessCli(binPath, args, { cwd, env: process.env }, { cliId, capabilities: CAPS.localReadOnly });
  } catch (error) {
    return { stdout: "", stderr: "", code: null, error: error instanceof Error ? error.message : String(error) };
  }
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      try {
        child.kill("SIGTERM");
      } catch {
        /* already gone */
      }
    }, 180_000);
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr = `${stderr}${chunk.toString()}`.slice(-4000);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code: null, error: error.message });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code });
    });
  });
}

export async function POST(req: Request) {
  const body = await readJsonObject<Body>(req);
  if (!body) return Response.json({ error: "bad json" }, { status: 400 });

  const request = normalizeRequest(body);
  if (!request) return Response.json({ error: "channel must be email, linkedin or forms" }, { status: 400 });

  const dataRoot = careerOpsRoot();
  const drive = resolveDriveDir({ dataRoot });
  if (!drive) {
    return Response.json(
      {
        error:
          'Personal Drive not found. Put the "Personal Drive" folder next to the career-ops repo, or set CAREER_OPS_DRIVE_DIR to its absolute path.',
      },
      { status: 409 },
    );
  }

  // Prefill from the linked evaluation when the UI sent only a report number.
  let jd = request.jd ?? "";
  let company = request.company ?? "";
  let role = request.role ?? "";
  let jobUrl = body.jobUrl?.trim() || "";
  if (request.report && (!jd || !company || !role || !jobUrl)) {
    const report = readReport(request.report);
    if (report) {
      const meta = extractReportMeta(report.content);
      jd = jd || meta.jd;
      company = company || meta.company;
      role = role || meta.role;
      jobUrl = jobUrl || meta.url;
    }
  }

  const templateFolder = request.channel === "linkedin" ? "linkedin" : "email";
  const template = request.template ? readTemplate(drive, templateFolder, request.template) : "";
  const candidate = candidateFacts(readText(path.join(dataRoot, "config", "profile.yml")));
  const cv = readText(path.join(dataRoot, "cv.md"));
  const questions = normalizeQuestions(request.questions);

  // The personalization panel keys answers by question id ("recipient-name",
  // "role"), which the composer deliberately does not treat as résumé facts.
  const answers = { ...request.answers };
  let recipientName = request.recipientName ?? "";
  if (!role && answers.role?.trim()) role = answers.role.trim();
  if (!recipientName && answers["recipient-name"]?.trim()) recipientName = answers["recipient-name"].trim();

  const normalized = { ...request, jd, company, role, recipientName, jobUrl, questions };
  const resumes = (request.resumes ?? []).slice(0, 4).map((key) => ({
    key,
    label: key.toUpperCase(),
    text: readResumeMarkdown(drive, key),
  }));
  const composeCtx = { candidate, resumes, jd, template, templateName: request.template ?? "" };

  /**
   * The local composer is the default engine, not a degradation: it reads the
   * same files the prompt would, quotes the same bullets, and needs no model.
   * `warning` explains why it ran when the user asked for AI.
   */
  const composeFromFiles = (warning?: string): OutreachResult => {
    const built = localContext(normalized, composeCtx);
    const result = composeLocal(normalized, composeCtx) as OutreachResult;
    return {
      ...result,
      questions: personalizationQuestions(normalized, built),
      ...(warning ? { warning } : {}),
    };
  };

  const localResponse = (warning?: string): Response =>
    Response.json({
      ok: true,
      engine: "local",
      result: composeFromFiles(warning),
      meta: { cli: null, notice: null, promptChars: 0 },
    });

  // "local" is the default. "ai" is opt-in and still lands on the local
  // composer if the CLI cannot answer, so a draft always comes back.
  if (body.engine !== "ai") {
    return localResponse(
      body.engine && body.engine !== "local"
        ? `Unknown engine "${body.engine}" — used the local composer instead.`
        : undefined,
    );
  }

  const requestedCliId = body.cliId?.trim();
  if (!requestedCliId) {
    return Response.json(
      { error: "No CLI selected for AI drafting. Pick one in Settings, or switch the engine to Local composer." },
      { status: 400 },
    );
  }
  const resolved = resolveCliOrFallback(requestedCliId);
  if (!resolved) return Response.json(cliUnavailableError(requestedCliId), { status: 404 });
  const { spec, binPath } = resolved;
  const cliId = spec.id;

  const prompt = buildPrompt(normalized, { candidate, cv, jd, template, resumes });
  const run = await runCli(binPath, cliArgs(cliId, spec, prompt), cliId, dataRoot);
  const parsed =
    run.code === 0 ? parseOutreachOutput(run.stdout, request.channel, { limit: request.limit, questions }) : null;

  if (!parsed) {
    const reason = run.error
      ? run.error
      : run.code !== 0
        ? `the CLI exited with code ${run.code}`
        : "the reply did not contain usable JSON";
    const detail = lastStderrLine(run.stderr);
    return localResponse(
      `Could not get a usable answer from ${spec.name} (${reason}${detail ? `: ${detail}` : ""}). Composed locally from your résumés and this posting instead.`,
    );
  }

  const fencing = fencingReport({ cliId, cliName: spec.name, capabilities: CAPS.localReadOnly });
  return Response.json({
    ok: true,
    engine: "ai",
    result: { ...parsed, engine: "ai" },
    meta: {
      cli: spec.name,
      notice: fencing.notice ?? null,
      promptChars: prompt.length,
      stderr: run.stderr ? run.stderr.slice(-600) : null,
    },
  });
}
