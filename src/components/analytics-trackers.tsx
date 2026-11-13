import fs from "node:fs";
import path from "node:path";
import { BriefcaseBusiness, Mail, Send, Users, CalendarClock, ClipboardCheck, Phone, CircleCheck, XCircle } from "lucide-react";
import { Panel, MetricCard } from "@/components/analytics-view";

type JobRow = { id: number; company: string; role: string; status: string; source?: string; date?: string; jobLink?: string; careerPage?: string; mail?: string };
type OutreachRow = { id: number; company: string; roles?: string; outreachChannel?: string; response?: string; followUpDate?: string; email?: string; phone?: string; contactPerson?: string };

function readJson(file: string): any[] {
  try {
    const base = process.env.CAREER_OPS_DATA_DIR ? path.resolve(process.env.CAREER_OPS_DATA_DIR) : path.join(process.cwd(), "data");
    const p = path.join(base, file);
    if (!fs.existsSync(p)) return [];
    const parsed = JSON.parse(fs.readFileSync(p, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const FUNNEL = ["APPLIED", "RESPONDED", "ASSESSMENT", "INTERVIEW", "OFFER"] as const;
const TERMINAL_OK = "HIRED";

export function TrackersView() {
  const jobs: JobRow[] = readJson("job-tracker.json");
  const outreach: OutreachRow[] = readJson("outreach-tracker.json");

  const n = jobs.length;
  const count = (s: string) => jobs.filter((j) => j.status === s).length;
  const statusCount = (s: string) => jobs.filter((j) => j.status === s).length;

  const applied = jobs.filter((j) => ["APPLIED", "RESPONDED", "ASSESSMENT", "INTERVIEW", "OFFER", "HIRED"].includes(j.status)).length;
  const responded = jobs.filter((j) => ["RESPONDED", "ASSESSMENT", "INTERVIEW", "OFFER", "HIRED"].includes(j.status)).length;
  const interviews = jobs.filter((j) => ["INTERVIEW", "OFFER", "HIRED"].includes(j.status)).length;
  const offers = jobs.filter((j) => ["OFFER", "HIRED"].includes(j.status)).length;
  const hired = count("HIRED");

  const applyRate = n ? (applied / n) * 100 : 0;
  const responseRate = applied ? (responded / applied) * 100 : 0;
  const interviewRate = responded ? (interviews / responded) * 100 : 0;
  const offerRate = interviews ? (offers / interviews) * 100 : 0;
  const hireRate = n ? (hired / n) * 100 : 0;

  const statusEntries = Object.entries(countBy(jobs.map((j) => j.status))).sort((a, b) => b[1] - a[1]);
  const sourceEntries = Object.entries(countBy(jobs.map((j) => j.source || "Unknown"))).sort((a, b) => b[1] - a[1]);
  const channelEntries = Object.entries(countBy(outreach.map((o) => o.outreachChannel || "Unknown"))).sort((a, b) => b[1] - a[1]);
  const responseEntries = Object.entries(countBy(outreach.map((o) => o.response || "No response"))).sort((a, b) => b[1] - a[1]);

  const followUps = outreach.filter((o) => o.followUpDate);
  const jobsWithMail = jobs.filter((j) => j.mail).length;
  const jobsWithCareerPage = jobs.filter((j) => j.careerPage).length;

  return (
    <div className="mt-6 space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Jobs tracked" value={n} icon={<BriefcaseBusiness className="size-4" />} />
        <MetricCard label="Offers / hires" value={`${offers} / ${hired}`} icon={<CircleCheck className="size-4" />} />
        <MetricCard label="Outreach contacts" value={outreach.length} icon={<Mail className="size-4" />} />
        <MetricCard label="Follow-ups due" value={followUps.length} icon={<Send className="size-4" />} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.85fr)]">
        <Panel eyebrow="Funnel" title="Job application funnel" description="Cumulative jobs that reached each stage. Each bar is out of everything tracked.">
          <div className="mt-5 space-y-3.5">
            <FunnelRow label="Applied" count={applied} total={n} tone="bg-sky-400" />
            <FunnelRow label="Responded" count={responded} total={n} tone="bg-cyan-400" />
            <FunnelRow label="Assessment" count={jobs.filter(j => j.status === "ASSESSMENT" || j.status === "INTERVIEW" || j.status === "OFFER" || j.status === "HIRED").length} total={n} tone="bg-emerald-400" />
            <FunnelRow label="Interview" count={interviews} total={n} tone="bg-amber-400" />
            <FunnelRow label="Offer" count={offers} total={n} tone="bg-brand" />
            <FunnelRow label={TERMINAL_OK} count={hired} total={n} tone="bg-brand" />
          </div>
          <div className="mt-5 border-t border-border pt-4 text-xs text-muted">
            <span className="tabular-nums text-foreground">{statusCount("REJECTED")}</span> rejected · <span className="tabular-nums text-foreground">{statusCount("DISCARDED")}</span> discarded · <span className="tabular-nums text-foreground">{statusCount("SKIP")}</span> skipped
          </div>
        </Panel>

        <Panel eyebrow="Rates" title="Conversion that matters" description="Applied is the denominator for response rate; responded for interview rate.">
          <div className="mt-5 grid grid-cols-2 gap-3">
            <RateTile label="Apply rate" value={applyRate} />
            <RateTile label="Response rate" value={responseRate} />
            <RateTile label="Interview rate" value={interviewRate} />
            <RateTile label="Offer rate" value={offerRate} />
            <RateTile label="Hire rate" value={hireRate} />
            <RateTile label="Outreach coverage" value={n ? (outreach.length / n) * 100 : 0} />
          </div>
          <div className="mt-5 border-t border-border pt-4 text-xs text-muted">
            <span className="tabular-nums text-foreground">{jobsWithCareerPage}/{n}</span> jobs have a careers page · <span className="tabular-nums text-foreground">{jobsWithMail}/{n}</span> jobs have a contact mail
          </div>
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel eyebrow="Jobs" title="Status mix" description="How jobs are distributed across statuses.">
          <div className="mt-5 space-y-3">
            {statusEntries.map(([label, count]) => (
              <BarRow key={label} label={label} count={count} total={n} />
            ))}
          </div>
        </Panel>

        <Panel eyebrow="Jobs" title="Source mix" description="Where your tracked jobs came from.">
          <div className="mt-5 space-y-3">
            {sourceEntries.map(([label, count]) => (
              <BarRow key={label} label={label} count={count} total={n} />
            ))}
          </div>
        </Panel>

        <Panel eyebrow="Outreach" title="Channel mix" description="How you reached out to contacts.">
          <div className="mt-5 space-y-3">
            {channelEntries.map(([label, count]) => (
              <BarRow key={label} label={label} count={count} total={outreach.length} />
            ))}
          </div>
        </Panel>

        <Panel eyebrow="Outreach" title="Response mix" description="Responses received from outreach.">
          <div className="mt-5 space-y-3">
            {responseEntries.map(([label, count]) => (
              <BarRow key={label} label={label} count={count} total={outreach.length} />
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <ActionList icon={CalendarClock} title="Interviews" count={interviews} empty="No interviews yet" rows={jobs.filter((j) => ["INTERVIEW", "OFFER", "HIRED"].includes(j.status)).map((j) => ({ label: `${j.company} · ${j.role}`, date: j.date }))} tone="sky" />
        <ActionList icon={ClipboardCheck} title="Assignments" count={jobs.filter((j) => j.status === "ASSESSMENT").length} empty="No assignments pending" rows={jobs.filter((j) => j.status === "ASSESSMENT").map((j) => ({ label: `${j.company} · ${j.role}`, date: j.date }))} tone="amber" />
        <ActionList icon={Phone} title="Follow-ups" count={followUps.length} empty="No follow-ups due" rows={followUps.map((o) => ({ label: `${o.company} · ${o.contactPerson || o.roles || "outreach"}`, date: o.followUpDate }))} tone="emerald" />
      </div>
    </div>
  );
}

function countBy(items: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of items) out[item] = (out[item] || 0) + 1;
  return out;
}

function FunnelRow({ label, count, total, tone }: { label: string; count: number; total: number; tone: string }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 shrink-0 text-xs text-muted">{label}</span>
      <div className="h-6 flex-1 overflow-hidden rounded-md bg-surface-2">
        <div className={`flex h-full items-center justify-end rounded-md px-2 ${tone}`} style={{ width: `${Math.max(pct, count > 0 ? 6 : 0)}%` }}>
          {count > 0 && <span className="text-[10px] font-semibold text-background">{count}</span>}
        </div>
      </div>
      <span className="w-10 text-right text-xs tabular-nums text-foreground">{pct.toFixed(0)}%</span>
    </div>
  );
}

function RateTile({ label, value }: { label: string; value: number }) {
  const pct = Number.isFinite(value) ? Math.round(value) : 0;
  return (
    <div className="rounded-xl border border-border bg-surface/40 px-3 py-3">
      <p className="text-[11px] uppercase tracking-wide text-faint">{label}</p>
      <p className="mt-1 text-xl font-display tabular-nums text-landing">{pct}%</p>
    </div>
  );
}

function BarRow({ label, count, total }: { label: string; count: number; total: number }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-28 shrink-0 truncate text-xs text-muted" title={label}>{label}</span>
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 text-right text-xs tabular-nums text-foreground">{count}</span>
    </div>
  );
}

function ActionList({ icon: Icon, title, count, empty, rows, tone }: { icon: React.ComponentType<{ className?: string }>; title: string; count: number; empty: string; rows: { label: string; date?: string }[]; tone: "sky" | "amber" | "emerald" }) {
  const toneClasses = {
    sky: "bg-sky-400/10 text-sky-500",
    amber: "bg-amber-400/10 text-amber-600 dark:text-amber-400",
    emerald: "bg-emerald-400/10 text-emerald-600 dark:text-emerald-400",
  }[tone];
  return (
    <div className="rounded-2xl border border-border bg-surface/30 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className={`inline-flex size-8 items-center justify-center rounded-lg ${toneClasses}`}><Icon className="size-4" /></span>
          <h3 className="text-sm font-medium text-foreground">{title}</h3>
        </div>
        <span className="text-xs tabular-nums text-muted">{count}</span>
      </div>
      <div className="mt-3 grid gap-2">
        {rows.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-surface/20 px-3 py-3 text-center text-xs text-muted">{empty}</p>
        ) : rows.map((r, i) => (
          <div key={i} className="flex items-center justify-between gap-2 rounded-xl border border-border bg-surface/40 px-3 py-2 text-xs">
            <span className="truncate text-foreground" title={r.label}>{r.label}</span>
            {r.date && <span className="shrink-0 text-faint">{r.date}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
