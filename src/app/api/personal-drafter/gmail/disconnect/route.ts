import { disconnect } from "@/lib/pd-gmail.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  disconnect();
  return Response.json({ ok: true });
}
