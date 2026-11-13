"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Row = {
  company: string;
  roles: string;
  careersPage?: string;
  salary?: string;
  loginDate?: string;
  contactPerson?: string;
  email?: string;
  outreachChannel?: string;
  response?: string;
  phone?: string;
  followUpDate?: string;
};

export function OutreachAdder() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function parse() {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/outreach-adder/parse", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      setRows(data.rows || []);
      if (!res.ok) setMsg(data.error || "parse failed");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    try {
      const res = await fetch("/api/outreach-adder/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const data = await res.json();
      setMsg(`Saved ${data.saved?.length ?? 0}, skipped ${data.skipped ?? 0}`);
      setRows([]);
      setText("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-4 rounded-2xl border border-border bg-surface/40 p-5">
      <h2 className="text-sm font-medium text-foreground">Add Outreach (AI)</h2>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        className="mt-3 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
        placeholder="Paste free text (company, contacts, emails, careers page, salary, follow-ups...)..."
      />
      <div className="mt-3 flex gap-3">
        <button onClick={() => void parse()} disabled={busy || !text.trim()} className="rounded-full bg-brand px-4 py-2 text-sm">
          {busy ? "Parsing…" : "Parse with AI"}
        </button>
        {rows.length > 0 && (
          <button onClick={() => void save()} disabled={busy} className="rounded-full bg-brand px-4 py-2 text-sm">
            Save to outreach tracker
          </button>
        )}
      </div>
      {msg && <p className="mt-2 text-sm text-muted">{msg}</p>}
      {rows.length > 0 && (
        <pre className="mt-3 overflow-auto text-xs">{JSON.stringify(rows, null, 2)}</pre>
      )}
    </section>
  );
}
