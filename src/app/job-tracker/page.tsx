"use client";

import { useEffect, useState } from "react";
import { PageFrame } from "@/components/page-frame";
import { cn } from "@/lib/cn";

const STATUSES = ["INBOX","ALL","EVALUATED","APPLIED","RESPONDED","ASSESSMENT","INTERVIEW","OFFER","HIRED","REJECTED","DISCARDED","SKIP"];
// Real statuses only — ALL is a filter tab, never a row value.
const STATUS_OPTIONS = STATUSES.filter((s) => s !== "ALL");
const SOURCES = ["LinkedIn","Mail","Career website","Custom","Referral"];

type Row = {
  id: number;
  company: string;
  jobLink?: string;
  role: string;
  date?: string;
  status: string;
  careerPage?: string;
  mail?: string;
  source?: string;
};

export default function JobTrackerPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [tab, setTab] = useState("ALL");
  const [editing, setEditing] = useState<Row | null>(null);
  const [adding, setAdding] = useState(false);

  async function load() {
    const res = await fetch("/api/job-tracker");
    setRows(await res.json());
  }
  useEffect(() => { load(); }, []);

  async function saveRow(row: Row) {
    if (row.id) {
      await fetch("/api/job-tracker", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(row) });
    } else {
      await fetch("/api/job-tracker", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(row) });
    }
    setEditing(null); setAdding(false); load();
  }

  async function del(id: number) {
    await fetch(`/api/job-tracker?id=${id}`, { method: "DELETE" });
    load();
  }

  const counts = Object.fromEntries(STATUSES.map((s) => [s, rows.filter((r) => r.status === s).length]));
  counts.ALL = rows.length;
  const filtered = tab === "ALL" ? rows : rows.filter((r) => r.status === tab);

  return (
    <PageFrame>
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl tracking-tight text-landing">Job Tracker</h1>
          <p className="mt-1 text-sm text-muted">
            <span className="tabular-nums">{rows.length}</span> tracked
          </p>
        </div>
        <button
          onClick={() => { setAdding(true); setEditing({ id: 0, company: "", role: "", status: "INBOX" }); }}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-brand px-5 py-2 text-sm font-medium text-brand-foreground transition-colors hover:bg-brand-200 max-sm:min-h-[44px]"
        >
          Add
        </button>
      </div>

      <div className="mt-6 flex flex-wrap gap-1 border-b border-border">
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setTab(s)}
            className={cn(
              "-mb-px inline-flex items-center justify-center gap-1 border-b-2 px-3 py-2 text-xs font-medium transition-colors max-sm:min-h-[44px]",
              tab === s ? "border-brand text-foreground" : "border-transparent text-muted hover:text-foreground",
            )}
          >
            {s} <span className="text-faint tabular-nums">{counts[s] ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="mt-4 overflow-x-auto rounded-2xl border border-border">
        <table className="w-full min-w-[60rem] text-sm">
          <thead className="bg-surface/60 text-left text-xs uppercase tracking-wide text-faint">
            <tr>
              <th className="whitespace-nowrap px-4 py-2.5 font-medium">id</th>
              <th className="whitespace-nowrap px-4 py-2.5 font-medium">company</th>
              <th className="whitespace-nowrap px-4 py-2.5 font-medium">job link</th>
              <th className="whitespace-nowrap px-4 py-2.5 font-medium">role</th>
              <th className="whitespace-nowrap px-4 py-2.5 font-medium">date</th>
              <th className="whitespace-nowrap px-4 py-2.5 font-medium">status</th>
              <th className="whitespace-nowrap px-4 py-2.5 font-medium">career page</th>
              <th className="whitespace-nowrap px-4 py-2.5 font-medium">mail</th>
              <th className="whitespace-nowrap px-4 py-2.5 font-medium">source</th>
              <th className="whitespace-nowrap px-4 py-2.5 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((r) => (
              <tr key={r.id} className="transition-colors hover:bg-surface/40">
                <td className="whitespace-nowrap px-4 py-3 font-medium tabular-nums">{r.id}</td>
                <td className="px-4 py-3 font-medium">{r.company}</td>
                <td className="px-4 py-3">
                  {r.jobLink && <a href={r.jobLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-brand-text hover:underline">link <span aria-hidden>↗</span></a>}
                </td>
                <td className="px-4 py-3 text-muted">{r.role}</td>
                <td className="whitespace-nowrap px-4 py-3 text-faint tabular-nums">{r.date}</td>
                <td className="whitespace-nowrap px-4 py-3">
                  <select
                    value={r.status}
                    onChange={async (e) => { const nr = { ...r, status: e.target.value }; await fetch("/api/job-tracker", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(nr) }); load(); }}
                    className="rounded-md border border-border bg-surface px-2 py-1 text-sm text-foreground"
                  >
                    {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
                <td className="px-4 py-3">
                  {r.careerPage && <a href={r.careerPage} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-brand-text hover:underline">link <span aria-hidden>↗</span></a>}
                </td>
                <td className="px-4 py-3 text-muted">{r.mail}</td>
                <td className="px-4 py-3 text-muted">{r.source}</td>
                <td className="px-4 py-3 space-x-2 whitespace-nowrap">
                  <button onClick={() => setEditing(r)} className="text-xs font-medium text-brand-text hover:underline">edit</button>
                  <button onClick={() => del(r.id)} className="text-xs font-medium text-red-500 hover:underline">del</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(editing || adding) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg space-y-2 rounded-2xl border border-border bg-surface p-5">
            <input placeholder="company *" value={editing?.company ?? ""} onChange={(e) => setEditing((p) => ({ ...(p as Row), company: e.target.value }))} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
            <input placeholder="role *" value={editing?.role ?? ""} onChange={(e) => setEditing((p) => ({ ...(p as Row), role: e.target.value }))} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
            <input placeholder="job link" value={editing?.jobLink ?? ""} onChange={(e) => setEditing((p) => ({ ...(p as Row), jobLink: e.target.value }))} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
            <input placeholder="career page" value={editing?.careerPage ?? ""} onChange={(e) => setEditing((p) => ({ ...(p as Row), careerPage: e.target.value }))} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
            <input placeholder="mail" value={editing?.mail ?? ""} onChange={(e) => setEditing((p) => ({ ...(p as Row), mail: e.target.value }))} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
            <select value={editing?.status ?? "INBOX"} onChange={(e) => setEditing((p) => ({ ...(p as Row), status: e.target.value }))} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm">
              {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={editing?.source ?? ""} onChange={(e) => setEditing((p) => ({ ...(p as Row), source: e.target.value }))} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm">
              <option value="">source</option>
              {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
              <option value="Custom">+ Custom</option>
            </select>
            {editing?.source === "Custom" && <input placeholder="custom source" onChange={(e) => setEditing((p) => ({ ...(p as Row), source: e.target.value }))} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />}
            <div className="flex gap-2 pt-2">
              <button onClick={() => { if (editing) saveRow(editing); }} className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-brand-foreground hover:bg-brand-200">Save</button>
              <button onClick={() => { setEditing(null); setAdding(false); }} className="rounded-full border border-border px-4 py-2 text-sm">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </PageFrame>
  );
}
