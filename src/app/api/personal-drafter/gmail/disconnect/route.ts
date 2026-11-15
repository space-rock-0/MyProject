import { disconnect } from "@/lib/pd-gmail.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  await disconnect();
  return Response.json({ ok: true });
}
