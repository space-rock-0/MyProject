import { readJsonObject } from "@/lib/json-body";
import { LLMError } from "@/lib/pd-llm.mjs";
import { makeForm } from "@/lib/pd-generate.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  const body = await readJsonObject(req);
  if (!body) return Response.json({ error: "bad json" }, { status: 400 });
  try {
    return Response.json(await makeForm(body));
  } catch (e) {
    if (e instanceof LLMError) return Response.json({ error: e.message }, { status: e.status });
    return Response.json({ error: e instanceof Error ? e.message : "failed" }, { status: 502 });
  }
}
