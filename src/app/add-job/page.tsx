import { JobAdder } from "@/components/job-adder";
import { OutreachAdder } from "@/components/outreach-adder";

export const dynamic = "force-dynamic";

export default function AddJobPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <JobAdder />
      <OutreachAdder />
    </main>
  );
}
