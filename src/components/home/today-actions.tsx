import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import { BriefcaseBusiness, CalendarClock, ClipboardList, Mail, Phone, Send, Users, Bell, ClipboardCheck, Sparkles } from "lucide-react";
import { HeroGlow } from "@/components/hero-glow";
import { PageFrame } from "@/components/page-frame";

type JobRow = { id: number; company: string; role: string; status: string; date?: string; jobLink?: string };
type OutreachRow = { id: number; company: string; roles?: string; followUpDate?: string; response?: string; email?: string; phone?: string; outreachChannel?: string };

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

export function TodayActions() {
  const jobs: JobRow[] = readJson("job-tracker.json");
  const outreach: OutreachRow[] = readJson("outreach-tracker.json");

  const interviews = jobs.filter((j) => j.status === "INTERVIEW");
  const assignments = jobs.filter((j) => j.status === "ASSESSMENT");
  const followUps = outreach.filter((o) => o.followUpDate);

  const dateLabel = new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <section className="dot-bg relative overflow-hidden rounded-2xl border border-border bg-surface/40 px-7 py-10 md:px-10 md:py-12">
        <HeroGlow />
        {/* Readability scrim between the animated glow (z-0) and the copy (z-10). */}
        <div aria-hidden className="pointer-events-none absolute inset-0 z-[1] bg-surface/55 backdrop-blur-[2px] dark:bg-background/45" />
        <div className="relative z-10">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted">
            <span className="text-faint">//</span> today · <span className="tabular-nums">{dateLabel}</span>
          </p>
          <h1 className="mt-3 font-display text-4xl leading-[1.05] text-landing md:text-5xl">
            Your job is waiting.
          </h1>
          <p className="mt-4 max-w-xl text-sm text-muted">
            Your actions for today — track, outreach and follow, in one place.
          </p>
          <div className="mt-6 flex flex-wrap gap-2.5">
            <Link href="/add-job" className="inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-brand-foreground transition hover:bg-brand-200 max-sm:min-h-[44px]">
              <ClipboardList className="size-4" /> Add new Job
            </Link>
            <Link href="/add-job" className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm font-medium text-foreground transition hover:border-brand/40 hover:text-brand-text max-sm:min-h-[44px]">
              <Mail className="size-4" /> Add new outreach
            </Link>
            <Link href="/job-tracker" className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm font-medium text-foreground transition hover:border-brand/40 hover:text-brand-text max-sm:min-h-[44px]">
              <BriefcaseBusiness className="size-4" /> Open Job Tracker
            </Link>
          </div>
        </div>
      </section>

      <section className="mt-10">
        <div className="mb-3 flex items-center gap-2">
          <Bell className="size-4 text-brand-text" />
          <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-muted">Awaiting your Action</h2>
          <span className="text-xs text-faint">· interviews, assignments and follow-ups</span>
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          <ActionPanel icon={CalendarClock} title="Upcoming interviews" hint="From your job tracker" tone="sky">
            {interviews.length === 0 ? (
              <EmptyLine text="No interviews scheduled yet" />
            ) : interviews.map((j) => (
              <ActionRow key={j.id} company={j.company} role={j.role} date={j.date} link={j.jobLink} />
            ))}
          </ActionPanel>

          <ActionPanel icon={ClipboardCheck} title="Upcoming assignments" hint="Take-homes & assessments" tone="amber">
            {assignments.length === 0 ? (
              <EmptyLine text="No assignments pending" />
            ) : assignments.map((j) => (
              <ActionRow key={j.id} company={j.company} role={j.role} date={j.date} link={j.jobLink} />
            ))}
          </ActionPanel>

          <ActionPanel icon={Send} title="Upcoming follow-ups" hint="From your outreach tracker" tone="emerald">
            {followUps.length === 0 ? (
              <EmptyLine text="No follow-ups due" />
            ) : followUps.map((o) => (
              <div key={o.id} className="rounded-xl border border-border bg-surface/40 px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-foreground">{o.company}</span>
                  {o.followUpDate && <span className="text-xs text-faint tabular-nums">{o.followUpDate}</span>}
                </div>
                {o.roles && <p className="mt-0.5 text-xs text-muted truncate" title={o.roles}>{o.roles}</p>}
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted">
                  {o.outreachChannel && <span className="inline-flex items-center gap-1"><Mail className="size-3" />{o.outreachChannel}</span>}
                  {o.response && <span className="inline-flex items-center gap-1"><Sparkles className="size-3" />{o.response}</span>}
                  {o.phone && <span className="inline-flex items-center gap-1"><Phone className="size-3" />{o.phone}</span>}
                </div>
              </div>
            ))}
          </ActionPanel>
        </div>
      </section>

      <section className="mt-10">
        <div className="mb-3 flex items-center gap-2">
          <Users className="size-4 text-brand-text" />
          <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-muted">Snapshot</h2>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Jobs tracked" value={jobs.length} />
          <StatCard label="In interviews" value={interviews.length} />
          <StatCard label="Assignments" value={assignments.length} />
          <StatCard label="Outreach contacts" value={outreach.length} />
        </div>
      </section>
    </div>
  );
}

function ActionPanel({ icon: Icon, title, hint, tone, children }: { icon: React.ComponentType<{ className?: string }>; title: string; hint: string; tone: "sky" | "amber" | "emerald"; children: React.ReactNode }) {
  const toneClasses = {
    sky: "bg-sky-400/10 text-sky-500",
    amber: "bg-amber-400/10 text-amber-600 dark:text-amber-400",
    emerald: "bg-emerald-400/10 text-emerald-600 dark:text-emerald-400",
  }[tone];
  return (
    <div className="rounded-2xl border border-border bg-surface/30 p-4">
      <div className="flex items-center gap-2.5">
        <span className={`inline-flex size-8 items-center justify-center rounded-lg ${toneClasses}`}>
          <Icon className="size-4" />
        </span>
        <div>
          <h3 className="text-sm font-medium text-foreground">{title}</h3>
          <p className="text-xs text-faint">{hint}</p>
        </div>
      </div>
      <div className="mt-3 grid gap-2">{children}</div>
    </div>
  );
}

function ActionRow({ company, role, date, link }: { company: string; role: string; date?: string; link?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface/40 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-foreground">{company}</span>
        {date && <span className="text-xs text-faint tabular-nums">{date}</span>}
      </div>
      <p className="mt-0.5 text-xs text-muted">{role}</p>
      {link && <a href={link} target="_blank" rel="noreferrer" className="mt-1.5 inline-flex items-center gap-1 text-xs text-brand-text hover:underline">Open link <span aria-hidden>↗</span></a>}
    </div>
  );
}

function EmptyLine({ text }: { text: string }) {
  return <p className="rounded-xl border border-dashed border-border bg-surface/20 px-3 py-4 text-center text-xs text-muted">{text}</p>;
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border bg-surface/40 px-4 py-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-2xl font-display tabular-nums text-landing">{value}</p>
    </div>
  );
}
