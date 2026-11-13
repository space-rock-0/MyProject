"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Meta = {
  profile: { name: string; email: string };
  email_templates: { id: string; label: string }[];
  linkedin_templates: { id: string; label: string; stage?: string }[];
  resumes: { key: string; file: string }[];
  available: string[];
  linkedin_limits: Record<string, number>;
  models: string[];
  has_key: boolean;
  gmail: { configured: boolean; connected: boolean; email: string };
};

type Result = Record<string, unknown>;

const LS = "pd.vals.v1";

const MODES = {
  email: {
    label: "Email",
    title: "Email draft",
    hint: "Picks the matching template and resume, then saves a draft in Gmail with the PDF attached. Successful drafts are added to your job tracker.",
    endpoint: "/api/personal-drafter/email",
    fields: ["recipient_type", "recipient_name", "recipient_email", "company", "job_title", "job_link", "jd", "company_info", "person_info", "resume"],
  },
  linkedin: {
    label: "LinkedIn",
    title: "LinkedIn message",
    hint: "Connection note, first message, or referral ask, based on your templates.",
    endpoint: "/api/personal-drafter/linkedin",
    fields: ["stage", "person_name", "person_role", "company", "job_title", "job_link", "jd", "person_info", "company_info", "domain"],
  },
  form: {
    label: "Form answers",
    title: "Application form answers",
    hint: "Short, personal answers written from your resume. Anything it cannot know is marked for you to fill.",
    endpoint: "/api/personal-drafter/form",
    fields: ["questions", "limit_words", "company", "job_title", "jd", "company_info"],
  },
  cover: {
    label: "Cover letter",
    title: "Cover letter",
    hint: "Fills your CV template for one role.",
    endpoint: "/api/personal-drafter/cover",
    fields: ["company", "location", "job_title", "jd", "company_info"],
  },
} as const;

type ModeKey = keyof typeof MODES;

const F: Record<string, { label: string; type?: string; ph?: string; rows?: number; hint?: string; opts?: (meta: Meta) => [string, string][] }> = {
  recipient_type: { label: "Writing to", type: "select", opts: () => [["recruiter", "Recruiter or HR"], ["employee", "Employee or team member"], ["founder", "Founder or CTO"], ["general", "No specific opening"]] },
  recipient_name: { label: "Their name", ph: "Priya Sharma" },
  recipient_email: { label: "Their email", ph: "priya@company.com", hint: "Only used to address the Gmail draft." },
  person_name: { label: "Their name", ph: "Priya Sharma" },
  person_role: { label: "Their role and team", ph: "Senior engineer, Search team" },
  company: { label: "Company", ph: "Acme Corp" },
  job_title: { label: "Job title", ph: "AI Engineer" },
  job_link: { label: "Job link or requisition ID", ph: "https://..." },
  jd: { label: "Job description", type: "area", rows: 7, ph: "Paste the full posting. It decides which resume and which projects get featured." },
  company_info: { label: "Company notes", type: "area", rows: 3, ph: "Product, stack, recent news. Optional." },
  person_info: { label: "About them", type: "area", rows: 3, ph: "Their LinkedIn summary, recent posts, shared interests. Optional." },
  domain: { label: "Your target domain", ph: "AI/ML or software engineering" },
  stage: { label: "Message type", type: "select", opts: (m) => m.linkedin_templates.map((t) => [t.id, t.label]) },
  resume: { label: "Resume", type: "select", opts: (m) => [["auto", "Pick the best match for me"], ...m.resumes.map((r) => [r.key, `${r.key.toUpperCase()} resume`])] as [string, string][] },
  questions: { label: "Form questions", type: "area", rows: 9, ph: "Paste one question, or several separated by a line with ---", hint: "Answers use your full combined resume." },
  limit_words: { label: "Words per answer", type: "number", ph: "60" },
  location: { label: "Company location", ph: "Bengaluru, India" },
};

function Words({ text }: { text: string }) {
  return <>{(text.trim().match(/\S+/g) || []).length} words</>;
}

export function Drafter() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [mode, setMode] = useState<ModeKey>(() => (typeof window !== "undefined" && (localStorage.getItem("pd.mode") as ModeKey)) || "email");
  const [vals, setVals] = useState<Record<string, string>>(() => (typeof window !== "undefined" ? JSON.parse(localStorage.getItem(LS) || "{}") : {}));
  const [results, setResults] = useState<Partial<Record<ModeKey, Result>>>({});
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ msg: string; err?: boolean; link?: { url: string; label: string } } | null>(null);
  const [slow, setSlow] = useState(false);

  const showToast = useCallback((msg: string, err = false, link?: { url: string; label: string }) => {
    setToast({ msg, err, link });
    window.clearTimeout((showToast as unknown as { _t?: number })._t);
    (showToast as unknown as { _t?: number })._t = window.setTimeout(() => setToast(null), err ? 7000 : 5000);
  }, []);

  const refreshMeta = useCallback(async () => {
    const res = await fetch("/api/personal-drafter/meta");
    setMeta(await res.json());
  }, []);

  useEffect(() => { void refreshMeta(); }, [refreshMeta]);
  useEffect(() => { localStorage.setItem(LS, JSON.stringify(vals)); }, [vals]);
  useEffect(() => { localStorage.setItem("pd.mode", mode); }, [mode]);

  const generate = useCallback(async () => {
    if (!meta || busy) return;
    const m = MODES[mode];
    const payload: Record<string, unknown> = {};
    for (const id of m.fields) {
      payload[id] = F[id].type === "number" ? Number(vals[id] || 60) : vals[id] || "";
    }
    if (mode === "form" && !String(payload.questions || "").trim()) return showToast("Paste at least one question.", true);
    if (mode !== "form" && !String(payload.jd || "").trim() && !String(payload.company || "").trim())
      return showToast("Add a company or paste the job description first.", true);
    setBusy(true);
    setSlow(false);
    const timer = window.setTimeout(() => setSlow(true), 8000);
    try {
      const res = await fetch(m.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error || `Request failed (${res.status})`, true); return; }
      setResults((prev) => ({ ...prev, [mode]: data as Result }));
      if (mode === "email" && vals.recipient_email) setTo(vals.recipient_email);
    } finally {
      window.clearTimeout(timer);
      setSlow(false);
      setBusy(false);
    }
  }, [busy, meta, mode, vals, showToast]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); void generate(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [generate]);

  const clearJob = () => {
    setVals((prev) => {
      const next = { ...prev };
      for (const k of ["company", "job_title", "job_link", "jd", "company_info", "person_info", "recipient_name", "recipient_email", "person_name", "person_role"]) delete next[k];
      return next;
    });
  };

  const copy = async (text: string, label = "Copied") => {
    try { await navigator.clipboard.writeText(text); } catch { /* clipboard blocked */ }
    showToast(label);
  };

  if (!meta) {
    return (
      <div className="drafter-root">
        <div className="inputs" style={{ gridColumn: "1 / -1", justifyContent: "center", alignItems: "center" }}>
          Loading…
        </div>
      </div>
    );
  }

  const gmail = meta.gmail;
  const emailResult = results.email as { subject?: string; body?: string; resume_key?: string; scores?: Record<string, number>; template?: string; meta?: { model: string; prompt_tokens: number; completion_tokens: number } } | undefined;
  const linkedinResult = results.linkedin as { message?: string; limit?: number; note?: string; meta?: { model: string; prompt_tokens: number; completion_tokens: number } } | undefined;
  const formResult = results.form as { answers?: { q: string; a: string }[]; meta?: { model: string; prompt_tokens: number; completion_tokens: number } } | undefined;
  const coverResult = results.cover as { text?: string; meta?: { model: string; prompt_tokens: number; completion_tokens: number } } | undefined;

  return (
    <div className="drafter-root">
      {/* Rail */}
      <aside className="rail">
        <div className="brand">Personal Drafter<small>{meta.profile.name}</small></div>
        <nav className="nav" aria-label="Draft type">
          {(Object.keys(MODES) as ModeKey[]).map((k) => (
            <button
              key={k}
              type="button"
              aria-current={k === mode}
              onClick={() => setMode(k)}
            >
              {MODES[k].label}
            </button>
          ))}
        </nav>
        <div className="status">
          <div className="chip"><a className="linkbtn" style={{ color: "var(--rail-muted)" }} href="/">← Back to career-ops</a></div>
          {!gmail.configured ? (
            <div className="chip"><span className="dot" /><span>Gmail not set up. credentials.json is missing from data/personal-drafter/.</span></div>
          ) : !gmail.connected ? (
            <div className="chip"><span className="dot bad" /><span>Gmail not connected. <a className="linkbtn" href="/auth/google/login">Connect</a></span></div>
          ) : (
            <div className="chip"><span className="dot ok" /><span>Gmail: {gmail.email} <button className="linkbtn" type="button" onClick={async () => { await fetch("/api/personal-drafter/gmail/disconnect", { method: "POST" }); void refreshMeta(); }}>Disconnect</button></span></div>
          )}
          <div className="chip"><span className={meta.has_key ? "dot ok" : "dot bad"} /><span>{meta.has_key ? `Groq: ${meta.models[0]}` : "No PD_GROQ_API_KEY in .env"}</span></div>
        </div>
      </aside>

      {/* Inputs */}
      <section className="inputs" aria-label="Inputs">
        <h1>{MODES[mode].title}</h1>
        <p className="hint">{MODES[mode].hint}</p>
        {MODES[mode].fields.map((id) => {
          const f = F[id];
          const fid = `f-${id}`;
          const val = vals[id] ?? (id === "limit_words" ? "60" : "");
          const set = (v: string) => setVals((prev) => ({ ...prev, [id]: v }));
          return (
            <div className="field" key={id}>
              <label htmlFor={fid}>{f.label}</label>
              {f.type === "select" ? (
                <select id={fid} value={val} onChange={(e) => set(e.target.value)}>
                  {(f.opts ? f.opts(meta) : []).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              ) : f.type === "area" ? (
                <textarea id={fid} rows={f.rows || 3} placeholder={f.ph || ""} value={val} onChange={(e) => set(e.target.value)} />
              ) : (
                <input id={fid} type={f.type || "text"} placeholder={f.ph || ""} autoComplete="off" value={val} onChange={(e) => set(e.target.value)} />
              )}
              {f.hint && <small>{f.hint}</small>}
            </div>
          );
        })}
        <div className="sticky">
          <button className="btn primary" type="button" disabled={busy} onClick={() => void generate()}>
            {busy ? "Drafting..." : "Generate draft"}
          </button>
          <span className="kbd">Ctrl or Cmd + Enter</span>
          <button className="linkish" type="button" onClick={clearJob}>Clear job details</button>
        </div>
      </section>

      {/* Output */}
      <main className="output" aria-live="polite">
        {slow && <p className="slow">Groq is throttling the free tier. Retrying, this can take up to a minute.</p>}
        {mode === "email" && <EmailOutput result={emailResult} meta={meta} vals={vals} to={to} setTo={setTo} showToast={showToast} copy={copy} />}
        {mode === "linkedin" && <LinkedInOutput result={linkedinResult} copy={copy} />}
        {mode === "form" && <FormOutput result={formResult} copy={copy} />}
        {mode === "cover" && <CoverOutput result={coverResult} copy={copy} />}
        {!results[mode] && (
          <div className="empty">
            <h2>Nothing drafted yet</h2>
            <p>{mode === "form" ? "Paste the form questions on the left and generate. Answers come from your full resume." : "Paste the job description on the left and generate. Your templates and the best-matching resume do the rest."}</p>
          </div>
        )}
      </main>

      {toast && (
        <div role="status" className={`toast show${toast.err ? " err" : ""}`}>
          {toast.msg}{" "}
          {toast.link && <a href={toast.link.url} target="_blank" rel="noopener noreferrer">{toast.link.label}</a>}
        </div>
      )}
    </div>
  );
}

// ---------- Output views ----------

function Facts({ meta }: { meta?: { model: string; prompt_tokens: number; completion_tokens: number } }) {
  if (!meta) return null;
  const fmt = (n: number) => (n || 0).toLocaleString();
  return (
    <ul className="facts">
      <li><b>Model</b> {meta.model}</li>
      <li><b>Prompt</b> {fmt(meta.prompt_tokens)} tokens</li>
      <li><b>Reply</b> {fmt(meta.completion_tokens)} tokens</li>
    </ul>
  );
}

function AutoTextarea({ value, onEdit, ariaLabel }: { value: string; onEdit?: (v: string) => void; ariaLabel: string }) {
  return (
    <textarea
      className="paper"
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => { e.currentTarget.style.height = "auto"; e.currentTarget.style.height = `${e.currentTarget.scrollHeight}px`; onEdit?.(e.currentTarget.value); }}
      ref={(el) => { if (el) { el.style.height = "auto"; el.style.height = `${el.scrollHeight}px`; } }}
    />
  );
}

function EmailOutput({
  result, meta, vals, to, setTo, showToast, copy,
}: {
  result?: { subject?: string; body?: string; resume_key?: string; scores?: Record<string, number>; template?: string; meta?: { model: string; prompt_tokens: number; completion_tokens: number } };
  meta: Meta;
  vals: Record<string, string>;
  to: string;
  setTo: (v: string) => void;
  showToast: (msg: string, err?: boolean, link?: { url: string; label: string }) => void;
  copy: (t: string, label?: string) => Promise<void>;
}) {
  const [subject, setSubject] = useState(result?.subject || "");
  const [body, setBody] = useState(result?.body || "");
  const [resumeKey, setResumeKey] = useState(result?.resume_key || "");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setSubject(result?.subject || "");
    setBody(result?.body || "");
    setResumeKey(result?.resume_key || "");
  }, [result]);

  if (!result) return null;
  const pdf = meta.resumes.find((r) => r.key === resumeKey);

  const createDraft = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/personal-drafter/gmail/draft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          to,
          subject,
          body,
          resume_key: resumeKey,
          company: vals.company,
          role: vals.job_title,
          jobLink: vals.job_link,
        }),
      });
      const data = await res.json();
      if (!res.ok) return showToast(data.error || "Gmail draft failed", true);
      showToast("Draft saved in Gmail and added to job tracker.", false, { url: data.url, label: "Open it" });
    } catch {
      showToast("Gmail draft failed", true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <article className="letter">
      <div className="stripe" />
      <div className="lbody">
        <div className="row"><label htmlFor="o-to">To</label><input id="o-to" type="email" placeholder="recipient@company.com" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <div className="row"><label htmlFor="o-sub">Subject</label><input id="o-sub" value={subject} onChange={(e) => setSubject(e.target.value)} /></div>
        <AutoTextarea value={body} onEdit={setBody} ariaLabel="Draft body" />
        <div className="attach">
          Attached{" "}
          <select value={resumeKey} onChange={(e) => setResumeKey(e.target.value)} aria-label="Attached resume">
            <option value="">No attachment</option>
            {meta.resumes.map((r) => <option key={r.key} value={r.key}>{r.file}</option>)}
          </select>
          {pdf && <a href={`/api/personal-drafter/resume/${pdf.key}`} target="_blank" rel="noreferrer">Preview PDF</a>}
          <span>Template: {result.template}. Resume scores: {result.scores ? Object.entries(result.scores).map(([k, v]) => `${k} ${v}`).join(", ") : "—"}</span>
        </div>
      </div>
      <div className="actions">
        <button className="btn primary" type="button" disabled={saving} onClick={() => void createDraft()}>
          {saving ? "Saving draft…" : "Create Gmail draft"}
        </button>
        <button className="btn" type="button" onClick={() => void copy(`Subject: ${subject}\n\n${body}`)}>Copy</button>
      </div>
      <Facts meta={result.meta} />
      <div className="stripe" />
    </article>
  );
}

function LinkedInOutput({ result, copy }: { result?: { message?: string; limit?: number; note?: string; meta?: { model: string; prompt_tokens: number; completion_tokens: number } }; copy: (t: string, label?: string) => Promise<void> }) {
  const [msg, setMsg] = useState(result?.message || "");
  useEffect(() => { setMsg(result?.message || ""); }, [result]);
  if (!result) return null;
  const limit = result.limit ?? 700;
  const hard = limit <= 300;
  const n = msg.length;
  return (
    <article className="letter">
      <div className="stripe" />
      <div className="lbody">
        {result.note && <p className="note">{result.note}</p>}
        <AutoTextarea value={msg} onEdit={setMsg} ariaLabel="LinkedIn message" />
      </div>
      <div className="actions">
        <button className="btn primary" type="button" onClick={() => void copy(msg, "Message copied")}>Copy message</button>
        <span className={`count${hard && n > limit ? " warn" : ""}`}>{n}{hard ? ` / ${limit}` : " characters"}</span>
      </div>
      <Facts meta={result.meta} />
      <div className="stripe" />
    </article>
  );
}

function FormOutput({ result, copy }: { result?: { answers?: { q: string; a: string }[]; meta?: { model: string; prompt_tokens: number; completion_tokens: number } }; copy: (t: string, label?: string) => Promise<void> }) {
  const [answers, setAnswers] = useState<{ q: string; a: string }[]>(result?.answers || []);
  useEffect(() => { setAnswers(result?.answers || []); }, [result]);
  if (!result) return null;
  return (
    <article className="letter">
      <div className="stripe" />
      {answers.map((item, i) => (
        <div className="qa" key={i}>
          <p className="q">{item.q}</p>
          <AutoTextarea value={item.a} onEdit={(v) => setAnswers((prev) => prev.map((p, j) => (j === i ? { ...p, a: v } : p)))} ariaLabel={`Answer ${i + 1}`} />
          <div className="tools">
            <span><Words text={item.a} /></span>
            {/\[FILL/.test(item.a) && <span className="badge">Needs your input</span>}
            <button className="linkish" type="button" onClick={() => void copy(item.a, "Answer copied")}>Copy</button>
          </div>
        </div>
      ))}
      <div className="actions">
        <button className="btn primary" type="button" onClick={() => void copy(answers.map((x, i) => `${i + 1}. ${x.q}\n${x.a}`).join("\n\n"), "All answers copied")}>Copy all</button>
      </div>
      <Facts meta={result.meta} />
      <div className="stripe" />
    </article>
  );
}

function CoverOutput({ result, copy }: { result?: { text?: string; meta?: { model: string; prompt_tokens: number; completion_tokens: number } }; copy: (t: string, label?: string) => Promise<void> }) {
  const [text, setText] = useState(result?.text || "");
  useEffect(() => { setText(result?.text || ""); }, [result]);
  if (!result) return null;
  return (
    <article className="letter">
      <div className="stripe" />
      <div className="lbody">
        <AutoTextarea value={text} onEdit={setText} ariaLabel="Cover letter" />
      </div>
      <div className="actions">
        <button className="btn primary" type="button" onClick={() => void copy(text, "Letter copied")}>Copy letter</button>
      </div>
      <Facts meta={result.meta} />
      <div className="stripe" />
    </article>
  );
}
