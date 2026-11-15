"use client";

import { useEffect, useState } from "react";
import { PageFrame } from "@/components/page-frame";
import { cn } from "@/lib/cn";

type Row = {
  id: number;
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

const CHANNELS = ["Email","LinkedIn","Phone","Careers Site","Other"];

export default function OutreachPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [editing, setEditing] = useState<Row | null>(null);
  const [adding, setAdding] = useState(false);

  async function request(url: string, options?: RequestInit) {
    const res = await fetch(url, options);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      window.alert(data.error || "Save failed. Your changes have not been confirmed; reload and retry.");
      throw new Error(data.error || "Request failed");
    }
    return res;
  }
  async function load() {
    const res = await request("/api/outreach-tracker");
    setRows(await res.json());
  }
  useEffect(() => { load(); }, []);

  async function saveRow(row: Row) {
    if (row.id) {
      await request("/api/outreach-tracker", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(row) });
    } else {
      await request("/api/outreach-tracker", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(row) });
    }
    setEditing(null); setAdding(false); load();
  }

  async function del(id: number) {
    await request(`/api/outreach-tracker?id=${id}`, { method: "DELETE" });
    load();
  }

  return (
    <PageFrame>
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl tracking-tight text-landing">Outreach</h1>
          <p className="mt-1 text-sm text-muted"><span className="tabular-nums">{rows.length}</span> contacts</p>
        </div>
        <button
          onClick={() => { setAdding(true); setEditing({ id: 0, company: "", roles: "" }); }}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-brand px-5 py-2 text-sm font-medium text-brand-foreground transition-colors hover:bg-brand-200 max-sm:min-h-[44px]"
        >
          Add
        </button>
      </div>

      <div className="mt-4 overflow-x-auto rounded-2xl border border-border">
        <table className="w-full min-w-[80rem] text-sm">
          <thead className="bg-surface/60 text-left text-xs uppercase tracking-wide text-faint">
            <tr>
              <th className="whitespace-nowrap px-4 py-2.5 font-medium">id</th>
              <th className="whitespace-nowrap px-4 py-2.5 font-medium">company</th>
              <th className="whitespace-nowrap px-4 py-2.5 font-medium">role title(s)</th>
              <th className="whitespace-nowrap px-4 py-2.5 font-medium">careers page</th>
              <th className="whitespace-nowrap px-4 py-2.5 font-medium">salary / rate</th>
              <th className="whitespace-nowrap px-4 py-2.5 font-medium">login date</th>
              <th className="whitespace-nowrap px-4 py-2.5 font-medium">contact person(s)</th>
              <th className="whitespace-nowrap px-4 py-2.5 font-medium">email id(s)</th>
              <th className="whitespace-nowrap px-4 py-2.5 font-medium">outreach channel</th>
              <th className="whitespace-nowrap px-4 py-2.5 font-medium">response</th>
              <th className="whitespace-nowrap px-4 py-2.5 font-medium">phone number(s)</th>
              <th className="whitespace-nowrap px-4 py-2.5 font-medium">follow-up date</th>
              <th className="whitespace-nowrap px-4 py-2.5 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.id} className="transition-colors hover:bg-surface/40">
                <td className="whitespace-nowrap px-4 py-3 font-medium tabular-nums">{r.id}</td>
                <td className="px-4 py-3 font-medium">{r.company}</td>
                <td className="px-4 py-3 text-muted">{r.roles}</td>
                <td className="px-4 py-3">{r.careersPage && <a href={r.careersPage} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-brand-text hover:underline">link <span aria-hidden>↗</span></a>}</td>
                <td className="whitespace-nowrap px-4 py-3 text-muted">{r.salary}</td>
                <td className="whitespace-nowrap px-4 py-3 text-faint tabular-nums">{r.loginDate}</td>
                <td className="px-4 py-3 text-muted">{r.contactPerson}</td>
                <td className="px-4 py-3 text-muted">{r.email}</td>
                <td className="whitespace-nowrap px-4 py-3 text-muted">{r.outreachChannel}</td>
                <td className="whitespace-nowrap px-4 py-3 text-muted">{r.response}</td>
                <td className="whitespace-nowrap px-4 py-3 text-muted">{r.phone}</td>
                <td className="whitespace-nowrap px-4 py-3 text-faint tabular-nums">{r.followUpDate}</td>
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
            <input placeholder="role title(s) — multiple allowed" value={editing?.roles ?? ""} onChange={(e) => setEditing((p) => ({ ...(p as Row), roles: e.target.value }))} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
            <input placeholder="careers page" value={editing?.careersPage ?? ""} onChange={(e) => setEditing((p) => ({ ...(p as Row), careersPage: e.target.value }))} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
            <input placeholder="salary / rate" value={editing?.salary ?? ""} onChange={(e) => setEditing((p) => ({ ...(p as Row), salary: e.target.value }))} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
            <input placeholder="login date (dd/mm/yy)" value={editing?.loginDate ?? ""} onChange={(e) => setEditing((p) => ({ ...(p as Row), loginDate: e.target.value }))} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
            <input placeholder="contact person(s)" value={editing?.contactPerson ?? ""} onChange={(e) => setEditing((p) => ({ ...(p as Row), contactPerson: e.target.value }))} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
            <input placeholder="email id(s)" value={editing?.email ?? ""} onChange={(e) => setEditing((p) => ({ ...(p as Row), email: e.target.value }))} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
            <select value={editing?.outreachChannel ?? ""} onChange={(e) => setEditing((p) => ({ ...(p as Row), outreachChannel: e.target.value }))} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm">
              <option value="">outreach channel</option>
              {CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input placeholder="response" value={editing?.response ?? ""} onChange={(e) => setEditing((p) => ({ ...(p as Row), response: e.target.value }))} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
            <input placeholder="phone number(s)" value={editing?.phone ?? ""} onChange={(e) => setEditing((p) => ({ ...(p as Row), phone: e.target.value }))} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
            <input placeholder="follow-up date" value={editing?.followUpDate ?? ""} onChange={(e) => setEditing((p) => ({ ...(p as Row), followUpDate: e.target.value }))} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
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
