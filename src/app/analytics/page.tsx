import { TrackersView } from "@/components/analytics-trackers";
import { PageFrame } from "@/components/page-frame";

export const dynamic = "force-dynamic";

export default function Analytics() {
  return (
    <PageFrame>
      <div className="flex items-end justify-between gap-4 border-b border-border pb-5">
        <div>
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-text">Operations / Analytics</p>
          <h1 className="mt-2 font-display text-3xl tracking-tight text-landing sm:text-4xl">Your search intelligence</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            Metrics from your job tracker and outreach tracker — funnel, conversion rates, mixes and what needs you.
          </p>
        </div>
      </div>
      <TrackersView />
    </PageFrame>
  );
}
